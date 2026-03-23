/**
 * alert / confirm / prompt → appAlert / appConfirm / appPrompt 일괄 치환 (1회 실행)
 * node scripts/replace-native-alerts.mjs
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")

const SKIP_DIR = new Set(["node_modules", ".next", "dist", ".git"])
const SKIP_FILE = (f) =>
  f.includes(`${path.sep}lib${path.sep}app-message.ts`) ||
  f.includes(`${path.sep}components${path.sep}app-message-provider.tsx`) ||
  f.includes(`${path.sep}scripts${path.sep}replace-native-alerts.mjs`)

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (SKIP_DIR.has(ent.name)) continue
      walk(p, out)
    } else if (/\.(tsx|ts)$/.test(ent.name) && !ent.name.endsWith(".d.ts")) {
      out.push(p)
    }
  }
  return out
}

function transform(absPath, content) {
  if (SKIP_FILE(absPath)) return null
  if (!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(content)) return null

  let s = content
  s = s.replace(/\bwindow\.confirm\s*\(/g, "await appConfirm(")
  s = s.replace(/\bwindow\.alert\s*\(/g, "await appAlert(")
  s = s.replace(/\bwindow\.prompt\s*\(/g, "await appPrompt(")
  s = s.replace(/\bconfirm\s*\(/g, "await appConfirm(")
  s = s.replace(/\balert\s*\(/g, "await appAlert(")
  // .prompt( 메서드(PWA beforeinstallprompt 등)는 치환하지 않음
  s = s.replace(/(?<!\.)prompt\s*\(/g, "await appPrompt(")

  const needs = []
  if (s.includes("appAlert")) needs.push("appAlert")
  if (s.includes("appConfirm")) needs.push("appConfirm")
  if (s.includes("appPrompt")) needs.push("appPrompt")
  const uniq = [...new Set(needs)]
  if (!uniq.length) return null

  if (!s.includes('@/lib/app-message"')) {
    const importLine = `import { ${uniq.join(", ")} } from "@/lib/app-message"`
    if (s.startsWith('"use client"') || s.startsWith("'use client'")) {
      const idx = s.indexOf("\n")
      s = s.slice(0, idx + 1) + importLine + "\n" + s.slice(idx + 1)
    } else {
      s = importLine + "\n" + s
    }
  }

  return s
}

let n = 0
for (const file of walk(root)) {
  const content = fs.readFileSync(file, "utf8")
  const next = transform(file, content)
  if (next && next !== content) {
    fs.writeFileSync(file, next, "utf8")
    n++
    console.log("updated:", path.relative(root, file))
  }
}
console.log("files updated:", n)
