/**
 * 직원 UGC 자동번역용 도메인 용어집.
 * API 호출 전 용어를 플레이스홀더로 보호하고, 호출 후 목표 언어로 복원·후교정한다.
 * 상수만 늘리면 됨 (관리자 UI 없음).
 */

export type GlossaryLang = 'ko' | 'en' | 'th' | 'my' | 'lo' | 'km'

export type GlossaryEntry = {
  ko: string
  en: string
  th: string
  my: string
  lo: string
  km: string
}

/** 요식업·매장 운영에서 자주 깨지는 용어 (긴 표현 우선 매칭되도록 길이순 정렬됨) */
export const TRANSLATE_GLOSSARY: GlossaryEntry[] = [
  {
    ko: '매장 점검',
    en: 'store inspection',
    th: 'การตรวจร้าน',
    my: 'ဆိုင်စစ်ဆေးခြင်း',
    lo: 'ການກວດຮ້ານ',
    km: 'ការត្រួតពិនិត្យហាង',
  },
  {
    ko: '수리 현황',
    en: 'repair status',
    th: 'สถานะการซ่อม',
    my: 'ပြုပြင်မှုအခြေအနေ',
    lo: 'ສະຖານະການຊ່ອມ',
    km: 'ស្ថានភាពជួសជុល',
  },
  {
    ko: '업무일지',
    en: 'work log',
    th: 'บันทึกงาน',
    my: 'အလုပ်မှတ်တမ်း',
    lo: 'ບັນທຶກວຽກ',
    km: 'កំណត់ហេតុការងារ',
  },
  {
    ko: '일정표',
    en: 'work schedule',
    th: 'ตารางงาน',
    my: 'အလုပ်အချိန်ဇယား',
    lo: 'ຕາຕະລາງວຽກ',
    km: 'តារាងការងារ',
  },
  {
    ko: '내일 일정표',
    en: "tomorrow's schedule",
    th: 'ตารางงานพรุ่งนี้',
    my: 'မနက်ဖြန်အလုပ်အချိန်ဇယား',
    lo: 'ຕາຕະລາງວຽກມື້ອື່ນ',
    km: 'តារាងការងារថ្ងៃស្អែក',
  },
  {
    ko: '공지사항',
    en: 'notice',
    th: 'ประกาศ',
    my: 'ကြေညာချက်',
    lo: 'ປະກາດ',
    km: 'សេចក្តីជូនដំណឹង',
  },
  {
    ko: '체크빌',
    en: 'check bill',
    th: 'เช็คบิล',
    my: 'ချက်ဘေလ်',
    lo: 'ເຊັກບິນ',
    km: 'ឆែកប៊ីល',
  },
  {
    ko: '주방 주문서',
    en: 'kitchen slip',
    th: 'ใบสั่งครัว',
    my: 'မီးဖိုချောင်အော်ဒါလက်မှတ်',
    lo: 'ໃບສັ່ງຄົວ',
    km: 'ប័ណ្ណបញ្ជាផ្ទះបាយ',
  },
  {
    ko: '시재 마감',
    en: 'cash closing',
    th: 'ปิดยอดเงินสด',
    my: 'ငွေသားပိတ်သိမ်းခြင်း',
    lo: 'ປິດຍອດເງິນສົດ',
    km: 'បិទសមតុល្យសាច់ប្រាក់',
  },
  {
    ko: '서비스 구역',
    en: 'service area',
    th: 'พื้นที่บริการ',
    my: 'ဝန်ဆောင်မှုဧရိယာ',
    lo: 'ເຂດບໍລິການ',
    km: 'តំបន់សេវាកម្ម',
  },
  {
    ko: '청결 점검',
    en: 'cleanliness check',
    th: 'ตรวจสอบความสะอาด',
    my: 'သန့်ရှင်းရေးစစ်ဆေးခြင်း',
    lo: 'ກວດຄວາມສະອາດ',
    km: 'ពិនិត្យភាពស្អាត',
  },
  {
    ko: '화장실 청소',
    en: 'restroom cleaning',
    th: 'ทำความสะอาดห้องน้ำ',
    my: 'အိမ်သာသန့်ရှင်းရေး',
    lo: 'ທຳຄວາມສະອາດຫ້ອງນ້ຳ',
    km: 'សម្អាតបន្ទប់ទឹក',
  },
  {
    ko: '고객 응대',
    en: 'guest service',
    th: 'การต้อนรับลูกค้า',
    my: 'ဧည့်သည်ဝန်ဆောင်မှု',
    lo: 'ການຕ້ອນຮັບລູກຄ້າ',
    km: 'សេវាភ្ញៀវ',
  },
  {
    ko: '서빙',
    en: 'serving',
    th: 'เสิร์ฟ',
    my: 'စားပွဲထိုး',
    lo: 'ເສີບ',
    km: 'បម្រើអាហារ',
  },
  {
    ko: '본사 과제',
    en: 'HQ task',
    th: 'งานสำนักงานใหญ่',
    my: 'ရုံးချုပ်တာဝန်',
    lo: 'ໜ້າວຽກສຳນັກງານໃຫຍ່',
    km: 'ភារកិច្ចការិយាល័យកណ្តាល',
  },
  {
    ko: '개선 과제',
    en: 'improvement task',
    th: 'งานปรับปรุง',
    my: 'တိုးတက်ရေးတာဝန်',
    lo: 'ໜ້າວຽກປັບປຸງ',
    km: 'ភារកិច្ចកែលម្អ',
  },
  {
    ko: '재확인',
    en: 're-check',
    th: 'ตรวจซ้ำ',
    my: 'ပြန်လည်စစ်ဆေးခြင်း',
    lo: 'ກວດຊ້ຳ',
    km: 'ពិនិត្យឡើងវិញ',
  },
  {
    ko: '본사',
    en: 'head office',
    th: 'สำนักงานใหญ่',
    my: 'ရုံးချုပ်',
    lo: 'ສຳນັກງານໃຫຍ່',
    km: 'ការិយាល័យកណ្តាល',
  },
  {
    ko: '가맹점',
    en: 'franchise store',
    th: 'ร้านแฟรนไชส์',
    my: 'ဖရန်ချိုက်စ်ဆိုင်',
    lo: 'ຮ້ານແຟຣນຊາຍ',
    km: 'ហាងហ្វ្រេនឆាយ',
  },
  {
    ko: '매장',
    en: 'store',
    th: 'ร้าน',
    my: 'ဆိုင်',
    lo: 'ຮ້ານ',
    km: 'ហាង',
  },
  {
    ko: '홀',
    en: 'dine-in',
    th: 'ทานที่ร้าน',
    my: 'ဆိုင်တွင်စား',
    lo: 'ກິນທີ່ຮ້ານ',
    km: 'ញ៉ាំនៅហាង',
  },
  {
    ko: '포장',
    en: 'takeout',
    th: 'ซื้อกลับ',
    my: 'ထုပ်ပိုးယူ',
    lo: 'ຫຸ້ມກັບບ້ານ',
    km: 'វេចខ្ចប់យក',
  },
  {
    ko: '배달',
    en: 'delivery',
    th: 'เดลิเวอรี',
    my: 'ပို့ဆောင်ခြင်း',
    lo: 'ຈັດສົ່ງ',
    km: 'ដឹកជញ្ជូន',
  },
  {
    ko: '매니저',
    en: 'manager',
    th: 'ผู้จัดการ',
    my: 'မန်နေဂျာ',
    lo: 'ຜູ້ຈັດການ',
    km: 'អ្នកគ្រប់គ្រង',
  },
  {
    ko: '점장',
    en: 'store manager',
    th: 'ผู้จัดการร้าน',
    my: 'ဆိုင်မန်နေဂျာ',
    lo: 'ຜູ້ຈັດການຮ້ານ',
    km: 'អ្នកគ្រប់គ្រងហាង',
  },
  {
    ko: '슈퍼바이저',
    en: 'supervisor',
    th: 'ซุปเปอร์ไวเซอร์',
    my: 'ကြီးကြပ်သူ',
    lo: 'ຜູ້ຄຸມງານ',
    km: 'អ្នកត្រួតពិនិត្យ',
  },
  {
    ko: '직원',
    en: 'staff',
    th: 'พนักงาน',
    my: 'ဝန်ထမ်း',
    lo: 'ພະນັກງານ',
    km: 'បុគ្គលិក',
  },
  {
    ko: '출근',
    en: 'clock-in',
    th: 'ลงเวลาเข้างาน',
    my: 'အလုပ်ဝင်ချိန်မှတ်ခြင်း',
    lo: 'ບັນທຶກເຂົ້າວຽກ',
    km: 'ចុះម៉ោងចូលធ្វើការ',
  },
  {
    ko: '퇴근',
    en: 'clock-out',
    th: 'ลงเวลาออกงาน',
    my: 'အလုပ်ထွက်ချိန်မှတ်ခြင်း',
    lo: 'ບັນທຶກອອກວຽກ',
    km: 'ចុះម៉ោងចេញពីការងារ',
  },
  {
    ko: '재고',
    en: 'inventory',
    th: 'สต็อก',
    my: 'စတော့',
    lo: 'ສະຕັອກ',
    km: 'ស្តុក',
  },
  {
    ko: '입고',
    en: 'inbound',
    th: 'รับเข้า',
    my: 'လက်ခံဝင်',
    lo: 'ຮັບເຂົ້າ',
    km: 'ទទួលចូល',
  },
  {
    ko: '출고',
    en: 'outbound',
    th: 'จ่ายออก',
    my: 'ထုတ်ပေး',
    lo: 'ຈ່າຍອອກ',
    km: 'ចេញទំនិញ',
  },
  {
    ko: '수리',
    en: 'repair',
    th: 'ซ่อม',
    my: 'ပြုပြင်ခြင်း',
    lo: 'ຊ່ອມ',
    km: 'ជួសជុល',
  },
  {
    ko: '점검',
    en: 'inspection',
    th: 'ตรวจ',
    my: 'စစ်ဆေးခြင်း',
    lo: 'ກວດ',
    km: 'ត្រួតពិនិត្យ',
  },
  {
    ko: '청소',
    en: 'cleaning',
    th: 'ทำความสะอาด',
    my: 'သန့်ရှင်းရေး',
    lo: 'ທຳຄວາມສະອາດ',
    km: 'សម្អាត',
  },
  {
    ko: '긴급',
    en: 'urgent',
    th: 'ด่วน',
    my: 'အရေးပေါ်',
    lo: 'ດ່ວນ',
    km: 'បន្ទាន់',
  },
  {
    ko: '반려',
    en: 'rejected',
    th: 'ปฏิเสธ',
    my: 'ငြင်းပယ်ခြင်း',
    lo: 'ປະຕິເສດ',
    km: 'បដិសេធ',
  },
  {
    ko: '승인',
    en: 'approved',
    th: 'อนุมัติ',
    my: 'အတည်ပြုခြင်း',
    lo: 'ອະນຸມັດ',
    km: 'អនុម័ត',
  },
]

