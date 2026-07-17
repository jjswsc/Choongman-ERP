"use client"

import * as React from "react"
import { ChevronUp, Image as ImageIcon, Loader2, MessageSquareWarning } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MemberPortalComplaintPromoCard } from "@/components/member-portal/member-portal-complaint-promo-card"
import {
  GlassCard,
} from "@/components/member-portal/member-portal-premium-ui"
import {
  MP_CARD_TEXT_MUTED,
  MP_CARD_TEXT_PRIMARY,
  MP_CARD_TEXT_SECONDARY,
  mpInputClass,
  mpPrimaryBtn,
} from "@/lib/member-portal-design"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"
import { formatDateTime } from "@/components/member-portal/portal-ui"
import { memberPortalDateLocale, memberPortalT, type MemberPortalKey } from "@/lib/member-portal-i18n"
import type { MemberSummary } from "@/lib/members-server"
import type { MemberPortalStoreDto } from "@/lib/member-portal-stores-shared"
import { putFileToSupabaseSignedUploadUrl } from "@/lib/storage-client-upload"

const VISIT_PATHS = ["홀", "배달", "포장"] as const
const PLATFORMS = ["Grab", "Lineman", "Shopee", "Robinhood", "기타"] as const
const TYPES = ["음식", "서비스", "환경/청결", "가격/결제", "기타"] as const

type ComplaintRow = {
  number: string
  store: string
  type: string
  title: string
  status: string
  customerReply: string
  createdAt: string
  date: string
  time: string
}

