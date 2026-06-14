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
  const lines = readLines("thai-tax-filing.ts")
  const importBlock = `import { apiFetch } from '../api/fetch'
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray, jsonAsPlainObject } from '../safe-api-json'
`

  writeModule(
    "accounting-periods.ts",
    `/**
 * 회계 기간·시산표·대사 API — thai-tax-filing.ts에서 분리 — move only
 */
${importBlock}
${slice1(lines, 8, 159)}
`
  )

  writeModule(
    "thai-vat-filing.ts",
    `/**
 * 태국 VAT·원천세·PND·법인세 API — thai-tax-filing.ts에서 분리 — move only
 */
${importBlock}
${slice1(lines, 160, 1094)}
`
  )

  writeModule(
    "accounting-workflow.ts",
    `/**
 * 회계 마감·워크플로·SSO 동기화 API — thai-tax-filing.ts에서 분리 — move only
 */
${importBlock}
${slice1(lines, 1096, lines.length)}
`
  )

  writeModule(
    "thai-tax-filing.ts",
    `/**
 * 태국 세무·회계 barrel — accounting-periods · thai-vat-filing · accounting-workflow
 */
export * from './accounting-periods'
export * from './thai-vat-filing'
export * from './accounting-workflow'
`
  )
}

console.log("split-api-client-phase5: done")
