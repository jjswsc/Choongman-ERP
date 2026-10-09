/**
 * i18n 사전(lib/i18n.ts 의 i18n.*, lib/i18n-pos.ts 의 I18N_POS_*)을 키 순서·값 그대로 sha256 으로 고정.
 * 파일 분리·재배치 리팩터링 전후로 번역 값이 1글자도 바뀌지 않았는지 확인할 때 사용.
 *
 *   npx tsx scripts/i18n-snapshot.mts --write scripts/output/i18n-snapshot.json
 *   npx tsx scripts/i18n-snapshot.mts --check scripts/output/i18n-snapshot.json
 */
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { i18n } from "../lib/i18n"
import * as pos from "../lib/i18n-pos"

type Snapshot = Record<string, { keys: number; sha256: string }>

function hashDict(dict: Record<string, unknown>): { keys: number; sha256: string } {
  const entries = Object.entries(dict)
  return {
    keys: entries.length,
    sha256: createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
  }
}

function build(): Snapshot {
  const out: Snapshot = {}
  for (const [lang, dict] of Object.entries(i18n)) {
    out[`i18n.${lang}`] = hashDict(dict as Record<string, unknown>)
  }
  for (const [name, dict] of Object.entries(pos)) {
    if (name.startsWith("I18N_POS_")) out[name] = hashDict(dict as Record<string, unknown>)
  }
  return out
}

const [mode, file] = process.argv.slice(2)
if ((mode !== "--write" && mode !== "--check") || !file) {
  console.error("usage: --write <file> | --check <file>")
  process.exit(2)
}

const current = build()
const target = path.resolve(file)

if (mode === "--write") {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, JSON.stringify(current, null, 2) + "\n", "utf8")
  console.log(`i18n snapshot written: ${target} (${Object.keys(current).length} dicts)`)
} else {
  const saved = JSON.parse(fs.readFileSync(target, "utf8")) as Snapshot
  const names = new Set([...Object.keys(saved), ...Object.keys(current)])
  let diff = 0
  for (const name of names) {
    const a = saved[name]
    const b = current[name]
    if (!a || !b || a.sha256 !== b.sha256) {
      diff++
      console.error(`MISMATCH ${name}: saved=${a ? `${a.keys}/${a.sha256.slice(0, 12)}` : "-"} now=${b ? `${b.keys}/${b.sha256.slice(0, 12)}` : "-"}`)
    }
  }
  if (diff) process.exit(1)
  console.log(`i18n snapshot OK (${names.size} dicts identical)`)
}
