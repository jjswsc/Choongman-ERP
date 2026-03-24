import type { LangCode } from '@/lib/lang-context'

const POS_DISPLAY_TZ = 'Asia/Bangkok'

/** POS UI용 Intl 로케일 (태국어는 서기력 명시로 연도 혼선 방지) */
function intlLocaleForLang(lang: LangCode): string {
  switch (lang) {
    case 'ko':
      return 'ko-KR'
    case 'en':
      return 'en-US'
    case 'th':
      return 'th-TH-u-ca-gregory'
    case 'mm':
      return 'my-MM'
    case 'la':
      return 'lo-LA'
    case 'kh':
      return 'km-KH'
    case 'vi':
      return 'vi-VN'
    case 'ms':
      return 'ms-MY'
    default:
      return 'en-US'
  }
}

/** POS 푸터 등: 방콕 기준 날짜 (언어별 월/일 표기) */
export function formatPosClockDate(date: Date, lang: LangCode): string {
  return new Intl.DateTimeFormat(intlLocaleForLang(lang), {
    timeZone: POS_DISPLAY_TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

/** POS 푸터 등: 방콕 기준 시각 (언어별 오전/오후·숫자) */
export function formatPosClockTime(date: Date, lang: LangCode): string {
  return new Intl.DateTimeFormat(intlLocaleForLang(lang), {
    timeZone: POS_DISPLAY_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date)
}

function coerceDate(input: Date | string | number): Date {
  return input instanceof Date ? input : new Date(input)
}

/** 주문 패널: M/D + 시각 (방콕, 언어 반영) */
export function formatPosOrderMonthDayTime(input: Date | string | number, lang: LangCode): string {
  const date = coerceDate(input)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(intlLocaleForLang(lang), {
    timeZone: POS_DISPLAY_TZ,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** 주문 바·리스트: 접수 시각 HH:mm 24시간제 (방콕) */
export function formatPosTimeHm24Bangkok(input: Date | string | number, lang: LangCode): string {
  const date = coerceDate(input)
  if (Number.isNaN(date.getTime())) return '--:--'
  return new Intl.DateTimeFormat(intlLocaleForLang(lang), {
    timeZone: POS_DISPLAY_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

/** 인쇄·푸터: 날짜+시간 (medium) */
export function formatPosDateTimeMedium(date: Date, lang: LangCode): string {
  return new Intl.DateTimeFormat(intlLocaleForLang(lang), {
    timeZone: POS_DISPLAY_TZ,
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date)
}

/** 짧은 날짜·시간 (기기 목록 last seen 등) */
export function formatPosDateTimeShort(date: Date, lang: LangCode): string {
  return new Intl.DateTimeFormat(intlLocaleForLang(lang), {
    timeZone: POS_DISPLAY_TZ,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

/** 영수증 인쇄용: 숫자 정렬에 유리한 고정 폭(24h) 타임스탬프 */
export function formatPosReceiptPrintTimestamp(date: Date, lang: LangCode): string {
  return new Intl.DateTimeFormat(intlLocaleForLang(lang), {
    timeZone: POS_DISPLAY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}
