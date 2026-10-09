/**
 * 신규 API 라우트 이름 규칙 검사 (CI)
 * - scripts/api-route-baseline.json 에 있는 기존 라우트는 검사 제외(경로 유지 원칙)
 * - 그 외 신규 라우트는 app/api/<domain>/<kebab-case>/route.ts 여야 함
 *
 *   npm run api:check            검사
 *   npm run api:check -- --prune 삭제된 라우트를 기준선에서 제거(추가는 하지 않음)
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { listApiRoutes, namingViolation } from "./lib/api-routes.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const baselinePath = path.join(root, "scripts", "api-route-baseline.json")

const routes = listApiRoutes(path.join(root, "app"))
const current = new Set(routes.map((r) => r.route))
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"))
const baselineSet = new Set(baseline.routes)

if (process.argv.includes("--prune")) {
  const kept = baseline.routes.filter((r) => current.has(r))
  fs.writeFileSync(baselinePath, JSON.stringify({ ...baseline, routes: kept }, null, 2) + "\n", "utf8")
  console.log(`baseline pruned: ${baseline.routes.length} → ${kept.length}`)
  process.exit(0)
}

const violations = []
for (const r of routes) {
  if (baselineSet.has(r.route)) continue
  const why = namingViolation(r)
  if (why) violations.push(`${r.file}: ${why}`)
}

const removed = baseline.routes.filter((r) => !current.has(r))
if (removed.length) {
  console.log(`참고: 기준선에 있으나 삭제된 라우트 ${removed.length}개 (npm run api:check -- --prune 으로 정리)`)
}

if (violations.length) {
  console.error(`API 라우트 이름 규칙 위반 ${violations.length}건:`)
  for (const v of violations) console.error(`  - ${v}`)
  console.error("\n규칙: .cursor/rules/api-route-conventions.mdc")
  process.exit(1)
}

console.log(`API route naming OK (${routes.length} routes, baseline ${baselineSet.size}, new ${routes.length - routes.filter((r) => baselineSet.has(r.route)).length})`)
