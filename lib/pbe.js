const fs = require('fs')
const path = require('path')
const utils = require('./utils')

function readFile(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf-8"))
}

class PBEContext {
  constructor() {
    this.externalModules = {}
    this.ownModules = {}
    this.baseDir = process.cwd()
  }

  getPbeExportDest(filename) {
    let relToBaseDir = utils.getRelativePath(filename, this.baseDir).replace(/\.js$/, '')
    return utils.umdGetPlainEnvExports(this.ownModules[relToBaseDir])
  }

  getPbeResolverFor(currentFilename) {
    let resolveBase = path.dirname(currentFilename).replace(/\\/g, '/')

    return (modulePath) => {
      let ans = this.externalModules[modulePath]

      if (!ans && modulePath.charAt(0) === '.') {
        let relToBaseDir = utils.getRelativePath(
          path.resolve(resolveBase, modulePath),
          this.baseDir
        ).replace(/\.js$/, '')
        ans = this.ownModules[relToBaseDir]
      }

      if (!ans) {
        console.warn(`Module "${modulePath}" in "${currentFilename}" cannot be resolved in plain browser env.`)
        ans = "null"
      }

      return ans
    }
  }

  loadManifest(filename) {
    const manifest = readFile(filename)
    Object.assign(this.ownModules, manifest.path)
    Object.assign(this.externalModules, manifest.external)

    if ('import' in manifest) {
      for (const mod in manifest.import) {
        const importPath = path.resolve(path.dirname(filename), manifest.import[mod])
        const importedManifest = readFile(importPath)
        for (const rawPath in importedManifest.path) {
          const modName = mod + rawPath.slice(1) // remove leading dot of "./xxx"
          this.externalModules[modName] = importedManifest.path[rawPath]
        }
      }
    }
  }
}
exports.PBEContext = PBEContext