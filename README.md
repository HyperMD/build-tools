# HyperMD Build Tools

- `hmd-transpile` -- Transpile ES6 Modules into ES5 UMD modules, with [Buble][] and [Arcon][]!

## Why This?

[HyperMD][] aims to be modulized and always available in:

1. Module Loader (AMD and CommonJS)
2. ~~quick and dirty~~ Plain Browser Environment

Bundlers like [webpack][] and [rollup][] support UMD mode, but the bundled file is unfriendly to the coming extensions / addons. Have a glace at addons / modes etc. of [CodeMirror 5](https://github.com/codemirror/CodeMirror) and you will know what I am talking -- they are all handwritten ES5 UMD modules.

It's 2018 now, we write modules in ES6. With `hmd-transpile` and a manifest file, you can generate the ES5 UMD version of your modules on-the-fly.

## The `pbe.manifest.json`

This file describes all related module's name in plain browser env. Here is an example:

**First, in `your_project/pbe.manifest.json`**

```json
{
  "version": 1,
  "path": {
    "./my_module": "MyModule",
    "./**/*.css": false
  },
  "external": {
    "lodash": "_",
    "jquery": "$"
  },
  "import": {
    "lodash": "./path_to_lodash/pbe.manifest.json"
  }
}
```

**And, in `your_project/path_to_lodash/pbe.manifest.json`**

```json
{
  "version": 1,
  "path": {
    "./debounce": "_.debounce"
  }
}
```

Note:

- in `path`, all file paths are relative to project dir.
- `.js` suffix is omitted.
- glob pattern is supported in `path` and `external` fields

Once `hmd-transpile` transpiled your `my_module.js`, you can use it in any environment, including module loader and **Plain Browser Environment**!

In Plain Browser Environment:

- Write `<script src="./dist/my_module.js">` and a global variable `MyModule` will present.
- The debounce function, which is imported via `import debounce from "lodash/debounce"`, is now `_.debounce` (where `_` is a global variable)

## Annotation

You can add an annotation in your `.js` file to change `hmd-transpile`'s behavior:

- `/** @hypermd as FooBar.XXYY */` -- in plain browser env, export as global variable `FooBar.XXYY`
- `/** @hypermd not module */` -- do not transpile this file to UMD module. But Buble will still work.

------------------

[buble]: https://buble.surge.sh/
[arcon]: https://github.com/acornjs/acorn
[hypermd]: https://laobubu.net/HyperMD/
[webpack]: http://webpack.js.org/
[rollup]: https://rollupjs.org/