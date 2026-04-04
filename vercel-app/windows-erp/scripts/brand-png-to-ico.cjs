'use strict'
/**
 * ICO — 256 BMP 제외(용량 ~280KB → 수만 바이트). 작업 표시줄·창 아이콘용 64~16만 포함.
 * cwd: windows-erp (png-to-ico / pngjs 는 이 패키지 devDependencies).
 */
const fs = require('fs')
const path = require('path')
const { PNG } = require('pngjs')
const pngToIco = require('png-to-ico')
const pngIcoRoot = path.dirname(require.resolve('png-to-ico/package.json'))
const { readPNG, resize } = require(path.join(pngIcoRoot, 'lib', 'png'))

const input = process.argv[2]
const out = process.argv[3]
if (!input || !out) {
  console.error('usage: node scripts/brand-png-to-ico.cjs <input.png> <out.ico>')
  process.exit(2)
}
if (!fs.existsSync(input)) {
  console.error('missing input:', input)
  process.exit(1)
}

const absIn = path.resolve(input)
const absOut = path.resolve(out)

const ICO_SIZES = [64, 48, 32, 16]

readPNG(absIn)
  .then((png) => {
    if (png.width !== png.height) {
      const err = new Error('Please give me a square PNG image.')
      err.code = 'ESIZE'
      throw err
    }
    const base = png.width !== 256 ? resize(png, 256, 256) : png
    const buffers = ICO_SIZES.map((s) => PNG.sync.write(resize(base, s, s)))
    return pngToIco(buffers)
  })
  .then((buf) => {
    fs.writeFileSync(absOut, buf)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
