"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"
import {
  MP_CARD_TEXT_PRIMARY,
  MP_CARD_TEXT_SECONDARY,
  mpInputClass,
  mpPrimaryBtn,
} from "@/lib/member-portal-design"
import { memberPortalLoginError } from "@/lib/member-portal-i18n"
import type { MemberSummary } from "@/lib/members-server"
import { postJson } from "@/components/member-portal/member-portal-app-utils"

const portalLabelClass = `text-[11px] font-medium uppercase tracking-[0.14em] ${MP_CARD_TEXT_SECONDARY}`
const portalFieldClass = `${mpInputClass} h-12`

export function MemberPortalJoinStoreDialog({
  officeStoreCode,
  storeOptions,
  onComplete,
}: {
  officeStoreCode: string
  storeOptions: Array<{ storeCode: string; displayName: string }>
  onComplete: (member: MemberSummary) => void
}) {
  const { lang, t } = useMemberPortalLang()
  const [storeCode, setStoreCode] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")

  const save = async () => {
    if (!storeCode) {
      setError(t("signup_missing_store"))
      return
    }
    setSaving(true)
    setError("")
    try {
      const res = await postJson<{ success: boolean; code?: string; member?: MemberSummary }>(
        "/api/member-portal/me/join-store",
        { joinStoreCode: storeCode }
      )
      if (!res.success || !res.member) {
        setError(res.code ? memberPortalLoginError(lang, res.code) : t("saveFailed"))
        return
      }
      onComplete(res.member)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-[28px] border border-stone-200/80 bg-white p-5 shadow-[0_20px_60px_rgba(28,21,16,0.18)]"
      >
        <p className={`text-lg font-bold ${MP_CARD_TEXT_PRIMARY}`}>{t("joinStoreCompleteTitle")}</p>
        <p className={`mt-2 text-sm leading-relaxed ${MP_CARD_TEXT_SECONDARY}`}>{t("joinStoreCompleteDesc")}</p>

        <div className="mt-4 space-y-1.5">
          <Label className={portalLabelClass}>{t("signupStoreLabel")}</Label>
          <select
            value={storeCode}
            onChange={(e) => setStoreCode(e.target.value)}
            className={`${portalFieldClass} w-full px-3 text-sm`}
          >
            <option value="" className="bg-white text-stone-500">
              {t("signupStorePlaceholder")}
            </option>
            <option value={officeStoreCode} className="bg-white text-stone-900">
              {t("signupStoreOffice")}
            </option>
            {storeOptions.map((store) => (
              <option key={store.storeCode} value={store.storeCode} className="bg-white text-stone-900">
                {store.displayName}
              </option>
            ))}
          </select>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <Button onClick={() => void save()} disabled={saving || !storeCode} className={`mt-4 w-full ${mpPrimaryBtn}`}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("joinStoreCompleteBtn")}
        </Button>
      </div>
    </div>
  )
}
