'use strict'
/**
 * 다중 크기 ICO (16~256) — Windows 바탕화면·작업 표시줄용.
 * cwd: windows-erp (png-to-ico 는 이 패키지 devDependencies).
 */
const fs = require('fs')
const path = require('path')

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

const pngToIco = require('png-to-ico')
const absIn = path.resolve(input)
const absOut = path.resolve(out)

pngToIco(absIn)
  .then((buf) => {
    fs.writeFileSync(absOut, buf)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
