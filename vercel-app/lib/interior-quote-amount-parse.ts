/** 견적서·PDF 텍스트에서 총액 후보 추출 (휴리스틱) */

/** 총액 키워드 — 점수 높을수록 우선 (subtotal보다 grand total) */
const TOTAL_KEYWORD_RULES: { re: RegExp; score: number }[] = [
  { re: /grand\s*total|รวมทั้งสิ้น|รวมเป็นเงิน|ยอดรวมทั้งสิ้น|amount\s*due|total\s*amount\s*due/i, score: 100 },
  { re: /ยอดรวม|ราคารวม|ยอดสุทธิ|รวมสุทธิ|net\s*amount|total\s*amount|amount\s*payable/i, score: 80 },
  { re: /(?:^|[^a-z])total(?:[^a-z]|$)|ทั้งหมด|สุทธิ|รวม(?!\s*(?:vat|ภาษี))/i, score: 50 },
  { re: /sub\s*-?\s*total|ก่อนภาษี|before\s*vat/i, score: 20 },
]

/** 숫자 직전 문서번호·견적번호 접두어 — 뒤따르는 숫자는 금액 후보에서 제외 */
const DOC_REF_PREFIX_BEFORE_AMOUNT =
  /(?:^|[^A-Za-z0-9])(?:QO|QT|QUO|QU|INV|IV|TI|PO|SO|DN|CN|RFQ|REF|NO|เลขที่|ใบเสนอ|ใบแจ้ง)[\s\-#.:/]*$/i

function totalKeywordScore(line: string): number {
  let best = 0
  for (const rule of TOTAL_KEYWORD_RULES) {
    if (rule.re.test(line)) best = Math.max(best, rule.score)
  }
  return best
}

export type ParsedQuoteAmount = {
  amount: number
  label: string
  confidence: 'high' | 'medium' | 'low'
  method: 'keyword' | 'max' | 'vision'
}

export type ParseQuoteAmountOptions = {
  /** 파일명 등에서 추출한 숫자 — 문서번호로 금액 오인 방지 (예: QO260800139.pdf → 260800139) */
  excludeDigitSequences?: string[]
}

type AmountCandidate = {
  amount: number
  moneyLike: boolean
  fromDocRef: boolean
}

function digitSequencesFromFileName(fileName: string): string[] {
  const base = String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .trim()
  if (!base) return []
  const matches = base.match(/\d{5,}/g) || []
  return [...new Set(matches)]
}

export function digitSequencesFromExpenseFileName(fileName: string): string[] {
  return digitSequencesFromFileName(fileName)
}

function isExcludedByFileName(n: number, exclude: Set<string>): boolean {
  if (!exclude.size) return false
  const asInt = String(Math.trunc(n))
  if (exclude.has(asInt)) return true
  for (const dig of exclude) {
    if (dig.length >= 5 && (asInt === dig || asInt.endsWith(dig) || dig.endsWith(asInt))) return true
  }
  return false
}

/** 긴 정수·문서번호 패턴은 금액으로 쓰지 않음 (소수점·천단위 구분 없는 8자리+ 정수) */
function looksLikeDocumentIdAmount(n: number, moneyLike: boolean): boolean {
  if (moneyLike) return false
  if (!Number.isInteger(n)) return false
  // 1억 이상 정수(소수점 없음)는 요식 지출·일반 견적에서 문서번호일 가능성이 큼
  if (n >= 100_000_000) return true
  // 8자리 이상 순수 정수도 견적/인보이스 번호에 흔함 (예: 260800139)
  if (n >= 10_000_000) return true
  return false
}

function parseAmountCandidatesFromFragment(
  fragment: string,
  exclude: Set<string>
): AmountCandidate[] {
  const cleaned = fragment.replace(/฿|THB|บาท|Baht|USD|\$/gi, ' ')
  const out: AmountCandidate[] = []
  // 원문에 콤마가 있거나 소수점이 있으면 moneyLike
  const re = /\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{1,2}|\d+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cleaned)) !== null) {
    const raw = m[0]
    const start = m.index
    const before = cleaned.slice(Math.max(0, start - 24), start)
    const fromDocRef = DOC_REF_PREFIX_BEFORE_AMOUNT.test(before)
    const moneyLike = /[.,]/.test(raw)
    const amount = Number(raw.replace(/,/g, ''))
    if (!Number.isFinite(amount) || amount < 100 || amount >= 500_000_000) continue
    if (isExcludedByFileName(amount, exclude)) continue
    if (fromDocRef) continue
    if (looksLikeDocumentIdAmount(amount, moneyLike)) continue
    out.push({ amount, moneyLike, fromDocRef: false })
  }
  return out
}

function pickBestCandidate(cands: AmountCandidate[]): AmountCandidate | null {
  if (!cands.length) return null
  const money = cands.filter((c) => c.moneyLike)
  const pool = money.length ? money : cands
  // 키워드 줄에서는 마지막 금액형 숫자를 우선 (문서번호가 앞에, 총액이 뒤에 오는 경우)
  return pool[pool.length - 1]
}

