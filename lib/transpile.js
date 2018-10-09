const fs = require('fs')
const buble = require('buble')
const utils = require('./utils')
const acorn = require('acorn');
const MagicString = require('magic-string').default;

exports.bubleConfig = {
  transforms: {
    modules: false,
    dangerousForOf: true
  },

  // prevent function expressions generated from class methods
  // from being given names – needed to prevent scope leak in IE8
  namedFunctionExpressions: false,
}

const PATCH_MARK = '//[HyperMD] UMD patched!'

/**
 * Use buble to transpile code, then transform ES6 imports into UMD declarations
 * @param {string} filename
 * @param {string | false} exportPBE eg: `this.HyperMD` or `false` if not want to export anything in plain browser env
 * @param {(path: string) => string} pbeResolver eg. `pbeResolver("codemirror") === "this.CodeMirror"`
 */
exports.transpile = function (filename, exportPBE, pbeResolver, output_filename) {
  let sourceCode = fs.readFileSync(filename, "utf-8")

  if (sourceCode.includes(PATCH_MARK)) return { skipped: true }

  const maps = []
  if (fs.existsSync(filename + '.map')) {
    maps.push(JSON.parse(fs.readFileSync(filename + '.map', 'utf-8')))
  }

  const bubleConfig = {
    ...exports.bubleConfig,

    source: filename,
  }
  const bubleResult = buble.transform(sourceCode, bubleConfig)
  maps.push(bubleResult.map)
  sourceCode = bubleResult.code

  if (sourceCode.includes('@hypermd not module')) return {
    code: bubleResult.code,
    maps
  }

  let tmp = /@hypermd as (\S+)/.exec(sourceCode)
  if (tmp) exportPBE = utils.umdGetPlainEnvExports(tmp[1])

  const code = new MagicString(sourceCode)
  const ast = acorn.parse(sourceCode, { sourceType: "module" })

  if (!ast.body.length) return { skipped: true }

  ///////////////////////////////////////////////////////
  // find and remove/modify all es6 import/export stmts

  let insertPoint = ast.body[0].start

  /**
   * @typedef {Object} ImportInfo
   * @property {string[]} namespace
   * @property {string[]} default
   * @property {Record<string, string>} specifiers
   * @property {boolean} exportAll
   * @property {acorn.ExportNamedDeclaration[]} exportAs
   */

  /** @type {Record<string, ImportInfo>} */
  const imports = {
    // "./foo": {
    //   namespace: ["Foo"],  // import * as Foo from "./foo"
    //   default: ["FooDef"],  // import FooDef from "./foo"
    //   exportAll: false,   // export * from "./foo"
    //   specifiers: { // import { A as NewName, B } from "./foo"
    //     NewName: "A",
    //     B: "B",
    //   },
    // }
  }

  /** @type {Record<string, string>} */
  const moduleExports = {}

  function getImportInfo(path) {
    let info = imports[path]
    if (!info) {
      info = imports[path] = {
        namespace: [],
        default: [],
        exportAll: false,
        exportAs: [],
        specifiers: {},
      }
    }
    return info
  }

  for (let node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      const info = getImportInfo(node.source.value)

      for (const specifier of node.specifiers) {
        if (specifier.type === 'ImportSpecifier') info.specifiers[specifier.local.name] = specifier.imported.name
        if (specifier.type === 'ImportDefaultSpecifier') info.default.push(specifier.local.name)
        if (specifier.type === 'ImportNamespaceSpecifier') info.namespace.push(specifier.local.name)
      }

      code.remove(node.start, node.end)
    }

    if (node.type === 'ExportDefaultDeclaration') {
      const { declaration } = node
      if (['Identifier', 'Literal', 'ObjectExpression', 'ArrowFunctionExpression', 'CallExpression'].includes(declaration.type)) {
        code.overwrite(node.start, declaration.start, "exports.default =")
      } else if (declaration.type === 'FunctionDeclaration') {
        code.remove(node.start, declaration.start)
        code.appendRight(declaration.end, `\nexports.default = ${declaration.id.name};`)
      } else {
        throw new Error("Unknown default export: " + sourceCode.slice(node.start, node.end))
      }
    }

    if (node.type === 'ExportNamedDeclaration') {
      const { declaration, specifiers } = node
      if (declaration) {
        if (declaration.type === 'FunctionDeclaration') {
          code.remove(node.start, declaration.start)
          moduleExports[declaration.id.name] = declaration.id.name
        } else if (declaration.type === 'VariableDeclaration') {
          code.remove(node.start, declaration.start)
          for (const v of declaration.declarations) moduleExports[v.id.name] = v.id.name
        } else {
          throw new Error("Unknown named export: " + sourceCode.slice(node.start, node.end))
        }
      }

      if (specifiers && specifiers.length) {
        if (node.source) { // export { xxx } from "yyy"
          getImportInfo(node.source.value).exportAs.push(node)
          code.remove(node.start, node.end)
        } else {  // export { xxx }
          for (const specifier of specifiers) {
            moduleExports[specifier.exported.name] = specifier.local.name
          }
          code.remove(node.start, node.end)
        }
      }
    }

    if (node.type === 'ExportAllDeclaration') {
      getImportInfo(node.source.value).exportAll = true
      code.remove(node.start, node.end)
    }
  }

  ///////////////////////////////////////////////////////
  // generate components

  let plainImports = [] // modules have no binding namespace/specifier/default.
  let normalImports = []
  let factoryArguments = ["exports"]
  let assigns = [] // "NewB = _$MOD1.B", "C = _$MOD1"
  let finalExportLines = [] // "exports.foo = bar;"

  for (const mod in imports) {
    const item = imports[mod]
    if (
      !item.default.length &&
      !item.namespace.length &&
      !item.exportAs.length &&
      !item.exportAll &&
      !Object.keys(item.specifiers).length
    ) {
      plainImports.push(mod)
      continue
    }

    const modVariable = item.namespace[0] || `_$MOD${normalImports.length}`
    normalImports.push(mod)
    factoryArguments.push(modVariable)

    // export * from "./foo";
    if (item.exportAll) {
      finalExportLines.push(`for (var __exp in ${modVariable}) exports[__exp] = ${modVariable}[__exp];`)
    }

    // export { xx, yy } from "./foo";
    for (const node of item.exportAs) {
      for (const specifier of node.specifiers) {
        finalExportLines.push(`exports.${specifier.exported.name} = ${modVariable}.${specifier.local.name};`)
      }
    }

    for (const name of item.default) assigns.push(`${name} = ${modVariable}.default`)
    for (const name of item.namespace.slice(1)) assigns.push(`${name} = ${modVariable}`)
    for (const newName in item.specifiers) assigns.push(`${newName} = ${modVariable}.${item.specifiers[newName]}`)
  }

  // named exports
  for (const key in moduleExports) {
    finalExportLines.push(`exports.${key} = ${moduleExports[key]};`)
  }

  let common_str = [...normalImports, ...plainImports].map(mod => `require(${JSON.stringify(mod)})`).join(", ")
  common_str = "exports" + (common_str && ", ") + common_str

  let amd_str = JSON.stringify(["exports", ...normalImports, ...plainImports])

  let pbe_str = exportPBE || "{}"
  for (const modPath of normalImports) pbe_str += ", " + (pbeResolver(modPath) || "null")

  let assigns_str = assigns.length ? ("var " + assigns.join(", ") + ";") : ""


  ///////////////////////////////////////////////////////
  // Now screw up the code

  code.appendLeft(insertPoint, `
(function (mod){ ${PATCH_MARK}
  /*commonjs*/  ("object"==typeof exports&&"undefined"!=typeof module) ? mod(${common_str}) :
  /*amd*/       ("function"==typeof define&&define.amd) ? define(${amd_str}, mod) :
  /*plain env*/ mod(${pbe_str});
})(function (${factoryArguments.join(", ")}) {
  `)

  if (assigns_str) code.appendLeft(insertPoint, assigns_str)

  code.append(`\n${finalExportLines.join("\n")}\n});\n`)

  maps.push(code.generateMap({ source: filename }))

  return {
    code: code.toString(),
    maps,
  }
}