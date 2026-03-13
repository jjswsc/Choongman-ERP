const fs = require("fs")
const path = require("path")

const root = path.resolve(__dirname, "..")
const i18nPath = path.join(root, "lib", "i18n.ts")
const src = fs.readFileSync(i18nPath, "utf8")

const langs = ["ko", "en", "th", "mm", "la", "kh", "vi", "ms"]
const strict = process.argv.includes("--strict")

function extractLangBlock(source, lang, nextLangs) {
  const startRe = new RegExp(`\\n\\s*${lang}:\\s*\\{`)
  const m = source.match(startRe)
  if (!m || m.index == null) return ""
  const start = m.index + m[0].length
  let end = source.length
  for (const n of nextLangs) {
    const re = new RegExp(`\\n\\s*${n}:\\s*\\{`)
    const mm = source.slice(start).match(re)
    if (mm && mm.index != null) {
      end = start + mm.index
      break
    }
  }
  return source.slice(start, end)
}

function extractKeys(block) {
  const out = new Set()
  const re = /\n\s*([A-Za-z0-9_]+):\s*'/g
  let m
  while ((m = re.exec(block))) {
    const key = m[1]
    if (key.startsWith("pos")) out.add(key)
  }
  return out
}

const dictKeys = {}
for (let i = 0; i < langs.length; i++) {
  const lang = langs[i]
  const block = extractLangBlock(src, lang, langs.slice(i + 1))
  dictKeys[lang] = extractKeys(block)
}

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    if (["node_modules", ".next", ".git"].includes(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}

const files = walk(root)
const used = new Set()
const keyRe = /t\(\s*["'](pos[A-Za-z0-9_]+)["']\s*\)/g
for (const f of files) {
  const c = fs.readFileSync(f, "utf8")
  let m
  while ((m = keyRe.exec(c))) used.add(m[1])
}

const usedList = [...used].sort()
console.log(`Used POS keys: ${usedList.length}`)
let totalMissing = 0
for (const lang of langs) {
  const missing = usedList.filter((k) => !dictKeys[lang].has(k))
  totalMissing += missing.length
  console.log(`\n[${lang}] missing: ${missing.length}`)
  if (missing.length) console.log(missing.join("\n"))
}

if (strict && totalMissing > 0) {
  process.exit(1)
}
