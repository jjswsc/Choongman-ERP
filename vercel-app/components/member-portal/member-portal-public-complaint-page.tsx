"use client"

import * as React from "react"
import Link from "next/link"
import { Image as ImageIcon, Loader2, MessageSquareWarning, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { GlassCard } from "@/components/member-portal/member-portal-premium-ui"
import {
  MP_CARD_TEXT_MUTED,
  MP_CARD_TEXT_PRIMARY,
  MP_CARD_TEXT_SECONDARY,
  mpInputClass,
  mpPrimaryBtn,
} from "@/lib/member-portal-design"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"
import { memberPortalT, type MemberPortalKey } from "@/lib/member-portal-i18n"
import { putFileToSupabaseSignedUploadUrl } from "@/lib/storage-client-upload"

const VISIT_PATHS = ["홀", "배달", "포장"] as const
const PLATFORMS = ["Grab", "Lineman", "Shopee", "Robinhood", "기타"] as const
const TYPES = ["음식", "서비스", "환경/청결", "가격/결제", "기타"] as const

type StoreOption = {
  storeCode: string
  displayName: string
}

function visitPathKey(path: string): MemberPortalKey {
  if (path === "배달") return "complaintPathDelivery"
  if (path === "포장") return "complaintPathTakeout"
  return "complaintPathHall"
}

function typeKey(type: string): MemberPortalKey {
  if (type === "음식") return "complaintTypeFood"
  if (type === "서비스") return "complaintTypeService"
  if (type === "환경/청결") return "complaintTypeEnv"
  if (type === "가격/결제") return "complaintTypePrice"
  return "complaintTypeEtc"
}

function complaintErrorMessage(lang: Parameters<typeof memberPortalT>[0], code: string): string {
  const map: Record<string, MemberPortalKey> = {
    invalid_store: "complaintErr_invalid_store",
    invalid_visit_path: "complaintErr_invalid_visit_path",
    invalid_type: "complaintErr_invalid_type",
    invalid_platform: "complaintErr_invalid_platform",
    platform_required: "complaintErr_platform_required",
    title_required: "complaintErr_title_required",
    content_required: "complaintErr_content_required",
    text_too_long: "complaintErr_text_too_long",
    rate_limit: "complaintErr_rate_limit",
    name_required: "complaintErr_name_required",
    contact_required: "complaintErr_contact_required",
    save_failed: "complaintSubmitFail",
    upload_failed: "complaintErr_upload_failed",
    presign_failed: "complaintErr_upload_failed",
    invalid_photo: "complaintErr_invalid_photo",
  }
  const key = map[code]
  if (key) return memberPortalT(lang, key)
  return memberPortalT(lang, "complaintSubmitFail")
}

async function uploadPublicComplaintPhoto(file: File, store?: string) {
  const ct = file.type || "image/jpeg"
  const pres = await fetch("/api/member-portal/public/complaints/photo/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType: ct,
      fileSize: file.size,
      ...(store ? { store } : {}),
    }),
  })
  const pjson = (await pres.json()) as {
    success?: boolean
    message?: string
    signedUrl?: string
    publicUrl?: string
  }
  if (!pres.ok || !pjson.success || !pjson.signedUrl || !pjson.publicUrl) {
    return { success: false as const, url: undefined, message: pjson.message || "presign_failed" }
  }
  const body =
    file.type === ct ? file : new File([file], file.name || "upload", { type: ct, lastModified: file.lastModified })
  const putRes = await putFileToSupabaseSignedUploadUrl(pjson.signedUrl, body, { upsert: false })
  if (!putRes.ok) {
    const t = await putRes.text().catch(() => "")
    return { success: false as const, url: undefined, message: t || `upload_failed_${putRes.status}` }
  }
  return { success: true as const, url: pjson.publicUrl, message: undefined }
}

