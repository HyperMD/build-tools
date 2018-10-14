const fs = require('fs')
const path = require('path')
const minimatch = require("minimatch")
const utils = require('./utils')

function readFile(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf-8"))
}

class PBEContext {
  constructor() {
    this.lookupTable = {}
    this.matchRules = []
    this.baseDir = process.cwd()
  }

  getPbeExportDest(filename) {
    let relToBaseDir = utils.getRelativePath(filename, this.baseDir).replace(/\.js$/, '')
    return utils.umdGetPlainEnvExports(this.lookupTable[relToBaseDir])
  }

  getPbeResolverFor(currentFilename) {
    let resolveBase = path.dirname(currentFilename).replace(/\\/g, '/')

    return (modulePath) => {
      if (modulePath.charAt(0) === '.') {
        modulePath = utils.getRelativePath(
          path.resolve(resolveBase, modulePath),
          this.baseDir
        ).replace(/\.js$/, '')
      }

      let ans = this.lookupTable[modulePath]

      if (!ans) {
        for (const it of this.matchRules) {
          if (it.tester.match(modulePath)) {
            ans = it.value
            break
          }
        }
      }

      if (ans === null || ans === false) ans = "null"

      if (!ans) {
        console.warn(`[WARN] Module "${modulePath}" cannot be resolved in plain browser env.\n       If it's intended, update pbe.manifest.json and append "${modulePath}": false\n       Found in ${currentFilename}`)
        ans = "null"
      }

      return ans
    }
  }

  addRule(name, value) {
    if (/[\*\?]/.test(name)) this.matchRules.push({ tester: new minimatch.Minimatch(name), value })
    else this.lookupTable[name] = value
  }

  getWebpackExternalsFunction() {
    return (context, request, callback) => {
      let ea = this.lookupTable[request]
      if (!ea) return callback()

      callback(null, {
        commonjs: request,
        commonjs2: request,
        amd: request,
        root: ea.split("."),
      })
    }
  }

  loadManifest(filename) {
    const manifest = readFile(filename)

    for (const n in manifest.path) this.addRule(n, manifest.path[n])
    for (const n in manifest.external) this.addRule(n, manifest.external[n])

    if ('import' in manifest) {
      for (const mod in manifest.import) {
        const importPath = path.resolve(path.dirname(filename), manifest.import[mod])
        const importedManifest = readFile(importPath)
        for (const rawPath in importedManifest.path) {
          const modName = mod + rawPath.slice(1) // remove leading dot of "./xxx"
          this.addRule(modName, importedManifest.path[rawPath])
        }
      }
    }
  }
}
exports.PBEContext = PBEContext