type Props = {
  member: MemberSummary
  stores: MemberPortalStoreDto[]
  formOpen: boolean
  onFormOpenChange: (open: boolean) => void
  onNotice: (message: string) => void
  onError: (message: string) => void
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

function statusKey(status: string): MemberPortalKey {
  if (status === "접수") return "complaintStatusRecv"
  if (status === "조사중") return "complaintStatusInv"
  if (status === "처리완료") return "complaintStatusDone"
  if (status === "보류") return "complaintStatusHold"
  if (status === "종료") return "complaintStatusClosed"
  return "complaintStatusRecv"
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

async function uploadMemberComplaintPhoto(file: File) {
  const ct = file.type || "image/jpeg"
  const pres = await fetch("/api/member-portal/me/complaints/photo/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({
      fileName: file.name,
      contentType: ct,
      fileSize: file.size,
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

export function MemberPortalComplaintSection({
  member,
  stores,
  formOpen,
  onFormOpenChange,
  onNotice,
  onError,
}: Props) {
  const { lang, t } = useMemberPortalLang()
  const dateLocale = memberPortalDateLocale(lang)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const [rows, setRows] = React.useState<ComplaintRow[]>([])
  const [listLoading, setListLoading] = React.useState(true)
  const [submitLoading, setSubmitLoading] = React.useState(false)
  const [uploadLoading, setUploadLoading] = React.useState(false)

  const [store, setStore] = React.useState("")
  const [visitPath, setVisitPath] = React.useState<(typeof VISIT_PATHS)[number]>("홀")
  const [platform, setPlatform] = React.useState<(typeof PLATFORMS)[number]>("Grab")
  const [type, setType] = React.useState<(typeof TYPES)[number]>("음식")
  const [menu, setMenu] = React.useState("")
  const [title, setTitle] = React.useState("")
  const [content, setContent] = React.useState("")
  const [photoUrl, setPhotoUrl] = React.useState("")

  const loadList = React.useCallback(async () => {
    setListLoading(true)
    try {
      const res = await fetch("/api/member-portal/me/complaints", { credentials: "same-origin", cache: "no-store" })
      const json = (await res.json()) as { success?: boolean; rows?: ComplaintRow[] }
      setRows(json.success ? json.rows || [] : [])
    } catch {
      setRows([])
    } finally {
      setListLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadList()
  }, [loadList])

  React.useEffect(() => {
    if (!store && stores.length === 1) {
      setStore(stores[0].displayName)
    }
  }, [store, stores])

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
    try {
      const res = await uploadMemberComplaintPhoto(files[0])
      if (res.success && res.url) {
        setPhotoUrl(res.url)
      } else {
        onError(complaintErrorMessage(lang, res.message || "upload_failed"))
      }
    } finally {
      setUploadLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!store.trim()) {
      onError(t("complaintSelectStore"))
      return
    }
    if (!title.trim() || !content.trim()) {
      onError(t("complaintRequiredHint"))
      return
    }
    setSubmitLoading(true)
    try {
      const res = await fetch("/api/member-portal/me/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          store,
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
        onError(complaintErrorMessage(lang, json.code || "save_failed"))
        return
      }
      resetForm()
      onFormOpenChange(false)
      onNotice(memberPortalT(lang, "complaintSubmitSuccess", { number: json.number || "" }))
      void loadList()
    } catch {
      onError(t("complaintSubmitFail"))
    } finally {
      setSubmitLoading(false)
    }
  }

  const selectClass =
    "h-11 w-full rounded-2xl border border-stone-200/80 bg-stone-50/90 px-3 text-sm text-stone-900 outline-none focus:border-amber-400/80"

  return (
    <div className="space-y-4">
      {!formOpen ? (
        <MemberPortalComplaintPromoCard onOpen={() => onFormOpenChange(true)} />
      ) : (
        <GlassCard soft className="border-amber-200/60 bg-amber-50/40">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => onFormOpenChange(false)}
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-950">
              <MessageSquareWarning className="h-4 w-4 text-amber-600" aria-hidden />
              {t("complaintSubmitTitle")}
            </span>
            <ChevronUp className={`h-4 w-4 ${MP_CARD_TEXT_MUTED}`} aria-hidden />
          </button>
        </GlassCard>
      )}

      {formOpen ? (
        <GlassCard soft className="border-amber-200/50">
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className={MP_CARD_TEXT_SECONDARY}>{t("nameLabel")}</Label>
                <Input value={member.name || member.fullName || ""} disabled className={`${mpInputClass} opacity-60`} />
              </div>
              <div className="space-y-1.5">
                <Label className={MP_CARD_TEXT_SECONDARY}>{t("phoneLabel")}</Label>
                <Input value={member.phone || ""} disabled className={`${mpInputClass} opacity-60`} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className={MP_CARD_TEXT_SECONDARY}>{t("store")}</Label>
              <select value={store} onChange={(e) => setStore(e.target.value)} className={selectClass}>
                <option value="">{t("complaintSelectStore")}</option>
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

            <Button onClick={() => void handleSubmit()} disabled={submitLoading} className={`w-full ${mpPrimaryBtn}`}>
              {submitLoading ? t("complaintSubmitting") : t("complaintSubmitBtn")}
            </Button>
          </div>
        </GlassCard>
      ) : null}

      <GlassCard soft>
        <p className={`mb-3 text-sm font-semibold ${MP_CARD_TEXT_PRIMARY}`}>{t("complaintMyListTitle")}</p>
        <div>
        {listLoading ? (
          <p className={`text-sm ${MP_CARD_TEXT_MUTED}`}>{t("complaintListLoading")}</p>
        ) : rows.length === 0 ? (
          <p className={`text-sm ${MP_CARD_TEXT_MUTED}`}>{t("complaintMyListEmpty")}</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.number} className="rounded-2xl border border-stone-200/70 bg-white/70 px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className={`text-xs ${MP_CARD_TEXT_MUTED}`}>{row.number}</p>
                    <p className={`mt-0.5 text-sm font-medium ${MP_CARD_TEXT_PRIMARY}`}>{row.title}</p>
                    <p className={`mt-1 text-xs ${MP_CARD_TEXT_SECONDARY}`}>
                      {row.store} · {t(typeKey(row.type))}
                    </p>
                    <p className={`mt-1 text-xs ${MP_CARD_TEXT_MUTED}`}>
                      {formatDateTime(row.createdAt || `${row.date} ${row.time}`, dateLocale)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                    {t(statusKey(row.status))}
                  </span>
                </div>
                {row.customerReply ? (
                  <p className={`mt-2 whitespace-pre-wrap border-t border-stone-200/60 pt-2 text-xs ${MP_CARD_TEXT_SECONDARY}`}>
                    {t("complaintReplyLabel")}: {row.customerReply}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        </div>
      </GlassCard>
    </div>
  )
}
