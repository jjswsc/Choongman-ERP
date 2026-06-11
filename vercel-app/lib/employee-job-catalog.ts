/**
 * 직원 직무 선택 목록 — system_settings `employee_job_catalog` (문자열 배열)
 * DB load/save → employee-job-catalog-server.ts (server-only)
 */

export const EMPLOYEE_JOB_CATALOG_KEY = 'employee_job_catalog'

export const DEFAULT_EMPLOYEE_JOB_CATALOG = [
  'Service',
  'Kitchen',
  'Franchise',
  'Officer',
  'Director',
  'Logistic',
] as const

/** DB에 저장된 목록에 없어도 로드 시 보강 (신규 기본 직무) */
const CORE_JOBS_MERGED_ON_LOAD = ['Franchise'] as const

export function mergeMissingCoreEmployeeJobs(catalog: string[]): string[] {
  const out = [...catalog]
  const seen = new Set(catalog.map((j) => j.toLowerCase()))
  for (const j of CORE_JOBS_MERGED_ON_LOAD) {
    if (seen.has(j.toLowerCase())) continue
    out.push(j)
    seen.add(j.toLowerCase())
  }
  return out
}

/** 직무 드롭다운·필터 표시명 (value는 영문 Franchise 등 그대로 저장) */
export function getEmployeeJobOptionLabel(job: string, t: (key: string) => string): string {
  const raw = String(job || '').trim()
  if (!raw) return raw
  const key = raw.toLowerCase()
  if (key === 'service') return t('empJobService')
  if (key === 'kitchen') return t('empJobKitchen')
  if (key === 'franchise') return t('empJobFranchise')
  if (key === 'officer') return t('empJobOfficer')
  if (key === 'director') return t('empJobDirector')
  if (key === 'logistic') return t('empJobLogistic')
  if (raw === '기타' || key === 'other') return t('workLogOther')
  return raw
}

const RESERVED_JOB_NOISE = new Set(
  ['매장명', 'Store', '직급', 'Job', '부서'].map((s) => s.toLowerCase())
)

function isNoiseJob(j: string): boolean {
  const t = String(j || '').trim()
  if (!t) return true
  return RESERVED_JOB_NOISE.has(t.toLowerCase())
}

/** DB/요청값 → 정규화된 목록 (비어 있으면 기본값) */
export function normalizeEmployeeJobCatalog(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_EMPLOYEE_JOB_CATALOG]
  const out: string[] = []
  const seen = new Set<string>()
  for (const x of raw) {
    const s = String(x ?? '')
      .trim()
      .slice(0, 80)
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out.length > 0 ? out : [...DEFAULT_EMPLOYEE_JOB_CATALOG]
}

/** 저장용: 최소 1개, 최대 100개 */
export function sanitizeEmployeeJobCatalogForSave(input: unknown): string[] | { error: string } {
  if (!Array.isArray(input)) return { error: 'jobs 배열이 필요합니다.' }
  const out: string[] = []
  const seen = new Set<string>()
  for (const x of input) {
    const s = String(x ?? '')
      .trim()
      .slice(0, 80)
    if (!s) continue
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= 100) break
  }
  if (out.length === 0) return { error: '직무를 1개 이상 남겨 주세요.' }
  return out
}

/** 직원 목록 API용: 등록 직무 + 실제 사용 중인 직무 문자열 합집합 */
export function mergeJobOptionsFromCatalogAndEmployees(catalog: string[], distinctFromEmployees: string[]): string[] {
  const s = new Set<string>()
  for (const j of catalog) {
    const t = String(j ?? '').trim()
    if (t) s.add(t)
  }
  for (const j of distinctFromEmployees) {
    const t = String(j ?? '').trim()
    if (!t || isNoiseJob(t)) continue
    s.add(t)
  }
  return Array.from(s).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}
