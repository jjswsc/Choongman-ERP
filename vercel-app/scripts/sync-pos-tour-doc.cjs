#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const CHECK_ONLY = process.argv.includes('--check')

const rootDir = path.resolve(__dirname, '..')
const demoRoutesPath = path.join(rootDir, 'lib', 'pos-tour', 'demo-routes.ts')
const readmePath = path.join(rootDir, 'lib', 'pos-tour', 'README.md')

const AUTO_START = '<!-- AUTO-GENERATED:POS-TOUR-ROUTES:START -->'
const AUTO_END = '<!-- AUTO-GENERATED:POS-TOUR-ROUTES:END -->'

function fail(msg) {
  process.stderr.write(`${msg}\n`)
  process.exit(1)
}

function extractObjectLiteral(source, anchorText) {
  const anchor = source.indexOf(anchorText)
  if (anchor < 0) return null
  const open = source.indexOf('{', anchor)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '{') depth += 1
    if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(open + 1, i)
      }
    }
  }
  return null
}

function parseRoutes(source) {
  const block = extractObjectLiteral(source, 'export const POS_DEMO_ROUTES')
  if (!block) fail('POS_DEMO_ROUTES 블록을 찾지 못했습니다.')
  const out = []
  const re = /([A-Za-z0-9_]+)\s*:\s*'([^']+)'/g
  let m = re.exec(block)
  while (m) {
    out.push({ key: m[1], path: m[2] })
    m = re.exec(block)
  }
  return out
}

function parseScenarioShortcuts(source) {
  const block = extractObjectLiteral(source, 'const DEMO_SHORTCUT_TARGET_BY_SCENARIO')
  if (!block) fail('DEMO_SHORTCUT_TARGET_BY_SCENARIO 블록을 찾지 못했습니다.')
  const out = []
  const re = /'([^']+)'\s*:\s*POS_DEMO_ROUTES\.([A-Za-z0-9_]+)/g
  let m = re.exec(block)
  while (m) {
    out.push({ scenario: m[1], routeKey: m[2] })
    m = re.exec(block)
  }
  return out
}

function routePurpose(routeKey) {
  if (routeKey.startsWith('home')) return 'POS 홈 진입'
  if (routeKey.startsWith('business')) return '영업 시작/마감 결산'
  if (routeKey.startsWith('cash')) return '시재 관리'
  if (routeKey.startsWith('terminal')) return 'POS 터미널/결제'
  return '기타 데모 라우트'
}

function buildGeneratedBlock(routes, shortcuts) {
  const routeMap = Object.fromEntries(routes.map((r) => [r.key, r.path]))
  const lines = []
  lines.push(AUTO_START)
  lines.push('> 아래 표는 `lib/pos-tour/demo-routes.ts`에서 자동 생성됩니다.')
  lines.push('')
  lines.push('### Auto Synced Demo Routes')
  lines.push('')
  lines.push('| Route Key | Path | Purpose |')
  lines.push('| --- | --- | --- |')
  for (const r of routes) {
    lines.push(`| \`${r.key}\` | \`${r.path}\` | ${routePurpose(r.key)} |`)
  }
  lines.push('')
  lines.push('### Auto Synced Scenario Shortcuts')
  lines.push('')
  lines.push('| Scenario ID | Route Key | Target Path |')
  lines.push('| --- | --- | --- |')
  for (const s of shortcuts) {
    const targetPath = routeMap[s.routeKey] || '(missing route key)'
    lines.push(`| \`${s.scenario}\` | \`${s.routeKey}\` | \`${targetPath}\` |`)
  }
  lines.push(AUTO_END)
  return lines.join('\n')
}

function syncReadme(readme, generatedBlock) {
  const start = readme.indexOf(AUTO_START)
  const end = readme.indexOf(AUTO_END)
  if (start < 0 || end < 0 || end < start) {
    const suffix = readme.endsWith('\n') ? '' : '\n'
    return `${readme}${suffix}\n${generatedBlock}\n`
  }
  return `${readme.slice(0, start)}${generatedBlock}${readme.slice(end + AUTO_END.length)}`
}

const demoRoutesSource = fs.readFileSync(demoRoutesPath, 'utf8')
const routes = parseRoutes(demoRoutesSource)
const shortcuts = parseScenarioShortcuts(demoRoutesSource)
const generatedBlock = buildGeneratedBlock(routes, shortcuts)

const currentReadme = fs.readFileSync(readmePath, 'utf8')
const nextReadme = syncReadme(currentReadme, generatedBlock)

if (CHECK_ONLY) {
  if (nextReadme !== currentReadme) {
    fail('POS tour 문서가 최신이 아닙니다. `npm run pos:tour:doc:sync`를 실행하세요.')
  }
  process.stdout.write('POS tour 문서 동기화 상태 정상\n')
  process.exit(0)
}

if (nextReadme !== currentReadme) {
  fs.writeFileSync(readmePath, nextReadme, 'utf8')
  process.stdout.write('POS tour 문서를 자동 동기화했습니다.\n')
} else {
  process.stdout.write('POS tour 문서가 이미 최신입니다.\n')
}
