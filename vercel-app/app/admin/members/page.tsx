"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import { Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  createMember,
  getLineMessagingStatus,
  getMembers,
  importLineCrmFile,
  syncLineMembers,
  updateMember,
  type Member,
} from "@/lib/api-client"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type MemberForm = {
  id?: number
  name: string
  fullName: string
  lineDisplayName: string
  birthDate: string
  gender: string
  nationality: string
  joinChannel: string
  referralCode: string
  referredByMemberId: string
  phone: string
  email: string
  consentMarketing: boolean
  consentPrivacy: boolean
  consentAt: string
  status: "active" | "inactive"
}

const emptyForm: MemberForm = {
  name: "",
  fullName: "",
  lineDisplayName: "",
  birthDate: "",
  gender: "",
  nationality: "",
  joinChannel: "store",
  referralCode: "",
  referredByMemberId: "",
  phone: "",
  email: "",
  consentMarketing: false,
  consentPrivacy: false,
  consentAt: "",
  status: "active",
}

function toDateInput(value: string): string {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T")
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return ""
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function toDateTimeLocalInput(value: string): string {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T")
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return ""
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const hh = String(d.getHours()).padStart(2, "0")
  const mi = String(d.getMinutes()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

function lineSyncErrorHint(errors?: string[]): string {
  const list = Array.isArray(errors) ? errors.map((x) => String(x || "").trim()).filter(Boolean) : []
  if (!list.length) return ""
  const preview = list.slice(0, 3).join(" · ")
  const more = list.length > 3 ? ` +${list.length - 3} more` : ""
  return ` (${preview}${more})`
}

export default function MembersPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [members, setMembers] = React.useState<Member[]>([])
  const [loading, setLoading] = React.useState(true)
  const [searching, setSearching] = React.useState(false)
  const [syncing, setSyncing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [form, setForm] = React.useState<MemberForm>({ ...emptyForm })
  const [syncMessage, setSyncMessage] = React.useState("")
  /** loaded 전에는 자동 동기화 대기. token/secret null 이면 상태 API 실패로 미확인 → 동기화는 시도함. */
  const [lineMessagingStatus, setLineMessagingStatus] = React.useState<{
    loaded: boolean
    channelAccessTokenConfigured: boolean | null
    channelSecretConfigured: boolean | null
  }>({ loaded: false, channelAccessTokenConfigured: null, channelSecretConfigured: null })
  const [selectedImportFileName, setSelectedImportFileName] = React.useState("")
  const importFileRef = React.useRef<HTMLInputElement | null>(null)
  const reasonLabelLocalized = React.useCallback((reason?: string) => {
    const key = String(reason || "").trim()
    if (!key) return t("memberUpdateReasonUnknown")
    if (key.startsWith("line_webhook:")) {
      const event = key.replace("line_webhook:", "")
      if (event === "follow") return t("memberUpdateReasonWebhookFollow")
      if (event === "message") return t("memberUpdateReasonWebhookMessage")
      if (event === "postback") return t("memberUpdateReasonWebhookPostback")
      if (event === "unfollow") return t("memberUpdateReasonWebhookUnfollow")
      return `${t("memberUpdateReasonWebhook")}(${event})`
    }
    if (key === "crm_import") return t("memberUpdateReasonCrmImport")
    if (key === "line_sync_or_register") return t("memberUpdateReasonLineSync")
    if (key === "erp_manual") return t("memberUpdateReasonErpManual")
    if (key === "app_master") return t("memberUpdateReasonAppMaster")
    return key
  }, [t])
  const sourceLabelLocalized = React.useCallback((source?: string) => {
    const s = String(source || "").trim()
    if (s === "app") return t("memberSourceApp")
    if (s === "line") return "LINE"
    if (s === "line_import") return t("memberSourceCrm")
    if (s === "manual") return t("memberSourceManual")
    return s || "—"
  }, [t])

  const load = React.useCallback(async (q?: string, isSearch = false) => {
    if (isSearch) setSearching(true)
    setErrorMessage("")
    setLoading(true)
    try {
      const hasQuery = String(q || "").trim().length > 0
      const rows = await getMembers({ q: q || "", limit: hasQuery ? 5000 : 5000 })
      setMembers(rows)
    } catch (e) {
      console.error("getMembers:", e)
      setMembers([])
      setErrorMessage(t("memberLoadFailed"))
    } finally {
      setLoading(false)
      if (isSearch) setSearching(false)
    }
  }, [])

  const calcAge = React.useCallback((birthDate?: string) => {
    const b = String(birthDate || "").trim()
    if (!b) return "-"
    const d = new Date(b)
    if (Number.isNaN(d.getTime())) return "-"
    const now = new Date()
    let age = now.getFullYear() - d.getFullYear()
    const m = now.getMonth() - d.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1
    return age >= 0 ? String(age) : "-"
  }, [])

  React.useEffect(() => {
    load("")
  }, [load])

  React.useEffect(() => {
    getLineMessagingStatus()
      .then((r) =>
        setLineMessagingStatus({
          loaded: true,
          channelAccessTokenConfigured: r.channelAccessTokenConfigured,
          channelSecretConfigured: r.channelSecretConfigured,
        })
      )
      .catch(() =>
        setLineMessagingStatus({
          loaded: true,
          channelAccessTokenConfigured: null,
          channelSecretConfigured: null,
        })
      )
  }, [])

  React.useEffect(() => {
    const runAutoSync = async () => {
      if (!lineMessagingStatus.loaded) return
      if (lineMessagingStatus.channelAccessTokenConfigured === false) {
        setSyncMessage(
          t("memberLineSyncSkippedNoToken")
        )
        return
      }

      const todayKey = new Date().toLocaleString("en-CA", { timeZone: "Asia/Bangkok" }).slice(0, 10)
      const storageKey = "members-line-last-sync-day"
      try {
        const doneDay = localStorage.getItem(storageKey)
        if (doneDay === todayKey) return
      } catch {
        // ignore storage failure
      }
      setSyncing(true)
      try {
        const res = await syncLineMembers({ limit: 10000 })
        if (res.success) {
          try {
            localStorage.setItem(storageKey, todayKey)
          } catch {
            // ignore storage failure
          }
          setSyncMessage(
            `${t("memberAutoSyncDone")}: ${t("memberSyncScanned")} ${Number(res.scanned || 0).toLocaleString()}${t("memberCountUnit")}, ${t("memberSyncApplied")} ${Number(res.synced || 0).toLocaleString()}${t("memberCountUnit")}, ${t("memberSyncFailed")} ${Number(res.failed || 0).toLocaleString()}${t("memberCountUnit")}${lineSyncErrorHint(res.errors)}`
          )
          await load(query)
        }
      } finally {
        setSyncing(false)
      }
    }
    runAutoSync().catch(() => {})
  }, [load, query, lineMessagingStatus])

  const onSave = async () => {
    const name = form.name.trim()
    if (!name) {
      await appAlert(t("memberNameRequired"))
      return
    }
    setSaving(true)
    try {
      if (!form.id) {
        const created = await createMember({
          name,
          phone: form.phone.trim(),
          email: form.email.trim(),
          birthDate: form.birthDate.trim(),
          gender: form.gender.trim(),
          nationality: form.nationality.trim(),
          joinChannel: form.joinChannel.trim(),
          referralCode: form.referralCode.trim(),
          referredByMemberId: Number(form.referredByMemberId || 0) || undefined,
          source: "app",
        })
        if (!created.success || !created.member) {
          await appAlert(created.message || t("memberCreateFail"))
          return
        }
        const newId = created.member.id
        const res = await updateMember({
          id: newId,
          name,
          fullName: form.fullName.trim(),
          lineDisplayName: form.lineDisplayName.trim(),
          birthDate: form.birthDate.trim(),
          gender: form.gender.trim(),
          nationality: form.nationality.trim(),
          joinChannel: form.joinChannel.trim(),
          referralCode: form.referralCode.trim(),
          referredByMemberId: Number(form.referredByMemberId || 0) || undefined,
          phone: form.phone.trim(),
          email: form.email.trim(),
          consentMarketing: form.consentMarketing,
          consentPrivacy: form.consentPrivacy,
          consentAt: form.consentAt.trim(),
          status: form.status,
        })
        if (!res.success || !res.member) {
          await appAlert(res.message || t("memberDetailSaveFail"))
          return
        }
        setForm({ ...emptyForm })
        await load(query)
        return
      }
      const res = await updateMember({
        id: form.id,
        name,
        fullName: form.fullName.trim(),
        lineDisplayName: form.lineDisplayName.trim(),
        birthDate: form.birthDate.trim(),
        gender: form.gender.trim(),
        nationality: form.nationality.trim(),
        joinChannel: form.joinChannel.trim(),
        referralCode: form.referralCode.trim(),
        referredByMemberId: Number(form.referredByMemberId || 0) || undefined,
        phone: form.phone.trim(),
        email: form.email.trim(),
        consentMarketing: form.consentMarketing,
        consentPrivacy: form.consentPrivacy,
        consentAt: form.consentAt.trim(),
        status: form.status,
      })
      if (!res.success || !res.member) {
        await appAlert(res.message || t("memberUpdateFail"))
        return
      }
      setForm({ ...emptyForm })
      await load(query)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t("memberManagementTitle")}</h1>
            <p className="text-xs text-muted-foreground">
              {t("memberManagementSub")}
            </p>
          </div>
        </div>

        {lineMessagingStatus.loaded && lineMessagingStatus.channelAccessTokenConfigured === false && (
          <div
            className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
            role="status"
          >
            <p className="font-medium text-amber-900 dark:text-amber-100">{t("memberLineApiMissingTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {t("memberLineApiMissingBody")}
            </p>
            {lineMessagingStatus.channelSecretConfigured === false && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("memberLineSecretMissing")}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="lg:sticky lg:top-0 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("memberFormTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">{t("memberFormDesc")}</p>
              <div className="space-y-1.5">
                <Label>{t("name")} *</Label>
                <Input value={form.name ?? ""} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("memberFullName")}</Label>
                <Input value={form.fullName ?? ""} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("memberLineDisplayName")}</Label>
                <Input value={form.lineDisplayName ?? ""} onChange={(e) => setForm((p) => ({ ...p, lineDisplayName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("memberPhone")}</Label>
                <Input value={form.phone ?? ""} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("email")}</Label>
                <Input value={form.email ?? ""} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>{t("birthDate")}</Label>
                  <Input type="date" value={form.birthDate ?? ""} onChange={(e) => setForm((p) => ({ ...p, birthDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("gender")}</Label>
                  <Input placeholder={t("memberGenderPh")} value={form.gender ?? ""} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>{t("memberNationality")}</Label>
                  <Input value={form.nationality ?? ""} onChange={(e) => setForm((p) => ({ ...p, nationality: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("memberJoinChannel")}</Label>
                  <Input value={form.joinChannel ?? ""} onChange={(e) => setForm((p) => ({ ...p, joinChannel: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>{t("memberReferralCode")}</Label>
                  <Input value={form.referralCode ?? ""} onChange={(e) => setForm((p) => ({ ...p, referralCode: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("memberReferredById")}</Label>
                  <Input value={form.referredByMemberId ?? ""} onChange={(e) => setForm((p) => ({ ...p, referredByMemberId: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.consentMarketing}
                    onChange={(e) => setForm((p) => ({ ...p, consentMarketing: e.target.checked }))}
                  />
                  {t("memberConsentMarketing")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.consentPrivacy}
                    onChange={(e) => setForm((p) => ({ ...p, consentPrivacy: e.target.checked }))}
                  />
                  {t("memberConsentPrivacy")}
                </label>
              </div>
              <div className="space-y-1.5">
                <Label>{t("memberConsentAt")}</Label>
                <Input
                  type="datetime-local"
                  value={form.consentAt ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, consentAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("memberStatus")}</Label>
                <Input
                  value={form.status ?? "active"}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value === "inactive" ? "inactive" : "active" }))}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={onSave} disabled={saving}>
                  {saving ? t("saving") : form.id ? t("commonSave") : t("memberRegisterMaster")}
                </Button>
                <Button variant="outline" onClick={() => setForm({ ...emptyForm })}>
                  {t("memberClearSelection")}
                </Button>
              </div>
            </CardContent>
          </Card>
          </div>

          <Card id="line-tools">
            <CardHeader className="space-y-3">
              <CardTitle className="text-base">{t("memberListMasterTitle")}</CardTitle>
              <div className="flex gap-2">
                <Input
                  placeholder={t("memberSearchPh")}
                  value={query ?? ""}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") load(query, true)
                  }}
                />
                <Button variant="outline" onClick={() => load(query, true)} disabled={searching}>
                  {searching ? t("loading") : t("search")}
                </Button>
                <Button
                  variant="outline"
                  title={t("memberLineSyncTitle")}
                  disabled={syncing}
                  onClick={async () => {
                    setSyncing(true)
                    setSyncMessage("")
                    try {
                      const res = await syncLineMembers({ limit: 10000 })
                      if (!res.success) {
                        await appAlert(res.message || t("memberLineSyncFail"))
                      } else {
                        setSyncMessage(
                          `${t("memberSyncDone")}: ${t("memberSyncScanned")} ${Number(res.scanned || 0).toLocaleString()}${t("memberCountUnit")}, ${t("memberSyncApplied")} ${Number(
                            res.synced || 0
                          ).toLocaleString()}${t("memberCountUnit")}, ${t("memberSyncFailed")} ${Number(res.failed || 0).toLocaleString()}${t("memberCountUnit")}${lineSyncErrorHint(res.errors)}`
                        )
                        await load(query)
                      }
                    } finally {
                      setSyncing(false)
                    }
                  }}
                >
                  {syncing ? t("memberSyncing") : t("memberLineSyncBtn")}
                </Button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    setSelectedImportFileName(file ? file.name : "")
                  }}
                />
                <Button
                  variant="outline"
                  disabled={importing}
                  onClick={() => importFileRef.current?.click()}
                >
                  {t("memberFileSelect")}
                </Button>
                <Button
                  variant="outline"
                  disabled={importing}
                  onClick={async () => {
                    const file = importFileRef.current?.files?.[0]
                    if (!file) {
                      await appAlert(t("memberCrmFileSelectFirst"))
                      return
                    }
                    setImporting(true)
                    try {
                      const res = await importLineCrmFile({ file })
                      if (!res.success) {
                        await appAlert(res.message || t("memberCrmImportFail"))
                        return
                      }
                      setSyncMessage(
                        `${t("memberCrmImportDone")}: ${t("memberTotal")} ${Number(res.rowCount || 0).toLocaleString()}${t("posCount")} / ${t("memberSuccess")} ${Number(
                          res.successCount || 0
                        ).toLocaleString()}${t("posCount")} / ${t("memberFail")} ${Number(res.failedCount || 0).toLocaleString()}${t("posCount")}`
                      )
                      if (importFileRef.current) importFileRef.current.value = ""
                      setSelectedImportFileName("")
                      await load(query)
                    } finally {
                      setImporting(false)
                    }
                  }}
                >
                  {importing ? t("memberImporting") : t("memberCrmImportBtn")}
                </Button>
              </div>
              {errorMessage ? (
                <p className="text-xs text-destructive">{errorMessage}</p>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t("memberSearchResult")}: {members.length.toLocaleString()}{t("posCount")}</p>
                  {!!selectedImportFileName && <p className="text-xs text-muted-foreground">{t("memberSelectedFile")}: {selectedImportFileName}</p>}
                  <p className="text-[11px] text-muted-foreground">
                    {t("memberCrmColumnHint")}
                  </p>
                  {!!syncMessage && <p className="text-xs text-emerald-700">{syncMessage}</p>}
                </div>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">{t("loading")}</p>
              ) : (
                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="p-2 text-left">{t("name")}</th>
                        <th className="p-2 text-left">{t("memberSource")}</th>
                        <th className="p-2 text-left">{t("memberLineLinked")}</th>
                        <th className="p-2 text-left">{t("memberLineDisplayName")}</th>
                        <th className="p-2 text-left">{t("memberPhone")}</th>
                        <th className="p-2 text-left">{t("memberFullName")}</th>
                        <th className="p-2 text-left">{t("birthDate")}</th>
                        <th className="p-2 text-left">{t("memberNationality")}</th>
                        <th className="p-2 text-left">{t("age")}</th>
                        <th className="p-2 text-left">LINE User ID</th>
                        <th className="p-2 text-left">{t("memberNo")}</th>
                        <th className="p-2 text-left">{t("memberTier")}</th>
                        <th className="p-2 text-left">{t("memberUpdateReason")}</th>
                        <th className="p-2 text-left">{t("status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr
                          key={m.id}
                          className="cursor-pointer border-t hover:bg-muted/20"
                          onClick={() =>
                            setForm({
                              id: m.id,
                              name: String(m.name || m.lineDisplayName || ""),
                              fullName: m.fullName || "",
                              lineDisplayName: m.lineDisplayName || "",
                              birthDate: toDateInput(m.birthDate || ""),
                              gender: m.gender || "",
                              nationality: m.nationality || "",
                              joinChannel: m.joinChannel || "store",
                              referralCode: m.referralCode || "",
                              referredByMemberId: String(m.referredByMemberId || ""),
                              phone: m.phone || "",
                              email: m.email || "",
                              consentMarketing: Boolean(m.consentMarketing),
                              consentPrivacy: Boolean(m.consentPrivacy),
                              consentAt: toDateTimeLocalInput(m.consentAt || ""),
                              status: m.status === "inactive" ? "inactive" : "active",
                            })
                          }
                        >
                          <td className="p-2">{m.name || "—"}</td>
                          <td className="p-2">{sourceLabelLocalized(m.source)}</td>
                          <td className="p-2">{m.lineLinked ? t("yes") : t("no")}</td>
                          <td className="p-2">{m.lineDisplayName || "—"}</td>
                          <td className="p-2">{m.phone || "—"}</td>
                          <td className="p-2">{m.fullName || "-"}</td>
                          <td className="p-2">{m.birthDate || "-"}</td>
                          <td className="p-2">{m.nationality || "-"}</td>
                          <td className="p-2">{calcAge(m.birthDate)}</td>
                          <td className="p-2">{m.lineUserId || "-"}</td>
                          <td className="p-2">{m.memberNo || "-"}</td>
                          <td className="p-2">{m.tierCode || "-"}</td>
                          <td className="p-2">{reasonLabelLocalized(m.lastUpdateReason)}</td>
                          <td className="p-2">{m.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
