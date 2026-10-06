/** 세무 장부 UI 표시용 로케일 (DB에는 한국어 계정명·영문 적요를 유지). */

import { CHART_OF_ACCOUNTS_BY_CODE } from '@/lib/chart-of-accounts-mapping'
import { formatYmSlash, taxBookMemoWithoutStatus, taxBookSourceKindKey } from '@/lib/tax-book-voucher-memo'

export function formatTaxFilingYearMonthLabel(yearMonth: string, lang: string): string {
  const ym = String(yearMonth || '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym
  const y = ym.slice(0, 4)
  const m = Number(ym.slice(5, 7))
  if (lang === 'ko') return `${y}년 ${m}월`
  if (lang === 'th') return `${String(m).padStart(2, '0')}/${y}`
  return `${y}-${String(m).padStart(2, '0')}`
}

const CHART_BY_KO_NAME = new Map(
  Object.values(CHART_OF_ACCOUNTS_BY_CODE).map((meta) => [meta.nameKo, meta])
)

function accountNameForLang(
  lang: string,
  meta: { nameKo: string; nameEn: string; nameTh?: string },
  fallback: string,
  code: string
): string {
  if (lang === 'ko') return meta.nameKo || fallback || code
  if (lang === 'th') return meta.nameTh || meta.nameEn || meta.nameKo || fallback || code
  return meta.nameEn || meta.nameKo || fallback || code
}

export function displayTaxBookAccountName(
  lang: string,
  accountCode: string,
  fallbackName?: string | null
): string {
  const code = String(accountCode || '').trim()
  const fallback = String(fallbackName || '').trim()
  const meta = (code ? CHART_OF_ACCOUNTS_BY_CODE[code] : undefined) || (fallback ? CHART_BY_KO_NAME.get(fallback) : undefined)
  if (!meta) return fallback || code
  return accountNameForLang(lang, meta, fallback, code)
}

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function ymdParts(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').slice(0, 10))
  if (!match) return null
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) }
}

/** 원장 행 날짜. 태국어는 แสดง 양식처럼 03/01/69 (불기 2자리). */
export function formatTaxBookLedgerDate(iso: string, lang: string): string {
  const p = ymdParts(iso)
  if (!p) return String(iso || '')
  const dd = String(p.d).padStart(2, '0')
  const mm = String(p.m).padStart(2, '0')
  if (lang === 'th') return `${dd}/${mm}/${String((p.y + 543) % 100).padStart(2, '0')}`
  if (lang === 'ko') return `${p.y}.${mm}.${dd}`
  return `${dd} ${EN_MONTHS[p.m - 1]} ${p.y}`
}

/** 원장 머리의 기간. 태국어는 1 ม.ค. 2569 ถึง 31 ธ.ค. 2569. */
export function formatTaxBookLedgerPeriod(fromIso: string, toIso: string, lang: string): string {
  const from = formatTaxBookLedgerPeriodDate(fromIso, lang)
  const to = formatTaxBookLedgerPeriodDate(toIso, lang)
  if (lang === 'th') return `${from} ถึง ${to}`
  if (lang === 'ko') return `${from} ~ ${to}`
  return `${from} – ${to}`
}

function formatTaxBookLedgerPeriodDate(iso: string, lang: string): string {
  const p = ymdParts(iso)
  if (!p) return String(iso || '—')
  if (lang === 'th') return `${p.d} ${THAI_MONTHS[p.m - 1]} ${p.y + 543}`
  if (lang === 'ko') return `${p.y}. ${p.m}. ${p.d}.`
  return `${p.d} ${EN_MONTHS[p.m - 1]} ${p.y}`
}

type MemoPhrase = { ko: string; en: string; th: string }

