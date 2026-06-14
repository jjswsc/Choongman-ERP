/**
 * SaaS API prefix 감사 — erp-route-modules.ts에 없는 /api/* route 후보 출력
 * node scripts/audit-saas-api-prefixes.mjs
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const apiRoot = path.join(root, "app", "api")
const gateFile = path.join(root, "lib", "saas", "erp-route-modules.ts")
const gateSrc = fs.readFileSync(gateFile, "utf8")

const exemptMatch = gateSrc.match(/SAAS_API_GATE_EXEMPT_PREFIXES = \[([\s\S]*?)\] as const/)
const rulesMatch = gateSrc.match(/export const API_PATH_RULES[\s\S]*?= \[([\s\S]*?)\] as const/)

function parseExemptPrefixes(block) {
  if (!block) return []
  return [...block.matchAll(/"(\/api[^"]*)"/g)].map((m) => m[1])
}

function parseRulePrefixes(block) {
  if (!block) return []
  return [...block.matchAll(/prefix: "([^"]+)"/g)].map((m) => m[1])
}

const exempt = parseExemptPrefixes(exemptMatch?.[1])
const rules = parseRulePrefixes(rulesMatch?.[1])

function isCovered(apiPath) {
  for (const ex of exempt) {
    if (apiPath === ex || apiPath.startsWith(ex)) return true
  }
  const sorted = [...rules].sort((a, b) => b.length - a.length)
  for (const p of sorted) {
    if (apiPath.startsWith(p)) return true
  }
  return false
}

function walk(dir, base = "/api") {
  const out = []
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (ent.name.startsWith("[")) continue
      out.push(...walk(full, `${base}/${ent.name}`))
    } else if (ent.name === "route.ts") {
      out.push(base)
    }
  }
  return out
}

const routes = walk(apiRoot).sort()
const missing = routes.filter((r) => !isCovered(r))

console.log(`routes: ${routes.length}, covered: ${routes.length - missing.length}, missing: ${missing.length}`)
console.log(`exempt prefixes: ${exempt.length}, rule prefixes: ${rules.length}`)
for (const r of missing) console.log(r)
