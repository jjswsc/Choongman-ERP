"use client"

import * as React from "react"
import {
  composeBirthDateFromParts,
  normalizeMemberBirthDateInput,
  splitBirthDateParts,
} from "@/lib/member-phone-lookup"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"
import type { MemberPortalKey } from "@/lib/member-portal-i18n"
import { cn } from "@/lib/utils"
import {
  mpSelectClass,
  mpSelectDarkClass,
  MP_CARD_TEXT_SECONDARY,
} from "@/lib/member-portal-design"

const MONTH_KEYS = [
  "month1",
  "month2",
  "month3",
  "month4",
  "month5",
  "month6",
  "month7",
  "month8",
  "month9",
  "month10",
  "month11",
  "month12",
] as const

type BirthDateFieldsProps = {
  value: string
  onChange: (iso: string) => void
  className?: string
  /** 로그인·가입(어두운 오버레이) vs 내 정보(밝은 카드) */
  variant?: "dark" | "light"
}

export function BirthDateFields({ value, onChange, className, variant = "dark" }: BirthDateFieldsProps) {
  const { t } = useMemberPortalLang()
  const parsed = React.useMemo(() => splitBirthDateParts(value), [value])
  const [day, setDay] = React.useState(parsed.day)
  const [month, setMonth] = React.useState(parsed.month)
  const [year, setYear] = React.useState(parsed.year)

  React.useEffect(() => {
    const next = splitBirthDateParts(value)
    setDay(next.day)
    setMonth(next.month)
    setYear(next.year)
  }, [value])

  const years = React.useMemo(() => {
    const now = new Date().getFullYear()
    const out: number[] = []
    for (let y = now; y >= 1940; y -= 1) out.push(y)
    return out
  }, [])

  const emit = React.useCallback(
    (nextDay: string, nextMonth: string, nextYear: string) => {
      onChange(composeBirthDateFromParts(nextDay, nextMonth, nextYear))
    },
    [onChange]
  )

  const light = variant === "light"
  const selectClass = light ? mpSelectClass : mpSelectDarkClass
  const subLabelClass = light ? `text-[11px] ${MP_CARD_TEXT_SECONDARY}` : "text-[11px] text-white/45"
  const hintClass = light ? `text-[11px] ${MP_CARD_TEXT_SECONDARY}` : "text-[11px] text-white/35"
  const previewClass = light ? `text-[11px] ${MP_CARD_TEXT_SECONDARY}` : "text-[11px] text-amber-200/70"
  const optionClass = light ? "bg-white text-stone-900" : "bg-[#121214]"

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <label className={subLabelClass}>{t("birthDayLabel")}</label>
          <select
            value={day}
            onChange={(e) => {
              const v = e.target.value
              setDay(v)
              emit(v, month, year)
            }}
            className={selectClass}
          >
            <option value="" className={optionClass}>
              {t("birthDayPlaceholder")}
            </option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={String(d)} className={optionClass}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className={subLabelClass}>{t("birthMonthLabel")}</label>
          <select
            value={month}
            onChange={(e) => {
              const v = e.target.value
              setMonth(v)
              emit(day, v, year)
            }}
            className={selectClass}
          >
            <option value="" className={optionClass}>
              {t("birthMonthPlaceholder")}
            </option>
            {MONTH_KEYS.map((key, idx) => (
              <option key={key} value={String(idx + 1)} className={optionClass}>
                {t(key as MemberPortalKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className={subLabelClass}>{t("birthYearLabel")}</label>
          <select
            value={year}
            onChange={(e) => {
              const v = e.target.value
              setYear(v)
              emit(day, month, v)
            }}
            className={selectClass}
          >
            <option value="" className={optionClass}>
              {t("birthYearPlaceholder")}
            </option>
            {years.map((y) => (
              <option key={y} value={String(y)} className={optionClass}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className={hintClass}>{t("birthDateHint")}</p>
      {value ? (
        <p className={previewClass}>{normalizeMemberBirthDateInput(value)}</p>
      ) : null}
    </div>
  )
}
