import * as FooBar from "foobar"
import SubDefault from "foobar/submodule"
import { readdirSync } from "fs"

export function exec() {
  let a = readdirSync("xxyy")
  return FooBar.proc(() => SubDefault(a))
}

exec()
