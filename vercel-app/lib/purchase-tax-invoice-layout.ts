/**
 * 스캔 지면의 "글자 위치"로 필드를 고른다.
 *
 * 통짜 텍스트 + 정규식으로는 라벨 옆 값과 표 아무 데나 있는 값을 구분할 수 없다.
 * 태국어 `เลขที่`는 문서번호이자 번지수·호실번호이고, 한 장에 `INVOICE No.`·`P.O. No.`·
 * `Customer No.`가 같이 있으며, 판매자·구매자 세금번호가 나란히 찍힌다.
 * 그래서 라벨의 좌표를 먼저 찾고 그 오른쪽만 값으로 읽는다.
 *
 * DOM을 쓰지 않는 순수 모듈 — 브라우저 OCR 결과를 넣고 테스트에서 그대로 재생한다.
 */
import {
  digitsTin13,
  thaiTinChecksumOk,
  type ExtractedPurchaseTaxInvoiceFields,
} from './purchase-tax-invoice-core'

export type OcrWordBox = {
  text: string
  conf: number
  x0: number
  y0: number
  x1: number
  y1: number
}

export type OcrLineBox = {
  text: string
  conf: number
  x0: number
  y0: number
  x1: number
  y1: number
  words: OcrWordBox[]
}

export type OcrPageLayout = {
  width: number
  height: number
  lines: OcrLineBox[]
}

export type LayoutField<T> = {
  value: T
  /** 0~100. 게이트를 넘지 못하면 저장하지 않고 검수로 보낸다. */
  confidence: number
  source: string
}

export type LayoutExtract = {
  invoiceNo?: LayoutField<string>
  sellerTaxId?: LayoutField<string>
  buyerTaxId?: LayoutField<string>
  netAmount?: LayoutField<number>
  vatAmount?: LayoutField<number>
  totalAmount?: LayoutField<number>
  docDate?: LayoutField<string>
}

const THAI_RE = /[\u0E00-\u0E7F]/

/**
 * 라벨을 찾기 위한 정규화. OCR이 성조·니คหิต을 흘리거나 เ/แ 를 헷갈리는 일이 잦아
 * 비교 전에 둘 다 같은 모양으로 눌러 둔다. 라벨 문구에도 반드시 같은 함수를 쓴다.
 */
export function normalizeLabelText(s: string): string {
  return String(s || '')
    .replace(/แ/g, 'เ')
    .replace(/ำ/g, 'า')
    .replace(/[\u0E47-\u0E4E]/g, '')
    .toUpperCase()
}

