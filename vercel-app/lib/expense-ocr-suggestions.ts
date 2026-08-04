/** OCR 결과·문서 힌트로 지급처·계정과목 추천 */

export type VendorOption = { code: string; name: string }
export type SubjectOption = { id: number; code: string; name: string; nameEn?: string | null }

function norm(s: string) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(norm(a).split(/[^a-z0-9\u0e00-\u0e7f]+/i).filter((x) => x.length >= 2))
  const tb = new Set(norm(b).split(/[^a-z0-9\u0e00-\u0e7f]+/i).filter((x) => x.length >= 2))
  if (!ta.size || !tb.size) return 0
  let hit = 0
  for (const t of ta) if (tb.has(t)) hit++
  return hit / Math.max(ta.size, tb.size)
}

export function suggestVendorFromHint(
  vendors: VendorOption[],
  hintRaw?: string
): VendorOption | null {
  const hint = norm(hintRaw || '')
  if (!hint || hint.length < 2) return null
  let best: VendorOption | null = null
  let bestScore = 0
  for (const v of vendors) {
    const name = norm(v.name)
    const code = norm(v.code)
    let score = 0
    if (hint.includes(name) || name.includes(hint)) score = Math.max(score, 0.95)
    if (code && hint.includes(code)) score = Math.max(score, 0.9)
    score = Math.max(score, tokenOverlap(hint, name))
    if (score > bestScore && score >= 0.35) {
      bestScore = score
      best = v
    }
  }
  return best
}

const MEMO_SUBJECT_KEYWORDS: { keys: RegExp; codes: string[] }[] = [
  { keys: /rent|lease|임대|ค่าเช่า/i, codes: ['5510', '5520'] },
  { keys: /electric|water|utility|공과|ค่าไฟ|ค่าน้ำ|ค่าสาธารณูปโภค/i, codes: ['5520', '5510'] },
  { keys: /delivery|grab|lineman|shopee|배달|5528/i, codes: ['5528'] },
  { keys: /card fee|카드.?수수료|5529/i, codes: ['5529'] },
  { keys: /repair|maint|수리|유지|ซ่อม|บำรุง/i, codes: ['5520', '5530'] },
  { keys: /marketing|광고|advert|โฆษณา/i, codes: ['5540', '5520'] },
  { keys: /oven|kitchen\s*equip|equipment|เครื่อง(?:ครัว|จักร)|เตาอบ|อุปกรณ์/i, codes: ['5530', '1520', '5520'] },
  { keys: /packaging|บรรจุ|ถุง|กล่อง/i, codes: ['5520'] },
  { keys: /insurance|ประกัน/i, codes: ['5520'] },
  { keys: /fuel|น้ำมัน|gas|แก๊ส/i, codes: ['5520'] },
]

export function suggestAccountSubjectId(
  subjects: SubjectOption[],
  opts: { vendorName?: string; memo?: string; vendorCode?: string }
): number | null {
  const blob = norm([opts.vendorName, opts.memo, opts.vendorCode].filter(Boolean).join(' '))
  if (!blob) return null
  for (const rule of MEMO_SUBJECT_KEYWORDS) {
    if (!rule.keys.test(blob)) continue
    for (const code of rule.codes) {
      const found = subjects.find((s) => String(s.code).trim() === code)
      if (found?.id) return found.id
    }
  }
  return null
}

export function parseVendorNameHintFromText(text: string): string | undefined {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const vendorLine = lines.find((l) =>
    /(?:vendor|supplier|seller|sold\s*by|from|บริษัท|หจก\.?|บจก\.?|ผู้ขาย|ผู้จำหน่าย|ชื่อผู้ขาย|ออกโดย|ร้าน)/i.test(l)
  )
  if (vendorLine) {
    const cleaned = vendorLine
      .replace(/^[^:：]+[:：]\s*/, '')
      .replace(
        /(?:vendor|supplier|seller|sold\s*by|from|ผู้ขาย|ผู้จำหน่าย|ชื่อผู้ขาย|ออกโดย)\s*[:：]?\s*/i,
        ''
      )
      .trim()
    if (cleaned.length >= 2) return cleaned.slice(0, 80)
  }
  const ltd = lines.find(
    (l) =>
      /(co\.?,?\s*ltd|จำกัด|company|corp|หจก\.?|บจก\.?)/i.test(l) &&
      l.length >= 4 &&
      l.length <= 80 &&
      !/customer|ผู้ซื้อ|ลูกค้า|bill\s*to/i.test(l)
  )
  return ltd?.slice(0, 80)
}
