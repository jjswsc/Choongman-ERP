"use client"

import * as React from "react"
import { Loader2, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BirthDateFields } from "@/components/member-portal/birth-date-fields"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"
import {
  MP_CARD_TEXT_PRIMARY,
  MP_CARD_TEXT_SECONDARY,
  mpInputClass,
  mpPrimaryBtn,
} from "@/lib/member-portal-design"
import { memberPortalLoginError } from "@/lib/member-portal-i18n"
import { normalizeMemberPhone } from "@/lib/member-phone-lookup"
import type { MemberSummary } from "@/lib/members-server"
import { postJson } from "@/components/member-portal/member-portal-app-utils"

const portalLabelClass = `text-[11px] font-medium uppercase tracking-[0.14em] ${MP_CARD_TEXT_SECONDARY}`
const portalFieldClass = `${mpInputClass} h-12`

export function MemberPortalLinePhoneLinkDialog({
  onComplete,
  onSkip,
}: {
  onComplete: (member: MemberSummary, merged: boolean) => void
  onSkip: () => void
}) {
  const { lang, t } = useMemberPortalLang()
  const [phone, setPhone] = React.useState("")
  const [birthDate, setBirthDate] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")

  const birthDateReady = birthDate.length >= 10

  const save = async () => {
    const normalizedPhone = normalizeMemberPhone(phone)
    if (!normalizedPhone) {
      setError(t("login_missing_phone"))
      return
    }
    if (!birthDateReady) {
      setError(t("login_missing_birth"))
      return
    }
    setSaving(true)
    setError("")
    try {
      const res = await postJson<{
        success: boolean
        code?: string
        message?: string
        member?: MemberSummary
        merged?: boolean
      }>("/api/member-portal/me/link-phone-birth", {
        phone: normalizedPhone,
        birthDate,
      })
      if (!res.success || !res.member) {
        setError(res.code ? memberPortalLoginError(lang, res.code) : res.message || t("saveFailed"))
        return
      }
      onComplete(res.member, Boolean(res.merged))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-[28px] border border-stone-200/80 bg-white p-5 shadow-[0_20px_60px_rgba(28,21,16,0.18)]"
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#06C755] text-white shadow-md">
            <Phone className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className={`text-lg font-bold ${MP_CARD_TEXT_PRIMARY}`}>{t("linePhoneLinkTitle")}</p>
            <p className={`mt-2 text-sm leading-relaxed ${MP_CARD_TEXT_SECONDARY}`}>{t("linePhoneLinkDesc")}</p>
          </div>
        </div>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label className={portalLabelClass}>{t("phoneLabel")}</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0812345678"
              inputMode="tel"
              className={portalFieldClass}
            />
          </div>
          <div className="space-y-1.5">
            <Label className={portalLabelClass}>{t("birthDateLabel")}</Label>
            <BirthDateFields value={birthDate} onChange={setBirthDate} variant="light" />
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <Button
          onClick={() => void save()}
          disabled={saving || !normalizeMemberPhone(phone) || !birthDateReady}
          className={`mt-4 w-full ${mpPrimaryBtn}`}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("linePhoneLinkBtn")}
        </Button>
        <button
          type="button"
          onClick={onSkip}
          className={`mt-3 w-full py-2 text-center text-sm font-medium ${MP_CARD_TEXT_SECONDARY} underline-offset-2 hover:underline`}
        >
          {t("linePhoneLinkSkip")}
        </button>
      </div>
    </div>
  )
}
