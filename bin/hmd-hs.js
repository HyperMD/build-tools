#!/usr/bin/env node
"use strict";

const parseArgs = require('minimist')
const opn = require('opn')
const express = require('express')

function printHelp() {
  console.log(`hmd-hs -- Dumb HTTP Server

  Usage:  hmd-hs [ARGUMENTS]

  -s          do not open browser window
  -d DIR      set root directory (default: cwd())
  -p PORT     set http port (default: 8000)
  -o URI      the url to open (default: "/" )
  `)
  process.exit(1)
}

const argv = parseArgs(process.argv.slice(2))
if (argv.h || argv.help) printHelp()

const needOpn = !argv.s
const rootDir = argv.d || process.cwd()
const port = parseInt(argv.p || 8000)
const httpUrl = `http://127.0.0.1:${port}`

const app = express()
app.use(express.static(rootDir))
app.listen(port, () => console.log(`${httpUrl} is now ready`))

if (needOpn) {
  const uri = argv.o || "/"
  if (uri[0] !== '/') uri = '/' + uri
  opn(httpUrl + uri)
}