function labelPattern(literals: string[], extra?: string, flags = ''): RegExp {
  const parts = literals.map((l) => normalizeLabelText(l).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (extra) parts.push(extra)
  return new RegExp(parts.join('|'), flags)
}

/**
 * 부정 라벨이 "바로 붙어" 있을 때만 거부한다. `ใบสั่งซื้อเลขที่`(P.O.)는 붙어 있지만,
 * 한 줄에 `รหัสลูกค้า … เลขที่เอกสาร` 처럼 떨어져 있으면 뒤쪽 라벨은 멀쩡한 문서번호다.
 */
function negativeTouchesLabel(text: string, re: RegExp, start: number, end: number): boolean {
  const g = new RegExp(re.source, 'g')
  let m: RegExpExecArray | null
  while ((m = g.exec(text))) {
    if (m.index >= end) break
    if (m.index + m[0].length >= start - 1) return true
    if (m[0].length === 0) g.lastIndex += 1
  }
  return false
}

/** 문자 하나하나가 어느 단어에서 왔는지 기억해 둔 줄 문자열 */
type CompactLine = {
  line: OcrLineBox
  /** 공백을 지우고 정규화한 문자열 — 태국어 라벨은 내부 공백이 없다 */
  text: string
  /** text[i] 를 만든 단어의 인덱스 */
  owner: number[]
}

function compactLine(line: OcrLineBox): CompactLine {
  let text = ''
  const owner: number[] = []
  line.words.forEach((w, i) => {
    for (const ch of normalizeLabelText(w.text)) {
      if (/\s/.test(ch)) continue
      text += ch
      owner.push(i)
    }
  })
  return { line, text, owner }
}

export function compactLayoutLines(layout: OcrPageLayout): CompactLine[] {
  return layout.lines.filter((l) => l.words.length > 0).map(compactLine)
}

function labelIndex(text: string, re: RegExp): { start: number; end: number } | undefined {
  re.lastIndex = 0
  const m = re.exec(text)
  if (!m) return undefined
  return { start: m.index, end: m.index + m[0].length }
}

function wordsAfter(cl: CompactLine, charEnd: number): OcrWordBox[] {
  const first = cl.owner[charEnd]
  if (first === undefined) return []
  return cl.line.words.slice(first)
}

// ─────────────────────────────────────────────────────────── 세금계산서 번호

/** 값이 붙는 번호 라벨. score 가 높을수록 확실한 라벨. */
const INVOICE_LABELS: { re: RegExp; score: number; name: string }[] = [
  { re: labelPattern(['เลขที่ใบกำกับภาษี', 'เลขที่ใบกำกับ']), score: 96, name: 'tax-invoice-no' },
  {
    re: labelPattern(['เลขที่อินวอยซ์'], 'TAX\\s*INVOICE\\s*NO|INVOICE\\s*NO|INV\\s*NO'),
    score: 94,
    name: 'invoice-no',
  },
  {
    re: labelPattern(['เลขที่เอกสาร', 'เลขที่บิล'], 'DOCUMENT\\s*NO|DOC\\s*NO|BILL\\s*NO'),
    score: 90,
    name: 'document-no',
  },
  { re: labelPattern(['เลขที่']), score: 74, name: 'bare-no-th' },
  { re: labelPattern([], '\\bNO[.:]'), score: 70, name: 'bare-no-en' },
]

/** 같은 지면에 있지만 세금계산서 번호가 아닌 것들 */
const INVOICE_NEGATIVE_RE = labelPattern(
  [
    'เลขที่ภาษี',
    'เลขประจำตัวผู้เสียภาษี',
    'เลขผู้เสียภาษี',
    'เลขที่ใบวางบิล',
    'ใบสั่งซื้อเลขที่',
    'เลขที่ใบสั่งซื้อ',
    'รหัสลูกค้า',
    'อ้างอิง',
    'เลขที่บัญชี',
    'เลขที่ห้อง',
    'เลขที่สาขา',
    'เลขทะเบียน',
    'เลขที่ผู้เสียภาษี',
  ],
  'TAX\\s*ID|P\\.?O\\.?\\s*NO|PURCHASE\\s*ORDER|CUSTOMER\\s*NO|CUST\\s*NO|REFERENCE|ACCOUNT\\s*NO|BRANCH\\s*NO'
)

/** `เลขที่ 1106 ถนน…` `เลขที่ 101 ห้อง 545` 처럼 번지수·호실인 경우 */
const ADDRESS_AFTER_NO_RE = new RegExp(
  '^[:\\-#.]*\\d{1,5}(?:/\\d{1,4})?(?:' +
    ['ถนน', 'ซอย', 'หมู่', 'ห้อง', 'แขวง', 'เขต', 'ตำบล', 'อำเภอ', 'จังหวัด', 'อาคาร', 'ชั้น', 'ถ.', 'ซ.', 'ม.']
      .map((s) => normalizeLabelText(s).replace(/\./g, '\\.'))
      .join('|') +
    ')'
)

/** 줄 어딘가에 주소 낱말이 있으면 그 줄의 `เลขที่`는 번지수다 */
const ADDRESS_LINE_RE = labelPattern([
  'ถนน',
  'ซอย',
  'แขวง',
  'เขต',
  'ตำบล',
  'อำเภอ',
  'จังหวัด',
  'รหัสไปรษณีย์',
  'อาคาร',
  'หมู่บ้าน',
])

/** 태국 전화번호 — `เลขที่` 옆이라도 문서번호가 아니다 */
const PHONE_LIKE_RE = /^0\d{8,9}$/

const INVOICE_VALUE_STOP_RE = labelPattern(
  ['วันที่', 'เครดิต', 'อ้างอิง', 'ครบกำหนด', 'หน้า', 'สาขา'],
  '^(?:DATE|DUE|CREDIT|TERM|PAGE)$'
)

function cleanLayoutInvoiceToken(raw: string): string {
  return String(raw || '')
    .replace(/[^A-Za-z0-9\-/]/g, '')
    .replace(/^[-/]+|[-/]+$/g, '')
}

function invoiceTokenLooksReal(token: string): boolean {
  if (token.length < 4 || token.length > 40) return false
  if (!/\d/.test(token)) return false
  const digits = token.replace(/\D/g, '')
  if (digits.length < 3) return false
  // 13자리 숫자만 있으면 세금번호를 집은 것
  if (!/[A-Za-z]/.test(token) && digits.length === 13) return false
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(token)) return false
  return true
}

/** 단어 안에서 태국어를 빼고 남는 영숫자 토막들 */
function asciiRuns(raw: string): string[] {
  return (String(raw || '').match(/[A-Za-z0-9][A-Za-z0-9\-/]*/g) || [])
    .map(cleanLayoutInvoiceToken)
    .filter(Boolean)
}

/** `IV` `NX` `CS` 처럼 번호 앞에 따로 떨어져 찍히는 짧은 머리글자 */
function isPrefixWord(raw: string): boolean {
  const t = String(raw || '').trim()
  return /^[A-Za-z]{1,4}[.\-]?$/.test(t)
}

/** 두 단어가 한 낱말로 볼 만큼 붙어 있는가 */
function adjacent(a: OcrWordBox, b: OcrWordBox): boolean {
  return b.x0 - a.x1 <= Math.max(12, (b.y1 - b.y0) * 0.9)
}

/**
 * 라벨 오른쪽에서 번호를 고른다.
 * 단어 하나로 성립하면 거기서 멈춘다 — 안 그러면 `110510042902` 뒤의 날짜 `2026`까지
 * 붙어서 `1105100429022026` 이 된다. 다만 바로 앞에 `IV` 같은 머리글자가 떨어져 찍혀
 * 있으면 그것만 되붙인다.
 */
