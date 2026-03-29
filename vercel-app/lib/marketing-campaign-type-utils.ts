/** 캠페인 유형 라벨·저장값 변환 (허브·A/B 비교·필터에서 공통 사용) */

export const CAMPAIGN_TYPE_OPTIONS = [
  { value: "menu_discount", ko: "메뉴 할인 캠페인", en: "Menu Discount", th: "แคมเปญส่วนลดเมนู" },
  { value: "new_menu_launch", ko: "신메뉴 런칭", en: "New Menu Launch", th: "เปิดตัวเมนูใหม่" },
  { value: "membership_crm", ko: "멤버십/재방문 유도", en: "Membership/CRM", th: "สมาชิก/กระตุ้นการกลับมาซื้อ" },
  { value: "delivery_activation", ko: "배달 채널 활성화", en: "Delivery Activation", th: "กระตุ้นช่องทางเดลิเวอรี" },
  { value: "collab_marketing", ko: "협업 마케팅", en: "Collab Marketing", th: "การตลาดร่วมมือ" },
  { value: "brand_promo", ko: "브랜드 홍보 캠페인", en: "Brand Promotion", th: "แคมเปญโปรโมตแบรนด์" },
  { value: "new_store", ko: "신규 매장 오픈 캠페인", en: "New Store Opening", th: "แคมเปญเปิดสาขาใหม่" },
  { value: "seasonal", ko: "시즌/이벤트 캠페인", en: "Seasonal/Event", th: "แคมเปญตามฤดูกาล/อีเวนต์" },
  { value: "other", ko: "기타", en: "Other", th: "อื่นๆ" },
] as const

export const CAMPAIGN_TYPE_OTHER_PREFIX = "other:"

export const KPI_UNIT_OPTIONS = [
  { value: "order", label: "주문" },
  { value: "sales", label: "매출" },
  { value: "customer", label: "고객수" },
  { value: "new_customer", label: "신규고객" },
  { value: "repeat_customer", label: "재방문고객" },
  { value: "coupon", label: "쿠폰사용" },
  { value: "member", label: "회원가입" },
  { value: "impression", label: "노출수" },
  { value: "reach", label: "도달수" },
  { value: "click", label: "클릭수" },
  { value: "ctr", label: "클릭률(CTR)" },
  { value: "conversion", label: "전환수" },
  { value: "cvr", label: "전환율(CVR)" },
  { value: "roas", label: "ROAS" },
  { value: "aov", label: "객단가(AOV)" },
  { value: "followers", label: "팔로워증가" },
  { value: "engagement", label: "참여수" },
] as const

export function normalizeCampaignTypeInput(value: string) {
  return value.trim().replace(/\s+/g, " ")
}

export function toCampaignTypeFormState(raw: string | undefined | null) {
  const value = String(raw ?? "").trim()
  if (!value) return { type: "menu_discount", custom: "" }
  if (value.startsWith(CAMPAIGN_TYPE_OTHER_PREFIX)) {
    return {
      type: "other",
      custom: normalizeCampaignTypeInput(value.slice(CAMPAIGN_TYPE_OTHER_PREFIX.length)),
    }
  }
  const exists = CAMPAIGN_TYPE_OPTIONS.some((x) => x.value === value)
  if (exists) return { type: value, custom: "" }
  return { type: "other", custom: normalizeCampaignTypeInput(value) }
}

export function toCampaignTypeStorageValue(type: string, custom: string) {
  if (type !== "other") return type
  const normalized = normalizeCampaignTypeInput(custom)
  return normalized ? `${CAMPAIGN_TYPE_OTHER_PREFIX}${normalized}` : "other"
}

export function getCampaignTypeLabel(raw: string | undefined | null, lang: string) {
  const parsed = toCampaignTypeFormState(raw)
  if (parsed.type === "other") {
    if (parsed.custom) return parsed.custom
    if (lang === "en") return "Other"
    if (lang === "th") return "อื่นๆ"
    return "기타"
  }
  const option = CAMPAIGN_TYPE_OPTIONS.find((x) => x.value === parsed.type)
  if (!option) return String(raw ?? (lang === "en" ? "N/A" : lang === "th" ? "ไม่มีประเภท" : "유형없음"))
  if (lang === "en") return option.en
  if (lang === "th") return option.th
  return option.ko
}
