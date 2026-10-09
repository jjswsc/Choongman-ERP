/**
 * 공통 번역 - ko, en, th, mm, la, kh, vi, ms
 * 새 업데이트 시 관련 문자열을 반드시 모든 언어에 추가하세요.
 */
import { useMemo } from "react"
import { isLangCode } from "./lang-context"
import {
  I18N_ACCOUNTING_ADMIN_EN,
  I18N_ACCOUNTING_ADMIN_KH,
  I18N_ACCOUNTING_ADMIN_KO,
  I18N_ACCOUNTING_ADMIN_LA,
  I18N_ACCOUNTING_ADMIN_MM,
  I18N_ACCOUNTING_ADMIN_MS,
  I18N_ACCOUNTING_ADMIN_TH,
  I18N_ACCOUNTING_ADMIN_VI,
} from "./i18n-accounting-admin"
import { I18N_INTERIOR_ADMIN_EN, I18N_INTERIOR_ADMIN_KO, I18N_INTERIOR_ADMIN_TH } from "./i18n-interior-admin"
import {
  I18N_STORE_ADMIN_EN,
  I18N_STORE_ADMIN_KH,
  I18N_STORE_ADMIN_KO,
  I18N_STORE_ADMIN_LA,
  I18N_STORE_ADMIN_MM,
  I18N_STORE_ADMIN_MS,
  I18N_STORE_ADMIN_TH,
  I18N_STORE_ADMIN_VI,
} from "./i18n-store-admin"
import { DAILY_PLAN_I18N_BY_LANG, I18N_DAILY_PLAN_EN } from "./i18n-daily-plan"
import {
  I18N_MARKETING_HUB_EN,
  I18N_MARKETING_HUB_KH,
  I18N_MARKETING_HUB_KO,
  I18N_MARKETING_HUB_LA,
  I18N_MARKETING_HUB_MM,
  I18N_MARKETING_HUB_MS,
  I18N_MARKETING_HUB_TH,
  I18N_MARKETING_HUB_VI,
} from "./i18n-marketing-hub"
import { I18N_BASE_KO } from "./i18n-locales/ko"
import { I18N_BASE_EN } from "./i18n-locales/en"
import { I18N_BASE_TH } from "./i18n-locales/th"
import { I18N_BASE_MM } from "./i18n-locales/mm"
import { I18N_BASE_LA } from "./i18n-locales/la"
import { I18N_BASE_KH } from "./i18n-locales/kh"
import { I18N_BASE_VI } from "./i18n-locales/vi"
import { I18N_BASE_MS } from "./i18n-locales/ms"

export const i18n = {
  ko: I18N_BASE_KO,
  en: I18N_BASE_EN,
  th: I18N_BASE_TH,
  mm: I18N_BASE_MM,
  la: I18N_BASE_LA,
  kh: I18N_BASE_KH,
  vi: I18N_BASE_VI,
  ms: I18N_BASE_MS,
} as const

export type I18nKeys = keyof typeof i18n.ko

const POS_KEY_PREFIX = 'pos'
const DEMO_KEY_PREFIXES = ['posTour', 'posDemo', 'posMainTour'] as const
const DEMO_EN_FALLBACK_LANGS = new Set(['kh', 'vi', 'ms'])

function enOrKoDict(): Record<string, string> {
  const d = (i18n as { en?: Record<string, string> }).en ?? (i18n.ko as Record<string, string>)
  return d && typeof d === 'object' ? d : (i18n.ko as Record<string, string>)
}

function shouldPreferKoDemoCopy(
  lang: string,
  key: string,
  localized: string | undefined,
  enDict: Record<string, string>
): boolean {
  if (!DEMO_EN_FALLBACK_LANGS.has(lang)) return false
  if (!DEMO_KEY_PREFIXES.some((p) => key.startsWith(p))) return false
  if (!localized) return false
  return localized === enDict[key]
}

const ACCOUNTING_ADMIN_BY_LANG: Record<string, Record<string, string>> = {
  ko: I18N_ACCOUNTING_ADMIN_KO,
  en: I18N_ACCOUNTING_ADMIN_EN,
  th: I18N_ACCOUNTING_ADMIN_TH,
  mm: I18N_ACCOUNTING_ADMIN_MM,
  la: I18N_ACCOUNTING_ADMIN_LA,
  kh: I18N_ACCOUNTING_ADMIN_KH,
  vi: I18N_ACCOUNTING_ADMIN_VI,
  ms: I18N_ACCOUNTING_ADMIN_MS,
}

const INTERIOR_ADMIN_BY_LANG: Record<string, Record<string, string>> = {
  ko: I18N_INTERIOR_ADMIN_KO,
  en: I18N_INTERIOR_ADMIN_EN,
  th: I18N_INTERIOR_ADMIN_TH,
  mm: I18N_INTERIOR_ADMIN_EN,
  la: I18N_INTERIOR_ADMIN_EN,
  kh: I18N_INTERIOR_ADMIN_EN,
  vi: I18N_INTERIOR_ADMIN_EN,
  ms: I18N_INTERIOR_ADMIN_EN,
}


