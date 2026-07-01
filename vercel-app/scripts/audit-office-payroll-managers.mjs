/**
 * 오피스 급여 담당(can_manage_office_payroll) 직원 감사
 *
 * 사용: node scripts/audit-office-payroll-managers.mjs
 * 필요: vercel-app/.env.local 의 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnvLocal() {
  const p = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!m || process.env[m[1]]) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}

function isFlag(raw) {
  return raw === true || raw === 'true' || raw === 1 || raw === '1'
}

function normName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function isOfficeStore(store) {
  const x = String(store || '').trim()
  const lower = x.toLowerCase()
  return (
    x === '본사' ||
    x === 'HQ' ||
    x === 'Office' ||
    x === '오피스' ||
    x === '본점' ||
    lower === 'hq' ||
    lower.includes('office')
  )
}

function isDirectorRole(role) {
  const r = String(role || '').toLowerCase()
  return ['director', 'secretary', 'ceo', 'hr'].some((x) => r.includes(x))
}

function isResigned(r) {
  const status = String(r.employment_status || '').trim().toLowerCase()
  if (status === 'resigned' || status === '퇴사') return true
  const resign = String(r.resign_date || '').trim().slice(0, 10)
  if (!resign) return false
  return new Date().toISOString().slice(0, 10) > resign
}

async function main() {
  loadEnvLocal()
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 필요합니다.')
    process.exit(1)
  }

  const sb = createClient(url, key)
  const select =
    'id,employee_code,store,name,role,job,resign_date,employment_status,can_manage_office_payroll,deleted_at'
  const { data, error } = await sb.from('employees').select(select).order('store').order('name')

  if (error) {
    if (/can_manage_office_payroll|42703|column/i.test(error.message || '')) {
      console.error('employees.can_manage_office_payroll 컬럼이 없습니다. sql/employees_can_manage_office_payroll.sql 먼저 실행하세요.')
    } else {
      console.error(error.message)
    }
    process.exit(1)
  }

  const rows = (data || []).filter((r) => !String(r.deleted_at || '').trim())
  const flagged = rows.filter((r) => isFlag(r.can_manage_office_payroll))

  const nameCounts = new Map()
  for (const r of rows) {
    const n = normName(r.name)
    if (!n) continue
    const cur = nameCounts.get(n) || { count: 0, stores: new Set() }
    cur.count += 1
    const st = String(r.store || '').trim()
    if (st) cur.stores.add(st)
    nameCounts.set(n, cur)
  }
  const duplicateNames = new Set(
    Array.from(nameCounts.entries())
      .filter(([, v]) => v.count > 1)
      .map(([n]) => n)
  )

  const managers = flagged.map((r) => {
    const risks = []
    if (isResigned(r)) risks.push('resigned_but_flagged')
    if (duplicateNames.has(normName(r.name))) risks.push('duplicate_name_login_risk')
    if (!String(r.employee_code || '').trim()) risks.push('missing_employee_code')
    if (!isOfficeStore(r.store)) risks.push('non_office_store')
    if (!isDirectorRole(r.role)) risks.push('relies_on_employee_flag')
    return {
      id: r.id,
      employeeCode: String(r.employee_code || '').trim(),
      name: String(r.name || '').trim(),
      store: String(r.store || '').trim(),
      role: String(r.role || '').trim(),
      job: String(r.job || '').trim(),
      resignDate: String(r.resign_date || '').trim().slice(0, 10),
      employmentStatus: String(r.employment_status || '').trim(),
      needsSessionRefresh: !isResigned(r) && !isDirectorRole(r.role),
      risks,
    }
  })

  const active = managers.filter((m) => !m.risks.includes('resigned_but_flagged'))

  console.log('\n=== 오피스 급여 담당 감사 ===\n')
  console.log(`플래그 켜진 직원: ${managers.length}명 (재직 ${active.length}명)`)
  console.log(`퇴사인데 플래그 ON: ${managers.filter((m) => m.risks.includes('resigned_but_flagged')).length}명`)
  console.log(`동명이인 로그인 혼동 위험: ${managers.filter((m) => m.risks.includes('duplicate_name_login_risk')).length}명`)
  console.log(`비-Director(플래그 의존): ${managers.filter((m) => m.risks.includes('relies_on_employee_flag')).length}명`)

  if (active.length === 0) {
    console.log('\n재직 중 오피스 급여 담당자가 없습니다.')
    return
  }

  console.log('\n--- 재직 담당자 (배포 후 새로고침·재로그인 권장) ---')
  for (const m of active) {
    const riskNote = m.risks.length ? ` [${m.risks.join(', ')}]` : ''
    console.log(
      `- ${m.employeeCode || '(코드없음)'} | ${m.name} | ${m.store} | ${m.role || m.job || '-'}${riskNote}`
    )
  }

  const dupGroups = Array.from(nameCounts.entries())
    .filter(([, v]) => v.count > 1)
    .map(([name, v]) => ({ name, count: v.count, stores: Array.from(v.stores) }))
  if (dupGroups.length) {
    console.log('\n--- 동명이인 그룹 (로그인 시 매장 정확히 선택) ---')
    for (const g of dupGroups) {
      console.log(`- "${g.name}" x${g.count}: ${g.stores.join(', ')}`)
    }
  }

  console.log('\nJSON:', JSON.stringify({ summary: { totalFlagged: managers.length, activeFlagged: active.length }, managers, duplicateNameGroups: dupGroups }, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
