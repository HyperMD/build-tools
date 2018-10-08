const fs = require('fs')
const buble = require('buble')
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

/**
 * Use buble to transpile code, then transform ES6 imports into UMD declarations
 * @param {string} filename
 * @param {string | false} exportPBE eg: `this.HyperMD` or `false` if not want to export anything in plain browser env
 * @param {(path: string) => string} pbeResolver eg. `pbeResolver("codemirror") === "this.CodeMirror"`
 */
exports.transpile = function (filename, exportPBE, pbeResolver, output_filename) {
  let sourceCode = fs.readFileSync(filename, "utf-8")

  const bubleConfig = {
    ...exports.bubleConfig,

    source: filename,
  }
  const bubleResult = buble.transform(sourceCode, bubleConfig)

  sourceCode = bubleResult.code

  const code = new MagicString(sourceCode)
  const ast = acorn.parse(sourceCode, { sourceType: "module" })

  ///////////////////////////////////////////////////////
  // find and remove/modify all es6 import/export stmts

  let insertPoint = ast.body[0].start

  /** @type {Record<string, { namespace: string[], default: string[], specifiers: Record<string, string> }>} */
  const imports = {
    // "./foo": {
    //   namespace: ["Foo"],  // import * as Foo from "./foo"
    //   default: ["FooDef"],  // import FooDef from "./foo"
    //   specifiers: { // import { A as NewName, B } from "./foo"
    //     NewName: "A",
    //     B: "B",
    //   },
    // }
  }

  for (let node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      const path = node.source.value
      let info = imports[path]
      if (!info) {
        info = imports[path] = {
          namespace: [],
          default: [],
          specifiers: {},
        }
      }

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
          code.appendRight(declaration.end, `\nexports.${declaration.id.name} = ${declaration.id.name};`)
        } else if (declaration.type === 'VariableDeclaration') {
          code.remove(node.start, declaration.start)
          code.appendRight(declaration.end, declaration.declarations.map(v => `\nexports.${v.id.name} = ${v.id.name};`).join(""))
        } else {
          throw new Error("Unknown named export: " + sourceCode.slice(node.start, node.end))
        }
      }

      if (specifiers && specifiers.length) {
        let newLines = []
        for (const specifier of specifiers) {
          newLines.push(`exports.${specifier.exported.name} = ${specifier.local.name};`)
        }
        code.overwrite(node.start, node.end, newLines.join("\n"))
      }
    }
  }

  ///////////////////////////////////////////////////////
  // generate components

  let plainImports = [] // modules have no binding namespace/specifier/default.
  let normalImports = []
  let factoryArguments = ["exports"]
  let assigns = [] // "NewB = _$MOD1.B", "C = _$MOD1"

  for (const mod in imports) {
    const item = imports[mod]
    if (!item.default.length && !item.namespace.length && !Object.keys(item.specifiers).length) {
      plainImports.push(mod)
      continue
    }

    const modVariable = item.namespace[0] || `_$MOD${normalImports.length}`
    normalImports.push(mod)
    factoryArguments.push(modVariable)

    for (const name of item.default) assigns.push(`${name} = ${modVariable}.default`)
    for (const name of item.namespace.slice(1)) assigns.push(`${name} = ${modVariable}`)
    for (const newName in item.specifiers) assigns.push(`${newName} = ${modVariable}.${item.specifiers[newName]}`)
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
(function (mod){ //[HyperMD] UMD patched!
  /*commonjs*/  ("object"==typeof exports&&"undefined"!=typeof module) ? mod(${common_str}) :
  /*amd*/       ("function"==typeof define&&define.amd) ? define(${amd_str}, mod) :
  /*plain env*/ mod(null, ${pbe_str});
})(function (${factoryArguments.join(", ")}) {
  `)

  if (assigns_str) code.appendLeft(insertPoint, assigns_str)

  code.append(`\n});\n`)

  return {
    code: code.toString(),
    maps: [
      bubleResult.map,
      code.generateMap({ source: filename })
    ],
  }
}