function invoiceValueFromWords(words: OcrWordBox[]): { token: string; conf: number } | undefined {
  const usable: OcrWordBox[] = []
  for (const w of words.slice(0, 8)) {
    const t = String(w.text || '').trim()
    if (!t) continue
    if (INVOICE_VALUE_STOP_RE.test(normalizeLabelText(t))) break
    usable.push(w)
  }
  for (let i = 0; i < usable.length; i += 1) {
    const w = usable[i]
    for (const run of asciiRuns(w.text)) {
      if (!invoiceTokenLooksReal(run)) continue
      const prev = usable[i - 1]
      if (
        prev &&
        run === cleanLayoutInvoiceToken(w.text) &&
        !THAI_RE.test(prev.text) &&
        isPrefixWord(prev.text) &&
        adjacent(prev, w)
      ) {
        const joined = cleanLayoutInvoiceToken(`${prev.text}${run}`)
        if (invoiceTokenLooksReal(joined)) {
          return { token: joined, conf: Math.round((prev.conf + w.conf) / 2) }
        }
      }
      return { token: run, conf: w.conf }
    }
  }
  for (let i = 0; i < usable.length - 1; i += 1) {
    const a = usable[i]
    const b = usable[i + 1]
    if (THAI_RE.test(a.text) || THAI_RE.test(b.text)) continue
    if (!adjacent(a, b)) continue
    const token = cleanLayoutInvoiceToken(`${a.text}${b.text}`)
    if (invoiceTokenLooksReal(token)) return { token, conf: Math.round((a.conf + b.conf) / 2) }
  }
  return undefined
}

/** 라벨이 줄 끝에 있고 값은 오른쪽 다른 블록에 있는 양식 — 같은 높이 띠를 훑는다 */
function wordsInBandRightOf(
  layout: OcrPageLayout,
  exclude: OcrLineBox,
  x: number,
  yMid: number,
  height: number
): OcrWordBox[] {
  const tol = Math.max(10, height * 0.75)
  const out: OcrWordBox[] = []
  for (const line of layout.lines) {
    if (line === exclude) continue
    for (const w of line.words) {
      if ((w.y0 + w.y1) / 2 < yMid - tol || (w.y0 + w.y1) / 2 > yMid + tol) continue
      if (w.x1 <= x) continue
      out.push(w)
    }
  }
  return out.sort((a, b) => a.x0 - b.x0)
}

// ───────────────────────────────────────────────── 거래처별 번호 형식 기억

/**
 * 같은 거래처는 늘 같은 꼴의 번호를 쓴다 — `IV-016057`, `IV-016119` 처럼.
 * 이미 저장해 둔 그 거래처의 번호에서 꼴을 뽑아 두면, 라벨이 뭉개진 장에서도
 * 번호를 찾아내고 OCR 이 흘린 머리글자를 되살릴 수 있다.
 *
 * 저장·전송되므로 정규식이 아니라 값만 담는다.
 */
export type VendorInvoiceHint = {
  /** 늘 앞에 붙는 영문 머리글자. 일정하지 않으면 빈 문자열 */
  prefix: string
  /** 늘 같은 숫자 자릿수. 제각각이면 0 */
  digitCount: number
  /** 숫자 앞부분 공통 토막(연·지점 코드 등). 없으면 빈 문자열 */
  digitPrefix: string
  /** 근거가 된 과거 번호 개수 */
  samples: number
}

const normToken = (s: string) => String(s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()

function commonPrefix(values: string[]): string {
  if (!values.length) return ''
  let out = values[0]
  for (const v of values.slice(1)) {
    let i = 0
    while (i < out.length && i < v.length && out[i] === v[i]) i += 1
    out = out.slice(0, i)
    if (!out) break
  }
  return out
}

/**
 * 이 판독 결과를 남의 꼴을 배우는 근거로 써도 되는가.
 * 라벨을 짚었거나 머리말에서 또렷하게 읽힌 것만 쓴다 — 추측으로 추측을 키우지 않는다.
 */
const HINT_WORTHY_SOURCES = new Set(['tax-invoice-no', 'invoice-no', 'document-no', 'bare-no-th', 'bare-no-en'])

export function layoutInvoiceIsHintWorthy(field?: LayoutField<string>): boolean {
  if (!field) return false
  return HINT_WORTHY_SOURCES.has(field.source.replace(/\+prefix$/, '')) && field.confidence >= 55
}

/** 과거 번호들에서 공통 꼴을 뽑는다. 근거가 빈약하면 undefined. */
export function learnVendorInvoiceHint(pastNumbers: string[]): VendorInvoiceHint | undefined {
  const norms = pastNumbers.map(normToken).filter((n) => n.length >= 4 && /\d/.test(n))
  if (!norms.length) return undefined
  const alphas = norms.map((n) => (n.match(/^[A-Za-z]+/) || [''])[0])
  const prefix = alphas.every((a) => a && a === alphas[0]) ? alphas[0] : ''
  const digitLists = norms.map((n) => n.replace(/\D/g, ''))
  const digitCount = digitLists.every((d) => d.length === digitLists[0].length) ? digitLists[0].length : 0
  const dp = commonPrefix(digitLists)
  const digitPrefix = dp.length >= 3 && dp.length < digitLists[0].length ? dp : ''
  if (!prefix && !digitPrefix && !digitCount) return undefined
  return { prefix, digitCount, digitPrefix, samples: norms.length }
}

function vendorHintScore(token: string, hint: VendorInvoiceHint): number {
  const t = normToken(token)
  const digits = t.replace(/\D/g, '')
  let s = 0
  if (hint.prefix) s += t.startsWith(hint.prefix) ? 14 : -10
  if (hint.digitCount) s += digits.length === hint.digitCount ? 10 : -8
  if (hint.digitPrefix) s += digits.startsWith(hint.digitPrefix) ? 12 : -6
  return s
}

/** 자릿수·머리글자가 다 맞으면 그 거래처 번호로 본다 */
function matchesVendorHint(token: string, hint: VendorInvoiceHint): boolean {
  const t = normToken(token)
  const digits = t.replace(/\D/g, '')
  if (hint.digitCount && digits.length !== hint.digitCount) return false
  if (hint.digitPrefix && !digits.startsWith(hint.digitPrefix)) return false
  if (hint.prefix && !t.startsWith(hint.prefix) && /[A-Za-z]/.test(t)) return false
  return Boolean(hint.digitPrefix || (hint.prefix && t.startsWith(hint.prefix)))
}

/** 라벨이 뭉개진 장 — 지면 전체에서 그 거래처 꼴에 맞는 토큰을 줍는다 */
function findVendorPatternTokens(layout: OcrPageLayout, hint: VendorInvoiceHint): InvoiceCandidate[] {
  if (!hint.digitPrefix && !hint.prefix) return []
  const height = Math.max(1, layout.height)
  const seen = new Set<string>()
  const out: InvoiceCandidate[] = []
  for (const line of layout.lines) {
    for (const w of line.words) {
      for (const run of asciiRuns(w.text)) {
        if (!invoiceTokenLooksReal(run) || !matchesVendorHint(run, hint)) continue
        const key = normToken(run)
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
          token: run,
          conf: w.conf,
          labelScore: 62,
          labelName: 'vendor-pattern',
          crossBlock: false,
          yRatio: line.y0 / height,
        })
      }
    }
  }
  return out
}

