import {
  I18N_POS_EN,
  I18N_POS_KH,
  I18N_POS_KO,
  I18N_POS_LA,
  I18N_POS_MM,
  I18N_POS_MS,
  I18N_POS_TH,
  I18N_POS_VI,
} from "@/lib/i18n-pos"

/** 태국 현장은 POS 언어를 English로 두는 경우가 많아, 차단 안내는 태국어를 맨 앞에 둔다. */
const POS_NOTICE_LANG_ORDER = ["th", "ko", "en", "mm", "la", "kh", "vi", "ms"] as const

const POS_DICTS: Record<(typeof POS_NOTICE_LANG_ORDER)[number], Record<string, string>> = {
  th: I18N_POS_TH,
  ko: I18N_POS_KO,
  en: I18N_POS_EN,
  mm: I18N_POS_MM,
  la: I18N_POS_LA,
  kh: I18N_POS_KH,
  vi: I18N_POS_VI,
  ms: I18N_POS_MS,
}

/** 동일 안내를 8개 언어로 이어 붙여, 언어 설정과 관계없이 읽을 수 있게 한다. */
export function joinPosI18nAllLangs(key: string, fallback = ""): string {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const lang of POS_NOTICE_LANG_ORDER) {
    const s = String(POS_DICTS[lang]?.[key] ?? "").trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    parts.push(s)
  }
  return parts.join("\n\n") || fallback
}