const PLACEHOLDER_RE = /__CMTERM_(\d+)__/g
const GLOSSARY_LANGS: GlossaryLang[] = ['ko', 'en', 'th', 'my', 'lo', 'km']

function termFor(entry: GlossaryEntry, lang: GlossaryLang): string {
  return entry[lang]
}

function detectSourceLangHint(text: string): GlossaryLang | 'mixed' {
  const hasKo = /[가-힣]/.test(text)
  const hasTh = /[\u0E00-\u0E7F]/.test(text)
  const hasMy = /[\u1000-\u109F]/.test(text)
  const hasLo = /[\u0E80-\u0EFF]/.test(text)
  const hasKm = /[\u1780-\u17FF]/.test(text)
  const hasLatin = /[A-Za-z]/.test(text)
  const n =
    Number(hasKo) + Number(hasTh) + Number(hasMy) + Number(hasLo) + Number(hasKm) + Number(hasLatin)
  if (n > 1) return 'mixed'
  if (hasKo) return 'ko'
  if (hasTh) return 'th'
  if (hasMy) return 'my'
  if (hasLo) return 'lo'
  if (hasKm) return 'km'
  if (hasLatin) return 'en'
  return 'mixed'
}

function normalizeTargetLang(tl: string): GlossaryLang | null {
  const raw = String(tl || '').toLowerCase().slice(0, 2)
  if (raw === 'ko' || raw === 'en' || raw === 'th' || raw === 'my' || raw === 'lo' || raw === 'km') {
    return raw
  }
  if (raw === 'mm') return 'my'
  if (raw === 'la') return 'lo'
  if (raw === 'kh') return 'km'
  return null
}

