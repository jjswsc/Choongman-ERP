"use client"

import * as React from "react"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"
import {
  MEMBER_PORTAL_NATIONALITY_OPTIONS,
  memberPortalNationalityLabel,
  normalizeMemberPortalNationalityCode,
} from "@/lib/member-portal-nationalities"
import { cn } from "@/lib/utils"
import { mpSelectClass } from "@/lib/member-portal-design"

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
      className={cn(mpSelectClass, className)}
    >
      <option value="" className="bg-white text-stone-900">
        {t("nationalityPlaceholder")}
      </option>
      {legacyUnknown ? (
        <option value={value} className="bg-white text-stone-900">
          {value}
        </option>
      ) : null}
      {MEMBER_PORTAL_NATIONALITY_OPTIONS.map((opt) => (
        <option key={opt.code} value={opt.code} className="bg-white text-stone-900">
          {memberPortalNationalityLabel(lang, opt.code)}
        </option>
      ))}
    </select>
  )
}
