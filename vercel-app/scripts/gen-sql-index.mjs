/**
 * docs/SQL-INDEX.md 의 자동 목록 구역 갱신 — vercel-app/sql 파일을 접두어별로 묶고 유형 표시
 * Run: npm run sql:index   (Git에 추적된 파일만 대상)
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const indexPath = path.join(root, "docs", "SQL-INDEX.md")
const START = "<!-- sql-index:auto:start -->"
const END = "<!-- sql-index:auto:end -->"

const files = execFileSync("git", ["-c", "core.quotepath=off", "ls-files", "sql"], { cwd: root, encoding: "utf8" })
  .split(/\r?\n/)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.slice("sql/".length))

const TYPE_RULES = [
  ["preview", /(^|_)preview(_|\.|$)/],
  ["verify", /(^|_)(verify|check|checks)(_|\.|$)/],
  ["diagnose", /(^|_)(diagnose|diagnostic|find|audit|lookup|inspect)(_|\.|$)/],
  ["backfill", /backfill/],
  ["bundle", /(all_in_one|one_shot|one_paste)/],
  ["rpc", /(^|_)rpc(_|\.|$)/],
  ["rls", /(^|_)rls(_|\.|$)/],
  ["apply", /(^|_)(apply|update|delete|set|upsert|fix|repair|insert|cleanup)(_|\.|$)/],
]

function typesOf(name) {
  return TYPE_RULES.filter(([, re]) => re.test(name)).map(([t]) => t)
}

function logsApplied(rel) {
  return fs.readFileSync(path.join(root, "sql", rel), "utf8").includes("sql_applied_log")
}

const top = files.filter((f) => !f.includes("/"))
const legacy = files.filter((f) => f.startsWith("legacy/"))
const archived = files.filter((f) => f.startsWith("archive/"))

const groups = new Map()
for (const f of top) {
  const prefix = f.split(/[_.]/)[0].toLowerCase()
  if (!groups.has(prefix)) groups.set(prefix, [])
  groups.get(prefix).push(f)
}
const prefixes = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length || a.localeCompare(b))

const out = [
  START,
  "",
  "## 8) 전체 파일 목록 (자동 생성)",
  "",
  "> `npm run sql:index`로 갱신합니다. 이 구역은 직접 수정하지 마세요.",
  "> 유형은 파일명으로 추정: preview·verify·diagnose(읽기) / apply·backfill·bundle·rpc·rls(변경). `log` = 끝에 `sql_applied_log` 기록 블록 있음.",
  "",
  `- \`sql/\` 최상위: **${top.length}**개 · 접두어 그룹 **${prefixes.length}**개`,
  `- \`sql/legacy/\` (옛 루트 \`supabase_*.sql\`): **${legacy.length}**개`,
  `- \`sql/archive/\` (진단 전용 등 보관): **${archived.length}**개`,
  "",
]

for (const p of prefixes) {
  const list = groups.get(p).sort()
  out.push(`<details><summary><code>${p}_*</code> (${list.length})</summary>`, "")
  for (const f of list) {
    const tags = typesOf(f)
    if (logsApplied(f)) tags.push("log")
    out.push(`- [\`${f}\`](../sql/${encodeURI(f)})${tags.length ? ` — ${tags.join(", ")}` : ""}`)
  }
  out.push("", "</details>", "")
}

for (const [title, list] of [
  ["legacy", legacy],
  ["archive", archived],
]) {
  out.push(`<details><summary><code>${title}/</code> (${list.length})</summary>`, "")
  for (const f of list.sort()) out.push(`- [\`${f}\`](../sql/${encodeURI(f)})`)
  out.push("", "</details>", "")
}
out.push(END)

const current = fs.readFileSync(indexPath, "utf8")
const eol = current.includes("\r\n") ? "\r\n" : "\n"
const block = out.join(eol)
const s = current.indexOf(START)
const e = current.indexOf(END)
const next =
  s >= 0 && e > s
    ? current.slice(0, s) + block + current.slice(e + END.length)
    : current.replace(/\s*$/, "") + eol + eol + block + eol
fs.writeFileSync(indexPath, next, "utf8")
console.log(`SQL index: top ${top.length}, legacy ${legacy.length}, archive ${archived.length}, ${prefixes.length} prefixes → docs/SQL-INDEX.md`)
