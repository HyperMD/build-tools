const fs = require('fs')
const path = require('path')

/**
 *
 * @param {string} name something like
 * - HyperMD
 * - HyperMD.Foobar
 * - HyperMD.ABC.DEF
 * - `XXX["yyy"]`     **(Don't use `.` inside the name!)**
 * - `XXX.YYY["ZZZ"].BAR`
 *
 * @returns valid js expression. eg:
 *
 * `HyperMD.HAX` => `(this.HyperMD = this.HyperMD || {}, this.HyperMD.HAX = this.HyperMD.HAX || {})`
 */
function umdGetPlainEnvExports(name, prefix = "this") {
  if (!name) return '({})'

  var parts = name.replace(/['"]\]/g, '').split(/\.|\[['"]/g)
  // (this.HyperMD_PowerPack = this.HyperMD_PowerPack || {}, this.HyperMD_PowerPack["fold-math-with-katex"] = {})

  var ans = []

  for (const part of parts) {
    if (/^[a-zA-Z_]\w*$/.test(part)) prefix += "." + part
    else prefix += `["${part}"]`

    ans.push(`${prefix} = ${prefix} || {}`)
  }

  return `(${ans.join(", ")})`
}
exports.umdGetPlainEnvExports = umdGetPlainEnvExports

/**
 * Get relative path. Answer
 * @param {string} filename
 * @param {string} baseDir
 * @returns relPath always uses `/` (UNIX style path separator), and starts with `./` or `../`
 */
function getRelativePath(filename, baseDir) {
  let dir = path.dirname(filename)
  let relDir = path.relative(baseDir, dir).replace(/\\/g, '/')
  if (relDir.charAt(0) !== '.') relDir = './' + relDir
  if (relDir.slice(-1) !== '/') relDir += '/'
  return relDir + path.basename(filename)
}
exports.getRelativePath = getRelativePath