/** OCR 이 `IV` 를 흘려 숫자만 남은 경우 되살린다 */
function restoreVendorPrefix(token: string, hint: VendorInvoiceHint): string {
  if (!hint.prefix) return token
  const t = normToken(token)
  if (/[A-Za-z]/.test(t)) return token
  if (hint.digitCount && t.length !== hint.digitCount) return token
  if (hint.digitPrefix && !t.startsWith(hint.digitPrefix)) return token
  return `${hint.prefix}${token}`
}

type InvoiceCandidate = {
  token: string
  conf: number
  labelScore: number
  labelName: string
  crossBlock: boolean
  /** 지면 위쪽에서 얼마나 떨어져 있나 (0~1) */
  yRatio: number
}

function collectInvoiceCandidates(layout: OcrPageLayout): InvoiceCandidate[] {
  const lines = compactLayoutLines(layout)
  const height = Math.max(1, layout.height)
  const out: InvoiceCandidate[] = []
  for (const cl of lines) {
    const addressLine = ADDRESS_LINE_RE.test(cl.text)
    for (const label of INVOICE_LABELS) {
      const hit = labelIndex(cl.text, label.re)
      if (!hit) continue
      if (negativeTouchesLabel(cl.text, INVOICE_NEGATIVE_RE, hit.start, hit.end)) continue
      if (ADDRESS_AFTER_NO_RE.test(cl.text.slice(hit.end, hit.end + 24))) continue
      // 주소 줄의 `เลขที่`는 번지수 — 확실한 라벨(`เลขที่ใบกำกับภาษี` 등)일 때만 살린다
      if (addressLine && label.score < 90) continue
      let value = invoiceValueFromWords(wordsAfter(cl, hit.end))
      let crossBlock = false
      if (!value) {
        const lastLabelWord = cl.line.words[cl.owner[hit.end - 1] ?? -1]
        if (lastLabelWord) {
          const band = wordsInBandRightOf(
            layout,
            cl.line,
            lastLabelWord.x1,
            (lastLabelWord.y0 + lastLabelWord.y1) / 2,
            lastLabelWord.y1 - lastLabelWord.y0
          )
          value = invoiceValueFromWords(band)
          crossBlock = Boolean(value)
        }
      }
      if (!value) continue
      out.push({
        token: value.token,
        conf: value.conf,
        labelScore: label.score,
        labelName: label.name,
        crossBlock,
        yRatio: cl.line.y0 / height,
      })
    }
  }
  return out
}

/**
 * 라벨 없이 머리말 구석에 번호만 찍는 양식이 있다 (`Menustyle Printing   IV-016119`).
 * 라벨 후보가 하나도 없을 때를 대비한 약한 후보 — 영문 머리글자 + 숫자 꼴만 받는다.
 */
const UNLABELED_INVOICE_RE = /^[A-Za-z]{1,5}[-/]?\d{4,14}$/

