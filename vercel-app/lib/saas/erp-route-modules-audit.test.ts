/**
 * SaaS API prefix 커버리지 하한 — scripts/audit-saas-api-prefixes.mjs 와 동일 로직
 * (회귀 방지용, tenantId 없는 레거시 동작과 무관)
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { API_PATH_RULES, SAAS_API_GATE_EXEMPT_PREFIXES } from "./erp-route-modules"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const apiRoot = path.join(__dirname, "..", "..", "app", "api")

function isCovered(apiPath: string) {
  for (const ex of SAAS_API_GATE_EXEMPT_PREFIXES) {
    if (apiPath === ex || apiPath.startsWith(ex)) return true
  }
  for (const rule of API_PATH_RULES) {
    if (apiPath.startsWith(rule.prefix)) return true
  }
  return false
}

function walk(dir: string, base = "/api"): string[] {
  const out: string[] = []
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

describe("erp-route-modules API audit", () => {
  it(
    "maps at least 90% of app/api routes (raise threshold as coverage improves)",
    () => {
      const routes = walk(apiRoot)
      const covered = routes.filter((r) => isCovered(r)).length
      const ratio = covered / routes.length
      expect(ratio).toBeGreaterThanOrEqual(0.99)
    },
    30_000
  )
})
