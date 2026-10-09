/**
 * docs/API-INVENTORY.md 생성 — app/api 전체 라우트 목록(도메인별·메서드·웹훅/크론 표시)
 * Run: npm run api:inventory
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { domainOf, listApiRoutes } from "./lib/api-routes.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outPath = path.join(root, "docs", "API-INVENTORY.md")

const routes = listApiRoutes(path.join(root, "app"))
const vercel = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"))
const cronSchedule = new Map((vercel.crons ?? []).map((c) => [c.path, c.schedule]))

function tags(r) {
  const t = []
  if (r.segments[0] === "webhooks") t.push("webhook")
  if (cronSchedule.has(r.route)) t.push(`cron \`${cronSchedule.get(r.route)}\``)
  return t.join(", ")
}

const byDomain = new Map()
for (const r of routes) {
  const d = domainOf(r)
  if (!byDomain.has(d)) byDomain.set(d, [])
  byDomain.get(d).push(r)
}
const domains = [...byDomain.keys()].sort((a, b) => byDomain.get(b).length - byDomain.get(a).length || a.localeCompare(b))

const protectedRoutes = routes.filter((r) => r.segments[0] === "webhooks" || cronSchedule.has(r.route))

const lines = [
  "# API 목록 (자동 생성)",
  "",
  "> 이 파일은 `npm run api:inventory`로 생성합니다. 직접 수정하지 마세요.",
  "> 신규 라우트 규칙: [`.cursor/rules/api-route-conventions.mdc`](../../.cursor/rules/api-route-conventions.mdc) · 검사: `npm run api:check`",
  "",
  `- 라우트 수: **${routes.length}**`,
  `- 도메인 그룹 수: **${domains.length}** (평면 camelCase 라우트는 이름에서 동사를 뗀 첫 단어로 추정)`,
  `- 외부 호출(웹훅·크론): **${protectedRoutes.length}** — 경로 변경 금지`,
  "",
  "## 경로 변경 금지 (외부 등록·Vercel 크론)",
  "",
  "| 경로 | 메서드 | 구분 |",
  "|---|---|---|",
  ...protectedRoutes.map((r) => `| \`${r.route}\` | ${r.methods.join(", ") || "-"} | ${tags(r)} |`),
  "",
  "## 도메인별",
  "",
  ...domains.map((d) => `- [${d}](#${d.toLowerCase().replace(/[^a-z0-9-]/g, "")}) (${byDomain.get(d).length})`),
  "",
]

for (const d of domains) {
  lines.push(`### ${d}`, "", "| 경로 | 메서드 | 비고 |", "|---|---|---|")
  for (const r of byDomain.get(d)) {
    lines.push(`| \`${r.route}\` | ${r.methods.join(", ") || "-"} | ${tags(r)} |`)
  }
  lines.push("")
}

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, lines.join("\n"), "utf8")
console.log(`API inventory: ${routes.length} routes, ${domains.length} domains → ${path.relative(root, outPath)}`)