function findUnlabeledHeaderTokens(layout: OcrPageLayout): InvoiceCandidate[] {
  const height = Math.max(1, layout.height)
  const width = Math.max(1, layout.width)
  const seen = new Set<string>()
  const out: InvoiceCandidate[] = []
  for (const line of layout.lines) {
    if (line.y0 / height > 0.35) continue
    line.words.forEach((w, i) => {
      if (w.x0 / width < 0.45) return
      for (const run of asciiRuns(w.text)) {
        if (!invoiceTokenLooksReal(run)) continue
        let token = run
        if (!UNLABELED_INVOICE_RE.test(token)) {
          // `IV` `6907772` 처럼 머리글자가 앞 단어로 떨어져 있는 경우만 되붙인다
          const prev = line.words[i - 1]
          if (!prev || THAI_RE.test(prev.text) || !isPrefixWord(prev.text) || !adjacent(prev, w)) continue
          token = cleanLayoutInvoiceToken(`${prev.text}${run}`)
          if (!UNLABELED_INVOICE_RE.test(token)) continue
        }
        const key = normToken(token)
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
          token,
          conf: w.conf,
          labelScore: 44,
          labelName: 'header-unlabeled',
          crossBlock: false,
          yRatio: line.y0 / height,
        })
      }
    })
  }
  return out
}

/** 같은 번호가 지면 여러 곳에 찍혀 있으면(머리말 + e-Tax 안내문 등) 그게 진짜다 */
function countTokenOccurrences(layout: OcrPageLayout, token: string): number {
  const want = normToken(token)
  if (want.length < 4) return 0
  let n = 0
  for (const line of layout.lines) {
    for (const w of line.words) {
      if (normToken(w.text).includes(want)) n += 1
    }
  }
  return n
}

function scoreInvoiceCandidate(c: InvoiceCandidate, occurrences: number, hint?: VendorInvoiceHint): number {
  let s = c.labelScore + Math.min(6, Math.round(c.conf / 20))
  if (c.crossBlock) s -= 8
  if (/[A-Za-z]/.test(c.token)) s += 4
  if (occurrences > 1) s += 7
  if (c.yRatio < 0.45) s += 3
  if (PHONE_LIKE_RE.test(c.token)) s -= 30
  if (hint) s += vendorHintScore(c.token, hint)
  return s
}

export function findLayoutInvoiceNo(
  layout: OcrPageLayout,
  hint?: VendorInvoiceHint
): LayoutField<string> | undefined {
  const candidates = collectInvoiceCandidates(layout)
  const extra = hint ? findVendorPatternTokens(layout, hint) : []
  const all = [...candidates, ...extra, ...findUnlabeledHeaderTokens(layout)]
  if (!all.length) return undefined
  let best: (InvoiceCandidate & { score: number }) | undefined
  for (const c of all) {
    const score = scoreInvoiceCandidate(c, countTokenOccurrences(layout, c.token), hint)
    if (best && best.score >= score) continue
    best = { ...c, score }
  }
  if (!best) return undefined
  const restored = hint ? restoreVendorPrefix(best.token, hint) : best.token
  return {
    value: restored,
    confidence: Math.min(
      99,
      Math.max(1, Math.round(best.labelScore * 0.45 + best.conf * 0.55) - (best.crossBlock ? 6 : 0))
    ),
    source: `${best.labelName}${best.crossBlock ? '-right' : ''}${restored !== best.token ? '+prefix' : ''}`,
  }
}

// ─────────────────────────────────────────────────────────── 세금번호(TIN)

const TIN_LABEL_RE = labelPattern(
  ['เลขประจำตัวผู้เสียภาษี', 'เลขผู้เสียภาษี', 'เลขที่ภาษี', 'เลขประจำตัวผู้เสียภาษีอากร'],
  'TAX\\s*ID|TAXPAYER\\s*ID|TAX\\s*IDENTIFICATION'
)
const SELLER_MARK_RE = labelPattern(
  ['ผู้ขาย', 'ผู้จำหน่าย', 'ผู้ประกอบการ'],
  'SELLER|VENDOR|SUPPLIER'
)
const BUYER_MARK_RE = labelPattern(
  ['ลูกค้า', 'ผู้ซื้อ', 'นามลูกค้า', 'รหัสลูกค้า', 'ผู้รับใบกำกับ'],
  'CUSTOMER|BUYER|BILL\\s*TO|SHIP\\s*TO'
)

type TinHit = { tin: string; y: number; conf: number; labeled: boolean }

/**
 * 끊기지 않은 13자리 숫자 덩어리만 받는다. 쉼표·슬래시는 경계로 보므로 주소의
 * `145,147,149,151,153,151/1` 이 이어 붙어 체크섬을 우연히 통과하는 일이 없다.
 * `-`·공백은 세금번호 안에서 자리 구분에 쓰이므로 지운다.
 */
function tinDigitRuns(raw: string): string[] {
  return String(raw || '')
    .replace(/[-\s]/g, '')
    .split(/[^0-9]+/)
    .filter((s) => s.length === 13)
}

function collectTins(lines: CompactLine[]): TinHit[] {
  const out: TinHit[] = []
  for (const cl of lines) {
    const labeled = Boolean(labelIndex(cl.text, TIN_LABEL_RE))
    for (const w of cl.line.words) {
      for (const run of tinDigitRuns(w.text)) {
        const d = digitsTin13(run)
        if (d.length !== 13 || !thaiTinChecksumOk(d)) continue
        if (out.some((o) => o.tin === d)) continue
        out.push({ tin: d, y: cl.line.y0, conf: w.conf, labeled })
      }
    }
  }
  return out
}

