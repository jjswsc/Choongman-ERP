/**
 * 직원 UGC 자동번역용 도메인 용어집.
 * API 호출 전 용어를 플레이스홀더로 보호하고, 호출 후 목표 언어로 복원·후교정한다.
 * 상수만 늘리면 됨 (관리자 UI 없음).
 */

export type GlossaryLang = 'ko' | 'en' | 'th'

export type GlossaryEntry = {
  ko: string
  en: string
  th: string
}

/** 요식업·매장 운영에서 자주 깨지는 용어 (긴 표현 우선 매칭되도록 길이순 정렬됨) */
export const TRANSLATE_GLOSSARY: GlossaryEntry[] = [
  { ko: '매장 점검', en: 'store inspection', th: 'การตรวจร้าน' },
  { ko: '수리 현황', en: 'repair status', th: 'สถานะการซ่อม' },
  { ko: '업무일지', en: 'work log', th: 'บันทึกงาน' },
  { ko: '공지사항', en: 'notice', th: 'ประกาศ' },
  { ko: '체크빌', en: 'check bill', th: 'เช็คบิล' },
  { ko: '주방 주문서', en: 'kitchen slip', th: 'ใบสั่งครัว' },
  { ko: '시재 마감', en: 'cash closing', th: 'ปิดยอดเงินสด' },
  { ko: '본사', en: 'head office', th: 'สำนักงานใหญ่' },
  { ko: '가맹점', en: 'franchise store', th: 'ร้านแฟรนไชส์' },
  { ko: '매장', en: 'store', th: 'ร้าน' },
  { ko: '홀', en: 'dine-in', th: 'ทานที่ร้าน' },
  { ko: '포장', en: 'takeout', th: 'ซื้อกลับ' },
  { ko: '배달', en: 'delivery', th: 'เดลิเวอรี' },
  { ko: '매니저', en: 'manager', th: 'ผู้จัดการ' },
  { ko: '점장', en: 'store manager', th: 'ผู้จัดการร้าน' },
  { ko: '직원', en: 'staff', th: 'พนักงาน' },
  { ko: '출근', en: 'clock-in', th: 'ลงเวลาเข้างาน' },
  { ko: '퇴근', en: 'clock-out', th: 'ลงเวลาออกงาน' },
  { ko: '재고', en: 'inventory', th: 'สต็อก' },
  { ko: '입고', en: 'inbound', th: 'รับเข้า' },
  { ko: '출고', en: 'outbound', th: 'จ่ายออก' },
  { ko: '수리', en: 'repair', th: 'ซ่อม' },
  { ko: '점검', en: 'inspection', th: 'ตรวจ' },
  { ko: '긴급', en: 'urgent', th: 'ด่วน' },
  { ko: '반려', en: 'rejected', th: 'ปฏิเสธ' },
  { ko: '승인', en: 'approved', th: 'อนุมัติ' },
]

const PLACEHOLDER_RE = /__CMTERM_(\d+)__/g

function termFor(entry: GlossaryEntry, lang: GlossaryLang): string {
  return entry[lang]
}

function detectSourceLangHint(text: string): GlossaryLang | 'mixed' {
  const hasKo = /[가-힣]/.test(text)
  const hasTh = /[\u0E00-\u0E7F]/.test(text)
  const hasLatin = /[A-Za-z]/.test(text)
  const n = Number(hasKo) + Number(hasTh) + Number(hasLatin)
  if (n > 1) return 'mixed'
  if (hasKo) return 'ko'
  if (hasTh) return 'th'
  if (hasLatin) return 'en'
  return 'mixed'
}

function normalizeTargetLang(tl: string): GlossaryLang | null {
  const raw = String(tl || '').toLowerCase().slice(0, 2)
  if (raw === 'ko' || raw === 'en' || raw === 'th') return raw
  return null
}

function entriesSorted(): GlossaryEntry[] {
  return [...TRANSLATE_GLOSSARY].sort((a, b) => {
    const la = Math.max(a.ko.length, a.en.length, a.th.length)
    const lb = Math.max(b.ko.length, b.en.length, b.th.length)
    return lb - la
  })
}

/**
 * 원문에서 용어집 매칭분을 플레이스홀더로 치환.
 * sourceLangHint가 mixed면 ko/th/en 모든 표기를 시도한다.
 */
export function protectGlossaryTerms(
  text: string,
  sourceLangHint?: GlossaryLang | 'mixed'
): { text: string; slots: GlossaryEntry[] } {
  const hint = sourceLangHint ?? detectSourceLangHint(text)
  const langs: GlossaryLang[] =
    hint === 'mixed' ? ['ko', 'th', 'en'] : [hint]
  const slots: GlossaryEntry[] = []
  let out = text
  for (const entry of entriesSorted()) {
    for (const lang of langs) {
      const term = termFor(entry, lang)
      if (!term || term.length < 2) continue
      if (!out.includes(term)) continue
      const idx = slots.length
      slots.push(entry)
      // 전역 치환 (대소문자 무시는 영문만)
      if (lang === 'en') {
        const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
        out = out.replace(re, `__CMTERM_${idx}__`)
      } else {
        out = out.split(term).join(`__CMTERM_${idx}__`)
      }
    }
  }
  return { text: out, slots }
}

/** 번역 결과의 플레이스홀더를 목표 언어 용어로 복원 */
export function restoreGlossaryTerms(
  translated: string,
  slots: GlossaryEntry[],
  targetLang: string
): string {
  const tl = normalizeTargetLang(targetLang)
  if (!tl || slots.length === 0) {
    return translated.replace(PLACEHOLDER_RE, (_, i) => {
      const e = slots[Number(i)]
      return e ? e.en : ''
    })
  }
  return translated.replace(PLACEHOLDER_RE, (_, i) => {
    const e = slots[Number(i)]
    return e ? termFor(e, tl) : ''
  })
}

/**
 * 엔진이 용어를 잘못 번역한 경우 후교정.
 * 목표 언어가 아닌 표기·흔한 오역을 목표 용어로 바꾼다.
 */
export function applyGlossaryPostCorrect(translated: string, targetLang: string): string {
  const tl = normalizeTargetLang(targetLang)
  if (!tl) return translated
  let out = translated
  for (const entry of entriesSorted()) {
    const correct = termFor(entry, tl)
    if (!correct) continue
    const others: GlossaryLang[] = (['ko', 'en', 'th'] as GlossaryLang[]).filter((l) => l !== tl)
    for (const lang of others) {
      const wrong = termFor(entry, lang)
      if (!wrong || wrong.length < 2) continue
      if (lang === 'en') {
        const re = new RegExp(`(?<![A-Za-z])${wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, 'gi')
        out = out.replace(re, correct)
      } else if (out.includes(wrong)) {
        out = out.split(wrong).join(correct)
      }
    }
  }
  return out
}

/** protect → (번역) → restore → postCorrect 파이프라인 헬퍼 */
export function wrapWithGlossary(
  source: string,
  targetLang: string,
  translateCore: (protectedText: string) => Promise<string>
): Promise<string> {
  const { text: protectedText, slots } = protectGlossaryTerms(source)
  return translateCore(protectedText).then((raw) => {
    const restored = restoreGlossaryTerms(raw, slots, targetLang)
    return applyGlossaryPostCorrect(restored, targetLang)
  })
}
