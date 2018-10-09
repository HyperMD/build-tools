#!/usr/bin/env node
"use strict";

const fs = require('fs')
const path = require('path')
const { Minimatch } = require('minimatch')
const { Proc } = require('../lib/proc')
const parseArgs = require('minimist')
const chalk = require('chalk').default

function printHelp() {
  console.log(`hmd-run -- run npm scripts in parallel

  Usage:  hmd-run NAME [NAME ...]

    where NAME can be something like
    npm:build   npm:build-*   tsc   "rollup -c"

  `)
  process.exit(1)
}

const argv = parseArgs(process.argv.slice(2))
if (!argv._.length || argv.h || argv.help) printHelp()

const procs = []
const exeSuffix = process.platform === 'win32' ? '.cmd' : ''
const npmExe = 'npm' + exeSuffix

const rootDir = process.cwd()
const binDir = path.join(rootDir, "node_modules/.bin")
const packageJSON = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf-8"))
const scriptNames = Object.keys(packageJSON.scripts || [])

// first, prepare all procs

for (const it of argv._) {
  if (it.slice(0, 4) === 'npm:') {
    // npm stuff
    const remains = it.slice(4)
    if (remains.includes('*')) {
      const matcher = new Minimatch(remains)
      for (const scriptName of scriptNames) {
        if (matcher.match(scriptName)) {
          procs.push(new Proc("npm:" + scriptName, [npmExe, "run", scriptName]))
        }
      }
    } else {
      procs.push(new Proc(it, [npmExe, "run", remains]))
    }
  } else {
    // normal command
    const args = it.split(/\s+/g)
    const nodeModuleBinName = path.join(binDir, args[0] + exeSuffix)
    if (fs.existsSync(nodeModuleBinName)) args[0] = nodeModuleBinName
    procs.push(new Proc(it.match(/^\S+/)[0], args))
  }
}

// then do whatever it requires

for (const proc of procs) {
  proc.start()
  proc.on('exit', code => {
    if (code !== 0) suitcide(code)
  })
}

function suitcide(code) {
  for (const proc of procs) {
    proc.kill()
  }
  console.error(chalk.redBright("hmd-run exit with code " + code))
  process.exit(code)
}
