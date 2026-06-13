import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const script = path.join(__dirname, "extract-api-client-section.mjs")

const sections = [
  {
    start: "// ─── 업무일지 (Work Log) ───",
    end: "// ─── 시간표 (Timesheet) ───",
    file: "work-log.ts",
    imports: `import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsPlainObject, jsonAsStringArray, jsonAsArray } from '../safe-api-json'`,
    title: "업무일지(Work Log) API",
  },
  {
    start: "// ─── 시간표 (Timesheet) ───",
    end: "// ─── 방문 (Visit) ───",
    file: "timesheet.ts",
    imports: `import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'`,
    title: "시간표(Timesheet) API",
  },
  {
    start: "// ─── 방문 (Visit) ───",
    end: "// ─── 패티 캐쉬 ───",
    file: "visit.ts",
    imports: `import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'`,
    title: "매장 방문(Visit) API",
  },
  {
    start: "// ─── 패티 캐쉬 ───",
    end: "// ─── 미수금/미지급금 관리 ───",
    file: "petty-cash.ts",
    imports: `import { apiFetchWithOffline } from '../api/fetch-offline'
import { jsonAsArray } from '../safe-api-json'
import { getPettyCashListWithCache } from '../offline/erp-offline'
import { readAutoTranslateEnabled } from '../auto-translate'
import type { PaginatedList } from './types'`,
    title: "패티캐시 API",
  },
]

for (const s of sections) {
  execFileSync(process.execPath, [script, s.start, s.end, s.file, s.imports], { stdio: "inherit" })
  const outPath = path.join(__dirname, "..", "lib", "api-client", s.file)
  const fs = await import("node:fs")
  let text = fs.readFileSync(outPath, "utf8")
  text = text.replace(
    /\/\*\*\n \* \([^)]+\) — api-client\.ts에서 분리 — move only\n \*\//,
    `/**\n * ${s.title} (api-client.ts에서 분리 — move only)\n */`
  )
  fs.writeFileSync(outPath, text)
}

console.log("Batch extract done:", sections.map((s) => s.file).join(", "))
