/**
 * app/api·admin·pos·lib 에서 limit / pageSize / maxRows / maxDuration 리터럴 추출
 * → lib/admin-route-limits.generated.json (설정 화면 "코드 기준 한도" 표시용)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'lib', 'admin-route-limits.generated.json')

const SKIP_DIR = new Set(['node_modules', '.next', '.git', 'dist'])
const SKIP_FILES = new Set(['admin-route-limits.generated.json'])

function walk(dir, acc = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const ent of entries) {
    const p = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      if (SKIP_DIR.has(ent.name)) continue
      walk(p, acc)
    } else if (ent.isFile()) {
      if (SKIP_FILES.has(ent.name)) continue
      const rel = path.relative(ROOT, p).replace(/\\/g, '/')
      if (rel.startsWith('app/api/') && ent.name === 'route.ts') acc.push(p)
      else if (rel.startsWith('app/admin/') && (ent.name.endsWith('.tsx') || ent.name.endsWith('.ts'))) acc.push(p)
      else if (rel.startsWith('app/pos/') && (ent.name.endsWith('.tsx') || ent.name.endsWith('.ts'))) acc.push(p)
      else if (rel.startsWith('lib/') && ent.name.endsWith('.ts') && !ent.name.endsWith('.d.ts')) acc.push(p)
    }
  }
  return acc
}

function parseNum(s) {
  return parseInt(String(s).replace(/_/g, ''), 10)
}

function extractFromContent(relPath, content) {
  const lines = content.split(/\n/)
  const out = []
  const patterns = [
    { kind: 'limit', re: /\blimit:\s*([\d_]+)\b/g },
    { kind: 'pageSize', re: /\bpageSize:\s*([\d_]+)\b/g },
    { kind: 'maxRows', re: /\bmaxRows:\s*([\d_]+)\b/g },
  ]
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const { kind, re } of patterns) {
      const r = new RegExp(re.source, 'g')
      let m
      while ((m = r.exec(line)) !== null) {
        const value = parseNum(m[1])
        if (Number.isFinite(value)) out.push({ line: i + 1, kind, value })
      }
    }
    const md = line.match(/export\s+const\s+maxDuration\s*=\s*([\d_]+)/)
    if (md) {
      const value = parseNum(md[1])
      if (Number.isFinite(value)) out.push({ line: i + 1, kind: 'maxDurationSec', value })
    }
  }
  return out
}

function apiLabel(relPath) {
  const n = relPath.replace(/\\/g, '/')
  if (n.startsWith('app/api/')) {
    return n.slice('app/api/'.length).replace(/\/route\.ts$/, '')
  }
  if (n.includes('/admin/')) {
    const segs = n.split('/')
    const i = segs.indexOf('admin')
    return `admin/${segs.slice(i + 1, -1).join('/') || '.'}`
  }
  if (n.includes('/pos/')) {
    const segs = n.split('/')
    const i = segs.indexOf('pos')
    return `pos/${segs.slice(i + 1, -1).join('/') || '.'}`
  }
  if (n.startsWith('lib/')) return n.replace(/^lib\//, 'lib:').replace(/\.ts$/, '')
  return n
}

function main() {
  const files = walk(ROOT)
  const entries = []
  for (const abs of files) {
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/')
    let content
    try {
      content = fs.readFileSync(abs, 'utf8')
    } catch {
      continue
    }
    for (const hit of extractFromContent(rel, content)) {
      entries.push({
        path: rel,
        line: hit.line,
        kind: hit.kind,
        value: hit.value,
        apiLabel: apiLabel(rel),
      })
    }
  }
  entries.sort((a, b) => (a.path !== b.path ? a.path.localeCompare(b.path) : a.line !== b.line ? a.line - b.line : a.kind.localeCompare(b.kind)))

  const payload = {
    generatedAt: new Date().toISOString(),
    entryCount: entries.length,
    entries,
  }
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8')
  console.log(`extract-api-limits: wrote ${entries.length} entries → ${path.relative(ROOT, OUT)}`)
}

main()