const MARKETING_HUB_BY_LANG: Record<string, Record<string, string>> = {
  ko: I18N_MARKETING_HUB_KO,
  en: I18N_MARKETING_HUB_EN,
  th: I18N_MARKETING_HUB_TH,
  mm: I18N_MARKETING_HUB_MM,
  la: I18N_MARKETING_HUB_LA,
  kh: I18N_MARKETING_HUB_KH,
  vi: I18N_MARKETING_HUB_VI,
  ms: I18N_MARKETING_HUB_MS,
}

const STORE_ADMIN_BY_LANG: Record<string, Record<string, string>> = {
  ko: I18N_STORE_ADMIN_KO,
  en: I18N_STORE_ADMIN_EN,
  th: I18N_STORE_ADMIN_TH,
  mm: I18N_STORE_ADMIN_MM,
  la: I18N_STORE_ADMIN_LA,
  kh: I18N_STORE_ADMIN_KH,
  vi: I18N_STORE_ADMIN_VI,
  ms: I18N_STORE_ADMIN_MS,
}

const i18nWithPosBackfill: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(i18n).map(([lang, dict]) => {
    const base = (dict as Record<string, string> | null | undefined) ?? (i18n.ko as Record<string, string>)
    const accountingPack = ACCOUNTING_ADMIN_BY_LANG[lang] ?? I18N_ACCOUNTING_ADMIN_EN
    const interiorPack = INTERIOR_ADMIN_BY_LANG[lang] ?? I18N_INTERIOR_ADMIN_EN
    const storeAdminPack = STORE_ADMIN_BY_LANG[lang] ?? I18N_STORE_ADMIN_EN
    const marketingHubPack = MARKETING_HUB_BY_LANG[lang] ?? I18N_MARKETING_HUB_EN
    const dailyPlanPack = DAILY_PLAN_I18N_BY_LANG[lang] ?? I18N_DAILY_PLAN_EN
    const merged = { ...base, ...accountingPack, ...interiorPack, ...storeAdminPack, ...marketingHubPack, ...dailyPlanPack }
    const enDict = enOrKoDict()

    for (const key of Object.keys(enDict)) {
      if (!key.startsWith(POS_KEY_PREFIX)) continue
      if (merged[key] == null || merged[key] === '') {
        merged[key] = enDict[key]
      }
    }

    return [lang, merged]
  })
)

/**
 * `orderLineRemarksPh` 미등록·폴백 키 노출 시 사람이 읽는 문구로 대체
 * (미번역 시 키가 그대로 나오는 경우는 공용 `tOr` 참고)
 */
export function getLineRemarksPh(lang: string, t: (k: string) => string): string {
  const s = t("orderLineRemarksPh").trim()
  if (s && s !== "orderLineRemarksPh") return s
  if (lang === "en") return "Remarks (weight, price, etc.)"
  if (lang === "th") return "หมายเหตุ (น้ำหนัก/ราคา ฯลฯ)"
  return "비고 (무게/단가 등)"
}

/** useT와 동일 규칙 — React 바깥(인쇄 유틸 등)에서 사용. `vars`로 `{name}` 치환 */
export function getUiString(
  lang: string,
  key: string,
  vars?: Record<string, string | number>
): string {
  const l = (lang in i18nWithPosBackfill ? lang : 'ko') as keyof typeof i18nWithPosBackfill
  const dict = i18nWithPosBackfill[l] || (i18nWithPosBackfill.ko as Record<string, string>)
  const enDict = enOrKoDict()
  const koDict = i18nWithPosBackfill.ko as Record<string, string>
  const localized = (dict as Record<string, string>)[key]
  let s = shouldPreferKoDemoCopy(String(l), key, localized, enDict)
    ? (koDict[key] ?? enDict[key] ?? key)
    : (localized ?? enDict[key] ?? key)
  if (!vars) return s
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v))
  }
  return s
}

/** 브라우저 sessionStorage `cm_lang` (없으면 ko) */
export function getClientUiLang(): string {
  if (typeof window === 'undefined') return 'ko'
  try {
    const s = sessionStorage.getItem('cm_lang')
    if (s && isLangCode(s)) return s
  } catch {}
  return 'ko'
}

export function useT(lang: string): (k: string) => string {
  const key = (lang in i18nWithPosBackfill ? lang : 'ko') as keyof typeof i18nWithPosBackfill
  const dict = i18nWithPosBackfill[key] || (i18nWithPosBackfill.ko as Record<string, string>)
  return useMemo(() => {
    const enK = enOrKoDict()
    const koK = i18nWithPosBackfill.ko as Record<string, string>
    return (k: string) => {
      const localized = (dict as Record<string, string>)[k]
      if (shouldPreferKoDemoCopy(String(key), k, localized, enK)) {
        return koK[k] ?? enK[k] ?? k
      }
      return localized ?? enK[k] ?? k
    }
  }, [dict, key])
}

/** Replace `{name}` placeholders in i18n strings */
export function tr(t: (k: string) => string, key: string, vars?: Record<string, string | number>): string {
  let s = t(key)
  if (!vars) return s
  for (const [k, v] of Object.entries(vars)) {
    s = s.split(`{${k}}`).join(String(v))
  }
  return s
}

/**
 * `useT`는 미번역 시 키 문자열을 그대로 반환하므로 `t(key) || fallback`은 동작하지 않는다.
 * 번역이 없거나 빈 문자열이면 `fallback`을 쓴다.
 */
export function tOr(t: (k: string) => string, key: string, fallback: string): string {
  const s = t(key)
  if (!s || s === key) return fallback
  return s
}