/** PDF 바이너리에서 텍스트 스트림 대략 추출 */
export function extractRoughPdfText(buffer: ArrayBuffer): string {
  const raw = new TextDecoder('latin1').decode(buffer)
  const parts: string[] = []
  const re = /\((?:\\.|[^\\)])*?\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const s = m[0]
      .slice(1, -1)
      .replace(/\\([nrt()\\])/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (s.length >= 2 && /[\dA-Za-zก-๙]/.test(s)) parts.push(s)
  }
  return parts.join('\n')
}

export function parseQuoteAmountFromText(
  text: string,
  opts?: ParseQuoteAmountOptions
): ParsedQuoteAmount | null {
  const normalized = String(text || '').replace(/\u00a0/g, ' ')
  if (!normalized.trim()) return null

  const exclude = new Set(opts?.excludeDigitSequences || [])
  const lines = normalized.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  let bestKeyword: { amount: number; label: string; moneyLike: boolean; score: number } | null = null

  for (const line of lines) {
    const score = totalKeywordScore(line)
    if (!score) continue
    const cands = parseAmountCandidatesFromFragment(line, exclude)
    const picked = pickBestCandidate(cands)
    if (!picked) continue
    // 키워드 점수 → moneyLike → 금액 순
    if (
      !bestKeyword ||
      score > bestKeyword.score ||
      (score === bestKeyword.score && picked.moneyLike && !bestKeyword.moneyLike) ||
      (score === bestKeyword.score &&
        picked.moneyLike === bestKeyword.moneyLike &&
        picked.amount >= bestKeyword.amount)
    ) {
      bestKeyword = {
        amount: picked.amount,
        label: line.slice(0, 120),
        moneyLike: picked.moneyLike,
        score,
      }
    }
  }
  if (bestKeyword) {
    return {
      amount: bestKeyword.amount,
      label: bestKeyword.label,
      confidence: bestKeyword.moneyLike && bestKeyword.score >= 50 ? 'high' : 'medium',
      method: 'keyword',
    }
  }

  const allCands = parseAmountCandidatesFromFragment(normalized, exclude)
  if (!allCands.length) return null

  const money = allCands.filter((c) => c.moneyLike)
  if (money.length) {
    const amount = Math.max(...money.map((c) => c.amount))
    return {
      amount,
      label: 'max money-like',
      confidence: money.length > 1 ? 'medium' : 'low',
      method: 'max',
    }
  }

  // 금액형(콤마·소수)이 없으면 max 폴백은 쓰지 않음 — 문서번호만 있는 PDF에서 오인 방지
  return null
}

export async function extractQuoteAmountWithVision(fileUrl: string): Promise<ParsedQuoteAmount | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null

  const model = process.env.OPENAI_ERP_AI_MODEL?.trim() || 'gpt-4o-mini'
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 200,
      messages: [
        {
          role: 'system',
          content:
            'You extract the final payable total from Thai restaurant/interior quote documents. Reply JSON only: {"amount": number, "label": string}. amount is THB without commas. If unknown use amount 0. Never use quotation/invoice document numbers (e.g. QO260800139) as the amount.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract the final total quote amount in Thai Baht from this document image.',
            },
            { type: 'image_url', image_url: { url: fileUrl } },
          ],
        },
      ],
    }),
  })

  if (!res.ok) return null
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const raw = json.choices?.[0]?.message?.content?.trim() || ''
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as { amount?: number; label?: string }
    const amount = Number(parsed.amount)
    if (!Number.isFinite(amount) || amount <= 0) return null
    if (looksLikeDocumentIdAmount(amount, !Number.isInteger(amount))) return null
    return {
      amount,
      label: String(parsed.label || 'vision'),
      confidence: 'high',
      method: 'vision',
    }
  } catch {
    return null
  }
}

export async function extractQuoteAmountFromFileUrl(
  fileUrl: string,
  fileName: string
): Promise<{ result: ParsedQuoteAmount | null; openaiUsed: boolean }> {
  const lower = fileName.toLowerCase()
  const isPdf = lower.endsWith('.pdf')
  const isImage = /\.(png|jpe?g|webp|gif)$/.test(lower)
  const excludeDigitSequences = digitSequencesFromFileName(fileName)

  try {
    const res = await fetch(fileUrl, { cache: 'no-store' })
    if (!res.ok) return { result: null, openaiUsed: false }
    const buf = await res.arrayBuffer()

    if (isPdf) {
      const text = extractRoughPdfText(buf)
      const parsed = parseQuoteAmountFromText(text, { excludeDigitSequences })
      if (parsed?.confidence === 'high') return { result: parsed, openaiUsed: false }
      const vision = await extractQuoteAmountWithVision(fileUrl)
      if (vision) return { result: vision, openaiUsed: true }
      if (parsed) return { result: parsed, openaiUsed: false }
    }

    if (isImage) {
      const parsed = parseQuoteAmountFromText(new TextDecoder().decode(buf), { excludeDigitSequences })
      if (parsed && parsed.confidence === 'high') {
        return { result: parsed, openaiUsed: false }
      }
      const vision = await extractQuoteAmountWithVision(fileUrl)
      if (vision) return { result: vision, openaiUsed: true }
      if (parsed) return { result: parsed, openaiUsed: false }
    }

    if (isPdf) {
      const vision = await extractQuoteAmountWithVision(fileUrl)
      if (vision) return { result: vision, openaiUsed: true }
    }
  } catch {
    // fall through
  }

  return { result: null, openaiUsed: false }
}