export function MemberPortalPublicComplaintPage() {
  const { lang, t } = useMemberPortalLang()
  const fileRef = React.useRef<HTMLInputElement>(null)

  const [stores, setStores] = React.useState<StoreOption[]>([])
  const [storesLoading, setStoresLoading] = React.useState(true)
  const [submitLoading, setSubmitLoading] = React.useState(false)
  const [uploadLoading, setUploadLoading] = React.useState(false)
  const [notice, setNotice] = React.useState("")
  const [error, setError] = React.useState("")
  const [submittedNumber, setSubmittedNumber] = React.useState("")

  const [customer, setCustomer] = React.useState("")
  const [contact, setContact] = React.useState("")
  const [store, setStore] = React.useState("")
  const [visitPath, setVisitPath] = React.useState<(typeof VISIT_PATHS)[number]>("홀")
  const [platform, setPlatform] = React.useState<(typeof PLATFORMS)[number]>("Grab")
  const [type, setType] = React.useState<(typeof TYPES)[number]>("음식")
  const [menu, setMenu] = React.useState("")
  const [title, setTitle] = React.useState("")
  const [content, setContent] = React.useState("")
  const [photoUrl, setPhotoUrl] = React.useState("")

  React.useEffect(() => {
    let cancelled = false
    void fetch(`/api/member-portal/signup-stores?lang=${encodeURIComponent(lang)}`)
      .then((r) => r.json())
      .then((json: { success?: boolean; stores?: StoreOption[] }) => {
        if (cancelled) return
        const rows = json.success ? json.stores || [] : []
        setStores(rows)
        if (rows.length === 1) setStore(rows[0].displayName)
      })
      .catch(() => {
        if (!cancelled) setStores([])
      })
      .finally(() => {
        if (!cancelled) setStoresLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [lang])

  const resetForm = React.useCallback(() => {
    setVisitPath("홀")
    setPlatform("Grab")
    setType("음식")
    setMenu("")
    setTitle("")
    setContent("")
    setPhotoUrl("")
    if (stores.length === 1) setStore(stores[0].displayName)
  }, [stores])

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploadLoading(true)
    setError("")
    try {
      const res = await uploadPublicComplaintPhoto(files[0], store)
      if (res.success && res.url) {
        setPhotoUrl(res.url)
      } else {
        setError(complaintErrorMessage(lang, res.message || "upload_failed"))
      }
    } finally {
      setUploadLoading(false)
    }
  }

  const handleSubmit = async () => {
    setError("")
    setNotice("")
    if (!store.trim()) {
      setError(t("complaintSelectStore"))
      return
    }
    if (!title.trim() || !content.trim()) {
      setError(t("complaintRequiredHint"))
      return
    }
    setSubmitLoading(true)
    try {
      const res = await fetch("/api/member-portal/public/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lang,
          store,
          customer,
          contact,
          visitPath,
          platform: visitPath === "배달" ? platform : "",
          type,
          menu,
          title,
          content,
          photoUrl,
        }),
      })
      const json = (await res.json()) as { success?: boolean; number?: string; code?: string }
      if (!res.ok || !json.success) {
        setError(complaintErrorMessage(lang, json.code || "save_failed"))
        return
      }
      setSubmittedNumber(json.number || "")
      setNotice(memberPortalT(lang, "complaintSubmitSuccess", { number: json.number || "" }))
      resetForm()
    } catch {
      setError(t("complaintSubmitFail"))
    } finally {
      setSubmitLoading(false)
    }
  }

  const selectClass =
    "h-11 w-full rounded-2xl border border-stone-200/80 bg-stone-50/90 px-3 text-sm text-stone-900 outline-none focus:border-amber-400/80"

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-lg px-4 pb-10 pt-6">
      <div className="mb-5">
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
          <MessageSquareWarning className="h-3.5 w-3.5" aria-hidden />
          {t("complaintPublicPageTitle")}
        </div>
        <h1 className={`mt-3 text-2xl font-bold ${MP_CARD_TEXT_PRIMARY}`}>{t("complaintHomePromoTitle")}</h1>
        <p className={`mt-2 text-sm leading-relaxed ${MP_CARD_TEXT_SECONDARY}`}>{t("complaintPublicPageSub")}</p>
      </div>

      <GlassCard soft className="mb-5 border-amber-200/70 bg-gradient-to-br from-amber-50/90 to-white/80">
        <div className="flex gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
            <UserRound className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${MP_CARD_TEXT_PRIMARY}`}>{t("complaintPublicSignupTitle")}</p>
            <p className={`mt-1 text-sm leading-relaxed ${MP_CARD_TEXT_SECONDARY}`}>{t("complaintPublicSignupBody")}</p>
            <Link
              href="/m?signup=1"
              className={`mt-3 inline-flex h-10 items-center justify-center rounded-2xl px-4 text-sm font-semibold ${mpPrimaryBtn}`}
            >
              {t("complaintPublicSignupBtn")}
            </Link>
          </div>
        </div>
      </GlassCard>

      <p className={`mb-4 text-center text-xs ${MP_CARD_TEXT_MUTED}`}>{t("complaintPublicGuestHint")}</p>

      {notice ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
          {submittedNumber ? (
            <p className="mt-1 text-xs text-emerald-800/80">
              {submittedNumber}
            </p>
          ) : null}
          <p className="mt-3 border-t border-emerald-200/80 pt-3 text-xs leading-relaxed text-emerald-900/90">
            {t("complaintPublicSignupAfterSubmit")}{" "}
            <Link href="/m?signup=1" className="font-semibold text-emerald-950 underline-offset-2 hover:underline">
              {t("complaintPublicSignupBtn")}
            </Link>
          </p>
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <GlassCard soft className="border-amber-200/50">
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={MP_CARD_TEXT_SECONDARY}>{t("nameLabel")}</Label>
              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} className={mpInputClass} />
            </div>
            <div className="space-y-1.5">
              <Label className={MP_CARD_TEXT_SECONDARY}>{t("phoneLabel")}</Label>
              <Input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                inputMode="tel"
                className={mpInputClass}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className={MP_CARD_TEXT_SECONDARY}>{t("store")}</Label>
            <select
              value={store}
              onChange={(e) => setStore(e.target.value)}
              className={selectClass}
              disabled={storesLoading}
            >
              <option value="">{storesLoading ? t("complaintListLoading") : t("complaintSelectStore")}</option>
              {stores.map((s) => (
                <option key={s.storeCode} value={s.displayName}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={MP_CARD_TEXT_SECONDARY}>{t("complaintVisitPath")}</Label>
              <select
                value={visitPath}
                onChange={(e) => setVisitPath(e.target.value as (typeof VISIT_PATHS)[number])}
                className={selectClass}
              >
                {VISIT_PATHS.map((p) => (
                  <option key={p} value={p}>
                    {t(visitPathKey(p))}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className={MP_CARD_TEXT_SECONDARY}>{t("complaintType")}</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}
                className={selectClass}
              >
                {TYPES.map((ty) => (
                  <option key={ty} value={ty}>
                    {t(typeKey(ty))}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {visitPath === "배달" ? (
            <div className="space-y-1.5">
              <Label className={MP_CARD_TEXT_SECONDARY}>{t("complaintPlatform")}</Label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as (typeof PLATFORMS)[number])}
                className={selectClass}
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label className={MP_CARD_TEXT_SECONDARY}>{t("complaintMenu")}</Label>
            <Input value={menu} onChange={(e) => setMenu(e.target.value)} className={mpInputClass} placeholder={t("complaintMenuPh")} />
          </div>

          <div className="space-y-1.5">
            <Label className={MP_CARD_TEXT_SECONDARY}>{t("complaintTitle")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className={mpInputClass} placeholder={t("complaintTitlePh")} />
          </div>

          <div className="space-y-1.5">
            <Label className={MP_CARD_TEXT_SECONDARY}>{t("complaintContent")}</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className={`min-h-[100px] resize-y ${mpInputClass}`}
              placeholder={t("complaintContentPh")}
            />
          </div>

          <div className="space-y-2">
            <Label className={MP_CARD_TEXT_SECONDARY}>{t("complaintPhoto")}</Label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleUpload(e.target.files)} />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-2xl border-stone-200/80 bg-white/80"
                disabled={uploadLoading}
                onClick={() => fileRef.current?.click()}
              >
                {uploadLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImageIcon className="mr-2 h-4 w-4" />}
                {t("complaintPhotoUpload")}
              </Button>
              {photoUrl ? (
                <button type="button" className="text-xs text-amber-700 underline" onClick={() => setPhotoUrl("")}>
                  {t("complaintPhotoRemove")}
                </button>
              ) : null}
            </div>
          </div>

          <Button onClick={() => void handleSubmit()} disabled={submitLoading || storesLoading} className={`w-full ${mpPrimaryBtn}`}>
            {submitLoading ? t("complaintSubmitting") : t("complaintSubmitBtn")}
          </Button>
        </div>
      </GlassCard>
    </div>
  )
}