const OPERATIONAL_MEMO_EXACT: Record<string, MemoPhrase> = {
  '통장 거래 자동분개': { ko: '통장 거래', en: 'Bank transaction', th: 'รายการบัญชีธนาคาร' },
  '카드대금 지급(선급금)': { ko: '카드대금 지급', en: 'Card payment', th: 'จ่ายค่าบัตร' },
  '패티캐시 보충 자동분개': { ko: '시재 보충', en: 'Petty cash top-up', th: 'เติมเงินสดย่อย' },
  '패티캐시 보충': { ko: '시재 보충', en: 'Petty cash top-up', th: 'เติมเงินสดย่อย' },
  '시재 지출 자동분개': { ko: '시재 지출', en: 'Petty cash expense', th: 'จ่ายเงินสดย่อย' },
  '카드 충전 자동분개': { ko: '카드 충전', en: 'Card top-up', th: 'เติมเงินบัตร' },
  '카드 지출 자동분개': { ko: '카드 지출', en: 'Card expense', th: 'จ่ายด้วยบัตร' },
  카드충전: { ko: '카드 충전', en: 'Card top-up', th: 'เติมเงินบัตร' },
  '지출 발생(미지급) 자동분개': { ko: '지출 발생', en: 'Expense accrual', th: 'บันทึกค่าใช้จ่ายค้างจ่าย' },
  '매입 지급 원천세': { ko: '매입 원천세', en: 'Withholding on purchase', th: 'หัก ณ ที่จ่ายจากการซื้อ' },
  '원천세 상계': { ko: '원천세 상계', en: 'Withholding offset', th: 'หักกลบภาษีหัก ณ ที่จ่าย' },
  원천세예수금: { ko: '원천세예수금', en: 'Withholding payable', th: 'ภาษีหัก ณ ที่จ่ายค้างจ่าย' },
  '미지급금 지급 자동분개': { ko: '미지급금 지급', en: 'Payables payment', th: 'จ่ายเจ้าหนี้' },
  '카드/QR/배달앱 정산 예정': { ko: '카드/QR/배달 정산 예정', en: 'Card/QR/delivery settlement due', th: 'รอรับเงินบัตร/QR/เดลิเวอรี' },
  '손님 선수금 적용': { ko: '선수금 적용', en: 'Customer deposit applied', th: 'ตัดเงินมัดจำลูกค้า' },
  '서비스처리(무료 제공) 비용': { ko: '서비스(무료) 비용', en: 'Complimentary service cost', th: 'ต้นทุนของแถม' },
  'POS 매출 자동분개': { ko: 'POS 매출', en: 'POS sales', th: 'ขาย POS' },
  'POS 주문 취소/환불 역분개': { ko: 'POS 취소/환불', en: 'POS void/refund', th: 'ยกเลิก/คืนเงิน POS' },
  '매장 매입 자동분개': { ko: '매장 매입', en: 'Store purchase', th: 'ซื้อของสาขา' },
  이체출금: { ko: '이체 출금', en: 'Transfer out', th: 'โอนเงินออก' },
  외부이체: { ko: '외부 이체', en: 'External transfer', th: 'โอนออกภายนอก' },
  통장이체: { ko: '통장 이체', en: 'Bank transfer', th: 'โอนผ่านธนาคาร' },
  '패티캐시 회수': { ko: '시재 회수', en: 'Petty cash return', th: 'รับเงินสดย่อยคืน' },
  '출금 관리 자동분개': { ko: '출금', en: 'Withdrawal', th: 'ถอนเงิน' },
}

function phrase(lang: string, row: MemoPhrase): string {
  if (lang === 'th') return row.th
  if (lang === 'ko') return row.ko
  return row.en
}

