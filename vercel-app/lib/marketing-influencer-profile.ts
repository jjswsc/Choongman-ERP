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
const SHEET_PLACEHOLDERS = new Set([
  'พื้นที่รับงาน',
  'double click',
  'สถานะ',
  'สถานะงาน',
  'สถานะชำระเงิน',
  'ประเภทคอนเทนต์',
  'false',
  '​',
])

export function isSheetPlaceholder(raw: unknown): boolean {
  if (raw === false) return true
  const s = String(raw ?? '').replace(/\u200b/g, '').trim().toLowerCase()
  return !s || SHEET_PLACEHOLDERS.has(s)
}

/** 시트에서 แ 를 เ+เ 로 입력한 경우(ลงงานเเล้ว) 정규화 */
export function normalizeThaiSaraAe(raw: unknown): string {
  return String(raw ?? '').replace(/เเ/g, 'แ')
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

/** 금액 원문 → THB. `10.9k` → 10900, `3,000` → 3000, 숫자 셀은 그대로. 해석 불가 시 0 */
export function parseThbAmount(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : 0
  const s = cleanSheetCell(raw).replace(/,/g, '')
  const m = s.match(/(\d+(?:\.\d+)?)\s*([kKmM])?/)
  if (!m) return 0
  let n = parseFloat(m[1]!)
  const suf = (m[2] || '').toLowerCase()
  if (suf === 'k') n *= 1000
  else if (suf === 'm') n *= 1000000
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
}

/** 업로드 기록(marketing_influencers.status) — 캠페인 상태와 같은 코드 */
export type InfluencerPostStatus = 'draft' | 'ongoing' | 'finish'

/** 시트 สถานะงาน → 업로드 기록 상태. 해석 불가 시 null */
export function mapThaiJobStatus(raw: unknown): InfluencerPostStatus | null {
  const s = normalizeThaiSaraAe(cleanSheetCell(raw))
  if (!s) return null
  if (/ลงงานแล้ว|โพสต์แล้ว|posted|done|finish/i.test(s)) return 'finish'
  if (/นัดวันแล้ว|คอนเฟิร์ม|ถ่ายแล้ว|รอโพสต์|confirm|schedul|ongoing/i.test(s)) return 'ongoing'
  if (/ติดต่อ|รอ|draft/i.test(s)) return 'draft'
  return null
}

export const INFLUENCER_PAYMENT_STATUSES = ['unpaid', 'billed', 'paid'] as const
export type InfluencerPaymentStatus = (typeof INFLUENCER_PAYMENT_STATUSES)[number]

export function isInfluencerPaymentStatus(v: unknown): v is InfluencerPaymentStatus {
  return typeof v === 'string' && (INFLUENCER_PAYMENT_STATUSES as readonly string[]).includes(v)
}

/** 시트 สถานะชำระเงิน → 지급 상태. 해석 불가 시 null */
export function mapThaiPaymentStatus(raw: unknown): InfluencerPaymentStatus | null {
  const s = normalizeThaiSaraAe(cleanSheetCell(raw))
  if (!s) return null
  if (isInfluencerPaymentStatus(s.toLowerCase())) return s.toLowerCase() as InfluencerPaymentStatus
  if (/ชำระแล้ว|จ่ายแล้ว|โอนแล้ว|paid/i.test(s)) return 'paid'
  if (/วางบิล|รอชำระ|รอโอน|bill|invoice/i.test(s)) return 'billed'
  if (/ยังไม่|ไม่ดำเนินการ|unpaid/i.test(s)) return 'unpaid'
  return null
}

export type ContentPlatform = 'tiktok' | 'instagram' | 'facebook' | 'youtube' | 'lemon8' | 'other'

export function contentUrlPlatform(url: string): ContentPlatform {
  if (/tiktok\.com\//i.test(url)) return 'tiktok'
  if (/instagram\.com\//i.test(url)) return 'instagram'
  if (/facebook\.com\/|fb\.com\/|fb\.watch\//i.test(url)) return 'facebook'
  if (/youtube\.com\/|youtu\.be\//i.test(url)) return 'youtube'
  if (/lemon8/i.test(url)) return 'lemon8'
  return 'other'
}

/**
 * TikTok 영상 ID 상위 32비트 = 게시 시각(unix 초). `…/video/7662318859533438215` → 방콕 기준 YYYY-MM-DD.
 * 영상 URL이 아니거나 범위를 벗어나면 null
 */
export function tiktokVideoPostedYmd(url: unknown): string | null {
  const m = String(url ?? '').match(/tiktok\.com\/.*\/video\/(\d{15,20})/i)
  if (!m) return null
  const sec = Math.floor(Number(m[1]) / 4294967296)
  if (!Number.isFinite(sec) || sec < 1451606400 || sec > 4102444800) return null
  return new Date(sec * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

/** 셀 텍스트(`TT - https://… Ig - https://…`)에서 URL 목록 */
export function extractUrls(raw: unknown): string[] {
  const s = String(raw ?? '')
  const out: string[] = []
  for (const m of s.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const u = m[0].replace(/[),.;]+$/, '')
    if (!out.includes(u)) out.push(u)
  }
  return out
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
