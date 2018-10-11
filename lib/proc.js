const child_process = require('child_process')
const chalk = require('chalk').default
const { EventEmitter } = require('events')
const { Transform } = require('stream')

class LineTagger extends Transform {
  constructor(tag) {
    super()
    this.tag = tag
    this.nextChunkNeedTag = true
  }

  write(data) {
    let mark = this.tag
    let rawData = data.toString()

    let newData = rawData.replace(/(\r(?![\000-\031])|\n)/g, '$1' + mark)

    if (this.nextChunkNeedTag) newData = mark + newData
    this.nextChunkNeedTag = newData.slice(-mark.length) === mark
    if (this.nextChunkNeedTag) newData = newData.slice(0, -mark.length)

    this.unshift(newData)
  }
}

let __nc = [
  chalk.bgBlue.white,
  chalk.bgGreen.yellowBright,
  chalk.bgMagenta.white,
  chalk.bgWhite.black,
  chalk.bgCyanBright.black,
  chalk.bgYellowBright.black,
]
let __ncIdx = 0
function nextColor() {
  let ans = __nc[__ncIdx++]
  if (__ncIdx >= __nc.length) __ncIdx = 0
  return ans
}

class Proc extends EventEmitter {
  constructor(name, args) {
    super()
    this.name = name
    this.args = args
    this.running = false
    this.colorFn = nextColor()
  }

  start() {
    const proc = this.proc = child_process.spawn(this.args[0], this.args.slice(1), {
      shell: false
    })
    proc.stdin.end()
    proc.stdout.pipe(new LineTagger(this.colorFn(this.name) + " ")).pipe(process.stdout)
    proc.stderr.pipe(new LineTagger(this.colorFn(this.name) + chalk.bgRed(" "))).pipe(process.stderr)
    proc.on('exit', (code) => {
      this.running = false
      console.log(this.colorFn(this.name) + chalk[code ? 'redBright' : 'grey'](` exit with code ${code}`))
      this.emit('exit', code)
    })
    proc.on('error', (err) => {
      console.error(chalk.bgRed.white(this.name) + chalk.redBright(' process error...'))
      console.log(err)
      this.running = false
      this.emit('exit', -32767)
    })

    this.running = true
  }

  kill() {
    if (!this.running) return
    this.proc.kill()
    this.running = false
  }
}

exports.Proc = Proc
