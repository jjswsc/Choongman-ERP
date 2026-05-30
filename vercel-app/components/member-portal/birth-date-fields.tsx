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
}

export function BirthDateFields({ value, onChange, className }: BirthDateFieldsProps) {
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

  const selectClass =
    "h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-amber-400/40"

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <label className="text-[11px] text-white/45">{t("birthDayLabel")}</label>
          <select
            value={day}
            onChange={(e) => {
              const v = e.target.value
              setDay(v)
              emit(v, month, year)
            }}
            className={selectClass}
          >
            <option value="" className="bg-[#121214]">
              {t("birthDayPlaceholder")}
            </option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={String(d)} className="bg-[#121214]">
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-white/45">{t("birthMonthLabel")}</label>
          <select
            value={month}
            onChange={(e) => {
              const v = e.target.value
              setMonth(v)
              emit(day, v, year)
            }}
            className={selectClass}
          >
            <option value="" className="bg-[#121214]">
              {t("birthMonthPlaceholder")}
            </option>
            {MONTH_KEYS.map((key, idx) => (
              <option key={key} value={String(idx + 1)} className="bg-[#121214]">
                {t(key as MemberPortalKey)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-white/45">{t("birthYearLabel")}</label>
          <select
            value={year}
            onChange={(e) => {
              const v = e.target.value
              setYear(v)
              emit(day, month, v)
            }}
            className={selectClass}
          >
            <option value="" className="bg-[#121214]">
              {t("birthYearPlaceholder")}
            </option>
            {years.map((y) => (
              <option key={y} value={String(y)} className="bg-[#121214]">
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-[11px] text-white/35">{t("birthDateHint")}</p>
      {value ? (
        <p className="text-[11px] text-amber-200/70">{normalizeMemberBirthDateInput(value)}</p>
      ) : null}
    </div>
  )
}
