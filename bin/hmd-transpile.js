#!/usr/bin/env node
"use strict";

const parseArgs = require('minimist')
const glob = require('glob')
const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const { PBEContext } = require('../lib/pbe')
const transpile = require('../lib/transpile')
const mergeSourceMap = require('merge-source-map')

function printHelp() {
  console.log(`hmd-transpile -- Transpile ES6 Modules into ES5 UMD modules, with Buble and Arcon!

  Usage:  hmd-transpile [arguments] PATTERN [PATTERN2 PATTERN3 ...]

    where PATTERN is a minimatch pattern to match file names.

  -h          show help
  -o OUTDIR   output to directory. default: "dist"
  -m FILE     path to manifest. default: "pbe.manifest.json"
  --map       generate sourceMap. disabled by default
  `)
  process.exit(1)
}

const argv = parseArgs(process.argv.slice(2))
if (!argv._.length || argv.h || argv.help) printHelp()

//----------------------------------------------

const pbeContext = new PBEContext()
const outdir = argv.o || "dist"
const sourceMap = !!argv.map
if (!fs.existsSync(outdir)) mkdirp.sync(outdir)

pbeContext.loadManifest(argv.m || "pbe.manifest.json")

let files = []
for (const pattern of argv._) files = files.concat(glob.sync(pattern))
for (let i = 0; i < files.length; i++) {
  const file = files[i]
  const outFilename = path.join(outdir, file)
  mkdirp.sync(path.dirname(outFilename))

  const pbeExportDest = pbeContext.getPbeExportDest(file)
  const pbeResolver = pbeContext.getPbeResolverFor(file)

  const transpiled = transpile.transpile(file, pbeExportDest, pbeResolver, sourceMap, outFilename)
  fs.writeFileSync(outFilename, transpiled.code)

  if (sourceMap) {
    const maps = transpiled.maps.slice(1)
    let map = transpiled.maps[0]
    while (maps.length) map = mergeSourceMap(map, maps.shift())

    fs.writeFileSync(outFilename + ".map", JSON.stringify(map))
  }
}