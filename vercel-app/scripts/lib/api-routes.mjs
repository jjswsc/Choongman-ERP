/**
 * app/api 아래 route.ts 수집 (API 목록 생성·이름 규칙 검사 공용)
 */
import fs from "node:fs"
import path from "node:path"

const METHOD_RE = /export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g

/** 평면 camelCase 라우트(getPosOrders 등)에서 도메인 추정 시 떼어낼 동사 */
const LEADING_VERBS =
  /^(get|save|update|delete|create|add|remove|list|set|upload|apply|check|sync|fetch|post|run|import|export|send|toggle|approve|reject|cancel|process|mark|calc|compute|generate|confirm|reset|submit|record|register|search|load|batch|bulk|use|issue|verify|link|unlink|restore|close|open|move|copy|merge|clear|refresh|resolve|change|lookup|preview|print|download|parse|scan|test|request|ensure|seed|backfill|recalc|rebuild|retry|notify|push|pull)(?=[A-Z])/

/** @param {string} appDir vercel-app/app 절대경로 */
export function listApiRoutes(appDir) {
  const apiDir = path.join(appDir, "api")
  const out = []
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name === "route.ts" || e.name === "route.tsx") {
        const rel = path.relative(apiDir, path.dirname(p)).split(path.sep).join("/")
        const src = fs.readFileSync(p, "utf8")
        const methods = [...new Set([...src.matchAll(METHOD_RE)].map((m) => m[1]))]
        out.push({
          route: `/api/${rel}`,
          file: path.relative(path.dirname(appDir), p).split(path.sep).join("/"),
          segments: rel.split("/"),
          methods,
        })
      }
    }
  }
  walk(apiDir)
  return out.sort((a, b) => a.route.localeCompare(b.route))
}

/** 목록 문서용 도메인 그룹 */
export function domainOf(route) {
  const [first, second] = route.segments
  if (route.segments.length > 1 && first !== "webhooks") return first
  if (first === "webhooks") return `webhooks/${second}`
  const stripped = first.replace(LEADING_VERBS, "")
  const word = /^[a-zA-Z][a-z0-9]*/.exec(stripped)?.[0] ?? stripped
  return word.toLowerCase()
}

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DYNAMIC = /^\[(?:\.\.\.)?[a-zA-Z][a-zA-Z0-9]*\]$|^\[\[\.\.\.[a-zA-Z][a-zA-Z0-9]*\]\]$/

/**
 * 신규 라우트 규칙: app/api/<domain>/<action>[/...]/route.ts, 각 세그먼트 kebab-case(동적 세그먼트 제외)
 * @returns {string | null} 위반 사유
 */
export function namingViolation(route) {
  const segs = route.segments
  if (segs.length < 2) return "도메인 폴더 없이 최상위에 있음 → app/api/<domain>/<action>/route.ts"
  for (const s of segs) {
    if (DYNAMIC.test(s)) continue
    if (!KEBAB.test(s)) return `세그먼트 "${s}"가 kebab-case 아님`
  }
  if (DYNAMIC.test(segs[0])) return "첫 세그먼트(도메인)는 동적 경로일 수 없음"
  return null
}
