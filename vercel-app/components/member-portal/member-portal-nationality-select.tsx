"use client"

import * as React from "react"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"
import {
  MEMBER_PORTAL_NATIONALITY_OPTIONS,
  memberPortalNationalityLabel,
  normalizeMemberPortalNationalityCode,
} from "@/lib/member-portal-nationalities"
import { cn } from "@/lib/utils"

type MemberPortalNationalitySelectProps = {
  value: string
  onChange: (code: string) => void
  className?: string
}

export function MemberPortalNationalitySelect({
  value,
  onChange,
  className,
}: MemberPortalNationalitySelectProps) {
  const { lang, t } = useMemberPortalLang()
  const normalized = normalizeMemberPortalNationalityCode(value)
  const selectValue = normalized || (value ? value : "")
  const legacyUnknown = Boolean(value && !normalized)

  return (
    <select
      value={selectValue}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-12 w-full rounded-2xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-amber-400/40",
        className
      )}
    >
      <option value="" className="bg-[#121214]">
        {t("nationalityPlaceholder")}
      </option>
      {legacyUnknown ? (
        <option value={value} className="bg-[#121214]">
          {value}
        </option>
      ) : null}
      {MEMBER_PORTAL_NATIONALITY_OPTIONS.map((opt) => (
        <option key={opt.code} value={opt.code} className="bg-[#121214]">
          {memberPortalNationalityLabel(lang, opt.code)}
        </option>
      ))}
    </select>
  )
}