function sectionAt(lines: CompactLine[], y: number): 'seller' | 'buyer' | undefined {
  let mark: 'seller' | 'buyer' | undefined
  for (const cl of lines) {
    if (cl.line.y0 > y + 4) break
    if (BUYER_MARK_RE.test(cl.text)) mark = 'buyer'
    else if (SELLER_MARK_RE.test(cl.text)) mark = 'seller'
  }
  return mark
}

export function findLayoutTaxIds(
  layout: OcrPageLayout,
  buyerTaxIdHint?: string
): { seller?: LayoutField<string>; buyer?: LayoutField<string> } {
  const lines = compactLayoutLines(layout).slice().sort((a, b) => a.line.y0 - b.line.y0)
  const hits = collectTins(lines)
  if (!hits.length) return {}
  const hintTin = digitsTin13(buyerTaxIdHint)
  const buyerHits: TinHit[] = []
  const sellerHits: TinHit[] = []
  for (const h of hits) {
    if (hintTin && h.tin === hintTin) {
      buyerHits.push(h)
      continue
    }
    if (sectionAt(lines, h.y) === 'buyer') buyerHits.push(h)
    else sellerHits.push(h)
  }
  const sellerPool = sellerHits.length ? sellerHits : hits.filter((h) => !hintTin || h.tin !== hintTin)
  const seller = sellerPool
    .slice()
    .sort((a, b) => (a.labeled === b.labeled ? a.y - b.y : a.labeled ? -1 : 1))[0]
  const buyer = buyerHits.find((h) => h.tin !== seller?.tin)
  return {
    seller: seller
      ? {
          value: seller.tin,
          confidence: Math.min(99, Math.round(seller.conf * (seller.labeled ? 1 : 0.85))),
          source: seller.labeled ? 'tin-labeled' : 'tin-position',
        }
      : undefined,
    buyer: buyer ? { value: buyer.tin, confidence: buyer.conf, source: 'tin-buyer' } : undefined,
  }
}

// ─────────────────────────────────────────────────────────── 금액

const MONEY_RE = /^\(?-?\d{1,3}(?:,\d{3})*\.\d{2}\)?$|^\(?-?\d+\.\d{2}\)?$/

type MoneyHit = { value: number; y: number; x: number; conf: number; lineIdx: number }

const VAT_LABEL_RE = labelPattern(['ภาษีมูลค่าเพิ่ม', 'ภาษีมูลค่า', 'ภาษี 7'], 'VAT')
const NET_LABEL_RE = labelPattern(
  [
    'มูลค่าสินค้า',
    'มูลค่าที่คำนวณภาษี',
    'สินค้าเสียภาษี',
    'ราคาสินค้า',
    'มูลค่าก่อนภาษี',
    'รวมเป็นเงิน',
    'รวมเงิน',
  ],
  'TOTAL\\s*AMOUNT|SUB\\s*TOTAL|NET\\s*AMOUNT|AMOUNT\\s*BEFORE'
)
const TOTAL_LABEL_RE = labelPattern(
  ['จำนวนเงินรวมทั้งสิ้น', 'รวมทั้งสิ้น', 'จำนวนเงินทั้งสิ้น', 'ยอดชำระ', 'จำนวนเงินที่ชำระ'],
  'GRAND\\s*TOTAL|NET\\s*TOTAL|TOTAL\\s*DUE|SUBTOTAL'
)
/** 원천징수·면세·할인 줄의 숫자는 공급가·부가세가 아니다 */
const MONEY_SKIP_LINE_RE = labelPattern(
  ['หักณที่จ่าย', 'ถูกหัก', 'ยกเว้นภาษี', 'ส่วนลด'],
  'EXEMPT|WITHHOLD|DISCOUNT'
)

export function collectLayoutMoney(layout: OcrPageLayout): MoneyHit[] {
  const lines = compactLayoutLines(layout)
  const out: MoneyHit[] = []
  lines.forEach((cl, lineIdx) => {
    if (MONEY_SKIP_LINE_RE.test(cl.text)) return
    for (const w of cl.line.words) {
      const t = String(w.text || '').replace(/[฿$]/g, '').trim()
      if (!MONEY_RE.test(t)) continue
      const n = Number(t.replace(/[(),]/g, ''))
      if (!Number.isFinite(n) || n <= 0) continue
      out.push({ value: n, y: cl.line.y0, x: w.x0, conf: w.conf, lineIdx })
    }
  })
  return out
}

function lineHas(lines: CompactLine[], idx: number, re: RegExp): boolean {
  const cl = lines[idx]
  return cl ? re.test(cl.text) : false
}

/**
 * 공급가 + 부가세 = 합계 이면서 부가세가 공급가의 7% 인 조합만 채택한다.
 * 역산하지 않으므로 "7% 검산은 통과하는데 값은 틀린" 쌍이 만들어지지 않는다.
 */