function entriesSorted(): GlossaryEntry[] {
  return [...TRANSLATE_GLOSSARY].sort((a, b) => {
    const la = Math.max(a.ko.length, a.en.length, a.th.length, a.my.length, a.lo.length, a.km.length)
    const lb = Math.max(b.ko.length, b.en.length, b.th.length, b.my.length, b.lo.length, b.km.length)
    return lb - la
  })
}

/**
 * 원문에서 용어집 매칭분을 플레이스홀더로 치환.
 * sourceLangHint가 mixed면 지원 언어 모든 표기를 시도한다.
 */
export function protectGlossaryTerms(
  text: string,
  sourceLangHint?: GlossaryLang | 'mixed'
): { text: string; slots: GlossaryEntry[] } {
  const hint = sourceLangHint ?? detectSourceLangHint(text)
  const langs: GlossaryLang[] = hint === 'mixed' ? GLOSSARY_LANGS : [hint]
  const slots: GlossaryEntry[] = []
  let out = text
  for (const entry of entriesSorted()) {
    for (const lang of langs) {
      const term = termFor(entry, lang)
      if (!term || term.length < 2) continue
      if (!out.includes(term)) continue
      const idx = slots.length
      slots.push(entry)
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
      return e ? e.ko : ''
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
    const others: GlossaryLang[] = GLOSSARY_LANGS.filter((l) => l !== tl)
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
