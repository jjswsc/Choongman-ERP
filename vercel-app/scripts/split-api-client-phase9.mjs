import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const lib = path.join(__dirname, "..", "lib", "api-client")

function readLines(name) {
  return fs.readFileSync(path.join(lib, name), "utf8").split(/\r?\n/)
}

function writeModule(name, content) {
  fs.writeFileSync(path.join(lib, name), content.trimEnd() + "\n", "utf8")
}

function slice1(lines, start, end) {
  return lines.slice(start - 1, end).join("\n")
}

{
  const lines = readLines("thai-vat-filing.ts")
  const importBlock = `import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray, jsonAsPlainObject } from '../safe-api-json'
`

  writeModule(
    "thai-vat-ledger.ts",
    `/**
 * 태국 VAT·PP36·원천세·PND54 ledger API — thai-vat-filing.ts에서 분리 — move only
 */
${importBlock}
${slice1(lines, 8, 350)}
`
  )

  writeModule(
    "thai-pnd-filing.ts",
    `/**
 * 태국 PND·KT20K·연간 요약 API — thai-vat-filing.ts에서 분리 — move only
 */
${importBlock}
${slice1(lines, 351, 718)}
`
  )

  writeModule(
    "thai-corporate-tax-filing.ts",
    `/**
 * 태국 법인세·세무 readiness API — thai-vat-filing.ts에서 분리 — move only
 */
${importBlock}
${slice1(lines, 719, lines.length)}
`
  )

  writeModule(
    "thai-vat-filing.ts",
    `/**
 * 태국 VAT·세무 barrel — thai-vat-ledger · thai-pnd-filing · thai-corporate-tax-filing
 */
export * from './thai-vat-ledger'
export * from './thai-pnd-filing'
export * from './thai-corporate-tax-filing'
`
  )
}

{
  const lines = readLines("interior.ts")
  const importBlock = `import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'
`

  writeModule(
    "interior-projects.ts",
    `/**
 * 인테리어 프로젝트·일정·업체·레이아웃 API — interior.ts에서 분리 — move only
 */
${importBlock}
${slice1(lines, 7, 328)}
`
  )

  writeModule(
    "interior-materials-expense.ts",
    `/**
 * 인테리어 자재·비용·파일·주방·시방 API — interior.ts에서 분리 — move only
 */
${importBlock}
${slice1(lines, 329, lines.length)}
`
  )

  writeModule(
    "interior.ts",
    `/**
 * 인테리어 barrel — interior-projects · interior-materials-expense
 */
export * from './interior-projects'
export * from './interior-materials-expense'
`
  )
}

console.log("split-api-client-phase9: done")