export function findLayoutAmounts(layout: OcrPageLayout): {
  net?: LayoutField<number>
  vat?: LayoutField<number>
  total?: LayoutField<number>
} {
  const lines = compactLayoutLines(layout)
  const money = collectLayoutMoney(layout)
  if (money.length < 2) return {}

  type Combo = {
    net: number
    vat: number
    total: number
    observed: MoneyHit[]
    derived: number
    score: number
  }
  const round2 = (n: number) => Math.round(n * 100) / 100
  const combos: Combo[] = []

  /** 공급가를 기준으로 부가세·합계를 맞춰 본다. 둘 중 하나만 읽혔어도 나머지는 확정된다. */
  for (const net of money) {
    if (net.value < 1) continue
    const wantVat = round2(net.value * 0.07)
    const wantTotal = round2(net.value + wantVat)
    const vatHit = money.find((m) => m !== net && Math.abs(m.value - wantVat) <= 0.05)
    const totalHit = money.find((m) => m !== net && m !== vatHit && Math.abs(m.value - wantTotal) <= 0.02)
    if (!vatHit && !totalHit) continue
    const observed = [net, vatHit, totalHit].filter(Boolean) as MoneyHit[]
    const vatLabel = vatHit ? lineHas(lines, vatHit.lineIdx, VAT_LABEL_RE) : false
    const netLabel = lineHas(lines, net.lineIdx, NET_LABEL_RE)
    const totalLabel = totalHit ? lineHas(lines, totalHit.lineIdx, TOTAL_LABEL_RE) : false
    // 셋 다 읽히지 않았다면 라벨이 최소 하나는 뒷받침해야 우연의 일치를 배제할 수 있다
    if (observed.length < 3 && !vatLabel && !netLabel && !totalLabel) continue
    let score = 0
    if (vatLabel) score += 4
    if (totalLabel) score += 3
    if (netLabel) score += 2
    score += observed.length * 2
    combos.push({
      net: net.value,
      vat: vatHit ? vatHit.value : wantVat,
      total: totalHit ? totalHit.value : wantTotal,
      observed,
      derived: 3 - observed.length,
      score,
    })
  }

  /** 공급가만 안 읽힌 경우 — 부가세와 합계로 되짚는다 */
  for (const vat of money) {
    for (const total of money) {
      if (total === vat || total.value <= vat.value) continue
      const net = round2(total.value - vat.value)
      if (net < 1) continue
      if (Math.abs(vat.value - net * 0.07) > 0.05) continue
      if (money.some((m) => Math.abs(m.value - net) <= 0.01)) continue
      const vatLabel = lineHas(lines, vat.lineIdx, VAT_LABEL_RE)
      const totalLabel = lineHas(lines, total.lineIdx, TOTAL_LABEL_RE)
      if (!vatLabel && !totalLabel) continue
      combos.push({
        net,
        vat: vat.value,
        total: total.value,
        observed: [vat, total],
        derived: 1,
        score: (vatLabel ? 4 : 0) + (totalLabel ? 3 : 0) + 4,
      })
    }
  }

  if (!combos.length) return {}
  combos.sort((a, b) => b.score - a.score || b.net - a.net)
  const top = combos[0]
  const ambiguous = combos.some((c) => c !== top && c.score === top.score && Math.abs(c.net - top.net) > 0.01)
  const meanConf = top.observed.reduce((a, m) => a + m.conf, 0) / top.observed.length
  const conf = Math.min(
    99,
    Math.round(meanConf * (ambiguous ? 0.7 : 1) * (top.derived ? 0.94 : 1) + top.score)
  )
  const src = ambiguous
    ? 'amount-ambiguous'
    : top.derived
      ? `amount-${top.observed.length}of3`
      : 'amount-triple'
  return {
    net: { value: top.net, confidence: conf, source: src },
    vat: { value: top.vat, confidence: conf, source: src },
    total: { value: top.total, confidence: conf, source: src },
  }
}

// ─────────────────────────────────────────────────────────── 날짜

const DOC_DATE_LABEL_RE = labelPattern(
  ['วันที่ออก', 'วันที่ใบกำกับ', 'วันที่เอกสาร', 'วันที่'],
  'ISSUE\\s*DATE|INVOICE\\s*DATE|DOCUMENT\\s*DATE|\\bDATE\\b'
)
const DUE_DATE_LABEL_RE = labelPattern(
  ['ครบกำหนด', 'วันที่ครบ', 'ชำระภายใน'],
  'DUE\\s*DATE|VALID\\s*UNTIL'
)