/** 자동분개에 심어 둔 한국어 적요만 화면 언어로 바꾼다. 사람이 쓴 문장은 그대로 둔다. */
export function localizeOperationalJournalMemo(memo: string, lang: string): string | null {
  const text = String(memo || '').trim()
  if (!text) return null
  const exact = OPERATIONAL_MEMO_EXACT[text]
  if (exact) return phrase(lang, exact)
  const petty = /^패티보충\((.+)\)$/.exec(text)
  if (petty) return phrase(lang, { ko: `시재 보충(${petty[1]})`, en: `Petty cash top-up (${petty[1]})`, th: `เติมเงินสดย่อย (${petty[1]})` })
  const channel = /^POS 채널 정산 \((.+)\)$/.exec(text)
  if (channel) return phrase(lang, { ko: `POS 채널 정산 (${channel[1]})`, en: `POS channel settlement (${channel[1]})`, th: `รับเงินช่องทาง POS (${channel[1]})` })
  const close = /^POS 일마감 조정분개 \(system=(.+), settlement=(.+)\)$/.exec(text)
  if (close) {
    return phrase(lang, {
      ko: `POS 일마감 조정 (시스템 ${close[1]}, 정산 ${close[2]})`,
      en: `POS day-close adjustment (system ${close[1]}, settlement ${close[2]})`,
      th: `ปรับปรุงปิดวัน POS (ระบบ ${close[1]}, ยอดรับ ${close[2]})`,
    })
  }
  const dep = /^감가상각\s*(.*)$/.exec(text)
  if (dep) {
    const name = dep[1].trim()
    return phrase(lang, {
      ko: name ? `감가상각 ${name}` : '감가상각',
      en: name ? `Depreciation ${name}` : 'Depreciation',
      th: name ? `ค่าเสื่อมราคา ${name}` : 'ค่าเสื่อมราคา',
    })
  }
  const transferIn = /^이체입금\(계좌(.+)\)$/.exec(text)
  if (transferIn) return phrase(lang, { ko: `이체 입금(계좌${transferIn[1]})`, en: `Transfer in (account ${transferIn[1]})`, th: `รับโอน (บัญชี ${transferIn[1]})` })
  const external = /^외부이체\((.+)\)$/.exec(text)
  if (external) return phrase(lang, { ko: `외부 이체(${external[1]})`, en: `External transfer (${external[1]})`, th: `โอนออกภายนอก (${external[1]})` })
  const card = /^카드충전\(계좌(.+)\)$/.exec(text)
  if (card) return phrase(lang, { ko: `카드 충전(계좌${card[1]})`, en: `Card top-up (account ${card[1]})`, th: `เติมเงินบัตร (บัญชี ${card[1]})` })
  return null
}

function ymFromMemoOrDate(memo: string | null | undefined, accountingDate?: string | null): string {
  const fromMemo = String(memo || '').match(/(\d{2}\/\d{4})/)
  if (fromMemo) return fromMemo[1]
  const ymd = String(accountingDate || '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return formatYmSlash(ymd.slice(0, 7))
  const ym = String(accountingDate || '').slice(0, 7)
  if (/^\d{4}-\d{2}$/.test(ym)) return formatYmSlash(ym)
  return ''
}

function kindFromStoredMemo(memo: string): string | null {
  const s = memo || ''
  if (/Record VAT from Monthly Tax Filing/i.test(s)) return 'vat'
  if (/Record sales base summary/i.test(s)) return 'salesSummary'
  if (/Record purchase base summary/i.test(s)) return 'purchaseSummary'
  if (/Record accrued payroll/i.test(s)) return 'payroll'
  if (/Record inventory COGS/i.test(s)) return 'inventory'
  if (/Closing entries/i.test(s)) return 'closing'
  if (/Opening balances from FlowAccount/i.test(s)) return 'opening'
  if (/Adjusting journal entry/i.test(s)) return 'adjustment'
  if (/세무 장부 기초|FlowAccount→세무 기초/i.test(s)) return 'opening'
  return null
}

/** i18n 키 + {{ym}} / {{date}} 치환용. 매칭 실패 시 null → 원문 memo 사용. */
export function resolveTaxBookMemoDisplay(
  memo: string | null | undefined,
  opts?: { sourceType?: string | null; accountingDate?: string | null }
): { key: string; ym: string; date: string } | null {
  const kindFromSource = taxBookSourceKindKey(opts?.sourceType)
  const kind = kindFromSource !== 'other' ? kindFromSource : kindFromStoredMemo(String(memo || ''))
  if (!kind) return null
  const date = String(opts?.accountingDate || memo?.match(/\d{4}-\d{2}-\d{2}/)?.[0] || '').slice(0, 10)
  const ym = ymFromMemoOrDate(memo, opts?.accountingDate || date)
  return { key: `taxBooksMemo_${kind}`, ym, date }
}

export function formatTaxBookMemoDisplay(
  t: (key: string) => string,
  memo: string | null | undefined,
  opts?: { sourceType?: string | null; accountingDate?: string | null; lang?: string | null }
): string {
  const resolved = resolveTaxBookMemoDisplay(memo, opts)
  const raw = taxBookMemoWithoutStatus(memo)
  if (!resolved) return localizeOperationalJournalMemo(raw, opts?.lang || 'en') || raw
  const template = t(resolved.key)
  if (!template || template === resolved.key) return localizeOperationalJournalMemo(raw, opts?.lang || 'en') || raw
  return template.replace(/\{\{ym\}\}/g, resolved.ym).replace(/\{\{date\}\}/g, resolved.date)
}
