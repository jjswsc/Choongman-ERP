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

const lines = readLines("admin.ts")
const importBlock = `import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsPlainObject, jsonAsStringArray, jsonAsArray } from '../safe-api-json'
import type { PaginatedList } from './types'
`

writeModule(
  "admin-notices.ts",
  `/**
 * 관리자 공지 API — admin.ts에서 분리 — move only
 */
${importBlock}
${slice1(lines, 8, 208)}

${slice1(lines, 415, 498)}
`
)

writeModule(
  "admin-hr-policies.ts",
  `/**
 * 인사 규정 API — admin.ts에서 분리 — move only
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import type { NoticeReaderStatsRow } from './admin-notices'

${slice1(lines, 212, 413)}
`
)

writeModule(
  "admin-approvals.ts",
  `/**
 * 휴가·근태 승인 API — admin.ts에서 분리 — move only
 */
import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'

${slice1(lines, 500, 759)}
`
)

writeModule(
  "admin.ts",
  `/**
 * 관리(Admin) barrel — admin-notices · admin-hr-policies · admin-approvals
 */
export * from './admin-notices'
export * from './admin-hr-policies'
export * from './admin-approvals'
`
)

console.log("split-api-client-phase3: done")