function toIsoDate(d: number, m: number, y: number): string | undefined {
  let year = y
  if (year < 100) year += year > 60 ? 1900 : 2000
  if (year >= 2400) year -= 543
  if (year < 2000 || year > 2100) return undefined
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function findLayoutDocDate(layout: OcrPageLayout): LayoutField<string> | undefined {
  const lines = compactLayoutLines(layout)
  let best: (LayoutField<string> & { score: number }) | undefined
  for (const cl of lines) {
    const isDue = DUE_DATE_LABEL_RE.test(cl.text)
    const labeled = DOC_DATE_LABEL_RE.test(cl.text)
    for (const w of cl.line.words) {
      const m = String(w.text || '').match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
      if (!m) continue
      const iso = toIsoDate(Number(m[1]), Number(m[2]), Number(m[3]))
      if (!iso) continue
      const score = (labeled ? 10 : 0) - (isDue ? 8 : 0) + Math.round(w.conf / 25)
      if (best && best.score >= score) continue
      best = {
        value: iso,
        confidence: Math.min(99, w.conf),
        source: labeled ? 'date-labeled' : 'date-plain',
        score,
      }
    }
  }
  if (!best) return undefined
  return { value: best.value, confidence: best.confidence, source: best.source }
}

// ─────────────────────────────────────────────────────────── 통합

export function extractFromLayout(
  layout: OcrPageLayout,
  buyerTaxIdHint?: string,
  /** 판매자 세금번호 → 그 거래처 번호 꼴. 앞선 장·과거 저장분에서 만든다. */
  vendorHints?: Map<string, VendorInvoiceHint>
): LayoutExtract {
  const tins = findLayoutTaxIds(layout, buyerTaxIdHint)
  const amounts = findLayoutAmounts(layout)
  const hint = tins.seller ? vendorHints?.get(tins.seller.value) : undefined
  return {
    invoiceNo: findLayoutInvoiceNo(layout, hint),
    sellerTaxId: tins.seller,
    buyerTaxId: tins.buyer,
    netAmount: amounts.net,
    vatAmount: amounts.vat,
    totalAmount: amounts.total,
    docDate: findLayoutDocDate(layout),
  }
}

// ───────────────────────────────────────────── 통짜 텍스트 판독 결과와 합치기

/** 이보다 흐릿하면 값을 넣지 않고 비워 둔다 — 틀린 값보다 빈칸이 낫다 */
export const LAYOUT_MIN_CONFIDENCE = 55

export type LayoutMergeResult = {
  fields: ExtractedPurchaseTaxInvoiceFields
  /** 좌표 판독이 바꾼 항목 */
  usedLayout: string[]
  /** 좌표 판독과 텍스트 판독이 어긋난 항목 — 사람이 봐야 한다 */
  disagreed: string[]
}

function usable<T>(f: LayoutField<T> | undefined): LayoutField<T> | undefined {
  return f && f.confidence >= LAYOUT_MIN_CONFIDENCE ? f : undefined
}

const sameNo = (a?: string, b?: string) =>
  normToken(String(a || '')) === normToken(String(b || '')) && Boolean(a) && Boolean(b)

/**
 * 좌표 판독이 텍스트 판독보다 믿을 만한 항목만 덮어쓴다.
 *
 * 번호·세금번호·금액은 라벨 위치와 7% 검산으로 교차 확인되므로 좌표 쪽을 쓴다.
 * 판매자명·지점·날짜는 태국어 문장을 통으로 봐야 해서 기존 텍스트 판독이 더 낫다.
 */
export function applyLayoutExtract(
  base: ExtractedPurchaseTaxInvoiceFields | null | undefined,
  extract: LayoutExtract | undefined
): LayoutMergeResult {
  const fields: ExtractedPurchaseTaxInvoiceFields = { ...(base || {}) }
  const usedLayout: string[] = []
  const disagreed: string[] = []
  if (!extract) return { fields, usedLayout, disagreed }

  const no = usable(extract.invoiceNo)
  if (no) {
    if (fields.invoiceNo && !sameNo(fields.invoiceNo, no.value)) disagreed.push('invoiceNo')
    if (fields.invoiceNo !== no.value) usedLayout.push('invoiceNo')
    fields.invoiceNo = no.value
  }

  const tin = usable(extract.sellerTaxId)
  if (tin) {
    if (fields.sellerTaxId && fields.sellerTaxId !== tin.value) disagreed.push('sellerTaxId')
    if (fields.sellerTaxId !== tin.value) usedLayout.push('sellerTaxId')
    fields.sellerTaxId = tin.value
  }

  // 금액은 공급가·부가세·합계가 서로 맞을 때만 나오므로 셋을 함께 갈아 끼운다
  const net = usable(extract.netAmount)
  const vat = usable(extract.vatAmount)
  if (net && vat) {
    const changed =
      Math.abs((fields.netAmount ?? -1) - net.value) > 0.01 || Math.abs((fields.vatAmount ?? -1) - vat.value) > 0.01
    if (fields.netAmount !== undefined && Math.abs(fields.netAmount - net.value) > 0.01) disagreed.push('netAmount')
    if (changed) usedLayout.push('amounts')
    fields.netAmount = net.value
    fields.vatAmount = vat.value
    const total = usable(extract.totalAmount)
    if (total) fields.totalAmount = total.value
  }

  if (!fields.docDate && extract.docDate) fields.docDate = extract.docDate.value
  return { fields, usedLayout, disagreed }
}

/** 저장된 과거 번호들로 거래처별 꼴 표를 만든다 */
export function buildVendorInvoiceHints(
  history: Array<{ sellerTaxId?: string | null; invoiceNo?: string | null }>
): Map<string, VendorInvoiceHint> {
  const byTin = new Map<string, string[]>()
  for (const h of history) {
    const tin = digitsTin13(h?.sellerTaxId || '')
    const no = String(h?.invoiceNo || '').trim()
    if (tin.length !== 13 || !no) continue
    byTin.set(tin, [...(byTin.get(tin) || []), no])
  }
  const out = new Map<string, VendorInvoiceHint>()
  for (const [tin, numbers] of byTin) {
    const hint = learnVendorInvoiceHint(numbers)
    if (hint) out.set(tin, hint)
  }
  return out
}
