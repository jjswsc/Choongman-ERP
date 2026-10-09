/**
 * 인플루언서 명부 — 순수 함수 (핸들·팔로워·섭외 상태·레이트·매장 매핑)
 */

export const INFLUENCER_PIPELINE_STATUSES = [
  'waiting',
  'interested',
  'got_rate',
  'high_rate',
  'hired',
  'not_selected',
  'no_reply',
  'unavailable',
] as const

export type InfluencerPipelineStatus = (typeof INFLUENCER_PIPELINE_STATUSES)[number]

export function isInfluencerPipelineStatus(v: unknown): v is InfluencerPipelineStatus {
  return typeof v === 'string' && (INFLUENCER_PIPELINE_STATUSES as readonly string[]).includes(v)
}

/** 구글 시트 드롭다운·스마트칩이 비어 있을 때 보이는 안내 문구 */
const SHEET_PLACEHOLDERS = new Set(['พื้นที่รับงาน', 'double click', 'สถานะ', 'ประเภทคอนเทนต์', '​'])

export function isSheetPlaceholder(raw: unknown): boolean {
  const s = String(raw ?? '').replace(/\u200b/g, '').trim().toLowerCase()
  return !s || SHEET_PLACEHOLDERS.has(s)
}

export function cleanSheetCell(raw: unknown): string {
  const s = String(raw ?? '').replace(/\u200b/g, '').trim()
  return isSheetPlaceholder(s) ? '' : s
}

/** `https://www.tiktok.com/@goodbyemoney?is_from_webapp=1` · `@goodbyemoney` → `goodbyemoney` */
export function normalizeTiktokHandle(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const fromUrl = s.match(/tiktok\.com\/@([A-Za-z0-9._]+)/i)
  if (fromUrl) return fromUrl[1]!.toLowerCase()
  const bare = s.match(/^@?([A-Za-z0-9._]{2,})$/)
  return bare ? bare[1]!.toLowerCase() : ''
}

export function normalizeInstagramHandle(raw: unknown): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const fromUrl = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
  return fromUrl ? fromUrl[1]!.toLowerCase() : ''
}

/** `138.6k` → 138600, `1M` → 1000000, `2,500` → 2500. 해석 불가 시 null */
export function parseFollowersCount(raw: unknown): number | null {
  const t = String(raw ?? '').replace(/,/g, '').trim().toUpperCase()
  if (!t) return null
  const m = t.match(/^([\d.]+)\s*([KM])?$/)
  if (!m) return null
  let n = parseFloat(m[1]!)
  if (!Number.isFinite(n)) return null
  if (m[2] === 'K') n *= 1000
  else if (m[2] === 'M') n *= 1000000
  return Math.floor(n)
}

export function formatFollowersShort(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return ''
  if (n >= 1000000) return `${Number((n / 1000000).toFixed(1))}M`
  if (n >= 1000) return `${Number((n / 1000).toFixed(1))}k`
  return String(n)
}

const THAI_STATUS_MAP: [RegExp, InfluencerPipelineStatus][] = [
  [/ไม่สะดวกรับงาน/, 'unavailable'],
  [/ไม่ตอบ/, 'no_reply'],
  [/ไม่เลือก/, 'not_selected'],
  [/ได้เรทแล้ว/, 'got_rate'],
  [/เรทสูง/, 'high_rate'],
  [/จ้าง/, 'hired'],
  [/สนใจ/, 'interested'],
  [/รอข้อมูล/, 'waiting'],
]

/** 시트 สถานะ 원문 → 코드. 영문 코드는 그대로 통과, 해석 불가 시 null */
export function mapThaiPipelineStatus(raw: unknown): InfluencerPipelineStatus | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const lower = s.toLowerCase()
  if (isInfluencerPipelineStatus(lower)) return lower
  for (const [re, code] of THAI_STATUS_MAP) {
    if (re.test(s)) return code
  }
  return null
}

/**
 * 레이트 원문에서 최저 금액(THB). `28k+VAT` → 28000, `25k / 50k` → 25000,
 * `79k ตอนนี้ลดเหลือ 20k` → 20000. 500 미만 숫자(날짜·시간 조각)는 무시.
 */
export function parseRateMinThb(raw: unknown): number | null {
  const s = String(raw ?? '').replace(/,/g, '')
  if (!s.trim()) return null
  const re = /(\d+(?:\.\d+)?)\s*([kKmM])?/g
  let min: number | null = null
  for (const m of s.matchAll(re)) {
    let n = parseFloat(m[1]!)
    if (!Number.isFinite(n)) continue
    const suf = (m[2] || '').toLowerCase()
    if (suf === 'k') n *= 1000
    else if (suf === 'm') n *= 1000000
    if (n < 500) continue
    if (min == null || n < min) min = n
  }
  return min
}

export function minRateAcross(...raws: unknown[]): number | null {
  let min: number | null = null
  for (const r of raws) {
    const n = parseRateMinThb(r)
    if (n != null && (min == null || n < min)) min = n
  }
  return min
}

/** 연락처 원문에서 태국 휴대폰/전화번호 추출 (`097-1977441`, `0814096548`) */
export function extractThaiPhone(raw: unknown): string {
  const s = String(raw ?? '')
  const m = s.match(/0\d{1,2}[-\s]?\d{3}[-\s]?\d{3,4}/)
  return m ? m[0]!.replace(/[^\d]/g, '') : ''
}

function storeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/^\s*(cm|at)\s+/i, '')
    .replace(/^\s*(cm|at)\s+/i, '')
    .replace(/[^a-z0-9ก-๙]/g, '')
}

/**
 * 시트 พื้นที่รับงาน(At Ekkamai, Union Mal …) → ERP 매장명(CM Ekkamai, CM Union Mall …).
 * 매칭 실패 시 원문 그대로 반환.
 */
export function mapSheetStoreToErp(raw: unknown, stores: readonly string[]): string {
  const src = cleanSheetCell(raw)
  if (!src) return ''
  const k = storeKey(src)
  if (!k) return src
  for (const st of stores) {
    if (storeKey(st) === k) return st
  }
  for (const st of stores) {
    const sk = storeKey(st)
    if (sk && k.length >= 3 && (sk.startsWith(k) || k.startsWith(sk))) return st
  }
  for (const st of stores) {
    const sk = storeKey(st)
    if (sk && k.length >= 3 && (sk.includes(k) || k.includes(sk))) return st
  }
  return src
}

/** `13/08/2026`, `2026-08-13`, 엑셀 시리얼, 불기(2569) → `YYYY-MM-DD` */
export function parseSheetDateYmd(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 20000 && raw < 80000) {
    const d = new Date(Math.round((raw - 25569) * 86400 * 1000))
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }
  const s = cleanSheetCell(raw)
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  let y: number
  let mo: number
  let d: number
  if (iso) {
    y = Number(iso[1])
    mo = Number(iso[2])
    d = Number(iso[3])
  } else if (dmy) {
    d = Number(dmy[1])
    mo = Number(dmy[2])
    y = Number(dmy[3])
    if (dmy[3]!.length === 2) y = y > 50 ? 2500 + y : 2000 + y
  } else {
    return null
  }
  if (y > 2400) y -= 543
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCMonth() !== mo - 1) return null
  return dt.toISOString().slice(0, 10)
}

export function splitContentCategories(raw: unknown): string[] {
  const s = cleanSheetCell(raw)
  if (!s) return []
  const out: string[] = []
  for (const part of s.split(/[,/、\n]+/)) {
    const t = part.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}
