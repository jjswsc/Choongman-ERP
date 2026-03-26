"use client"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import { Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  getLineMessagingStatus,
  getMembers,
  importLineCrmFile,
  syncLineMembers,
  updateMember,
  type Member,
} from "@/lib/api-client"

type MemberForm = {
  id?: number
  name: string
  fullName: string
  lineDisplayName: string
  birthDate: string
  gender: string
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
  const more = list.length > 3 ? ` 외 ${list.length - 3}건` : ""
  return ` (${preview}${more})`
}

function reasonLabel(reason?: string): string {
  const key = String(reason || "").trim()
  if (!key) return "미확인"
  if (key.startsWith("line_webhook:")) {
    const event = key.replace("line_webhook:", "")
    if (event === "follow") return "LINE 웹훅(follow)"
    if (event === "message") return "LINE 웹훅(message)"
    if (event === "postback") return "LINE 웹훅(postback)"
    if (event === "unfollow") return "LINE 웹훅(unfollow)"
    return `LINE 웹훅(${event})`
  }
  if (key === "crm_import") return "CRM 파일 반영"
  if (key === "line_sync_or_register") return "LINE 동기화/등록"
  if (key === "erp_manual") return "ERP 수동수정"
  return key
}

export default function MembersPage() {
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
      setErrorMessage("회원 목록을 불러오지 못했습니다. 다시 시도해 주세요.")
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
          "LINE 동기화를 건너뜀: 서버에 LINE_CHANNEL_ACCESS_TOKEN이 설정되어 있지 않습니다. Vercel 환경 변수에 Messaging API 채널의 토큰을 넣은 뒤 재배포하세요."
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
            `자동 동기화 완료: 조회 ${Number(res.scanned || 0).toLocaleString()}명, 반영 ${Number(res.synced || 0).toLocaleString()}명, 실패 ${Number(res.failed || 0).toLocaleString()}명${lineSyncErrorHint(res.errors)}`
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
      await appAlert("회원 이름은 필수입니다.")
      return
    }
    setSaving(true)
    try {
      if (!form.id) {
        await appAlert("신규 등록은 LINE OA를 통해 진행됩니다. 목록에서 회원을 선택해 수정해 주세요.")
        return
      }
      const res = await updateMember({
        id: form.id,
        name,
        fullName: form.fullName.trim(),
        lineDisplayName: form.lineDisplayName.trim(),
        birthDate: form.birthDate.trim(),
        gender: form.gender.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        consentMarketing: form.consentMarketing,
        consentPrivacy: form.consentPrivacy,
        consentAt: form.consentAt.trim(),
        status: form.status,
      })
      if (!res.success || !res.member) {
        await appAlert(res.message || "회원 수정에 실패했습니다.")
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
            <h1 className="text-xl font-bold tracking-tight text-foreground">회원 관리</h1>
            <p className="text-xs text-muted-foreground">LINE Official 회원 항목 기준으로 조회/관리합니다.</p>
          </div>
        </div>

        {lineMessagingStatus.loaded && lineMessagingStatus.channelAccessTokenConfigured === false && (
          <div
            className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
            role="status"
          >
            <p className="font-medium text-amber-900 dark:text-amber-100">LINE Messaging API 미설정</p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              Vercel(또는 서버) 환경 변수에 <code className="rounded bg-muted px-1">LINE_CHANNEL_ACCESS_TOKEN</code>{" "}
              (오피셜의 Messaging API 채널에서 발급)과 웹훅용{" "}
              <code className="rounded bg-muted px-1">LINE_CHANNEL_SECRET</code>를 설정한 뒤 재배포해야 친구 목록·표시명
              동기화가 동작합니다. LINE Login 채널 토큰과는 다릅니다. 포인트·등급은 LINE MyCustomer API로 일괄 조회되지
              않으므로 ERP에서 관리하고, 전화·실명 등은 CRM 파일 반영 또는 수동 입력을 사용합니다.
            </p>
            {lineMessagingStatus.channelSecretConfigured === false && (
              <p className="mt-2 text-xs text-muted-foreground">
                현재 <code className="rounded bg-muted px-1">LINE_CHANNEL_SECRET</code>도 비어 있어 웹훅 검증이 실패할 수
                있습니다.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="lg:sticky lg:top-0 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">회원 정보 수정</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">신규 등록은 LINE 친구추가/이벤트 동기화로 자동 생성됩니다.</p>
              <div className="space-y-1.5">
                <Label>이름 *</Label>
                <Input value={form.name ?? ""} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>전체 이름(Full name)</Label>
                <Input value={form.fullName ?? ""} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>LINE 표시명</Label>
                <Input value={form.lineDisplayName ?? ""} onChange={(e) => setForm((p) => ({ ...p, lineDisplayName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>전화번호</Label>
                <Input value={form.phone ?? ""} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>이메일</Label>
                <Input value={form.email ?? ""} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>생년월일</Label>
                  <Input type="date" value={form.birthDate ?? ""} onChange={(e) => setForm((p) => ({ ...p, birthDate: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>성별</Label>
                  <Input placeholder="M/F/남/여" value={form.gender ?? ""} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.consentMarketing}
                    onChange={(e) => setForm((p) => ({ ...p, consentMarketing: e.target.checked }))}
                  />
                  마케팅 동의
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.consentPrivacy}
                    onChange={(e) => setForm((p) => ({ ...p, consentPrivacy: e.target.checked }))}
                  />
                  개인정보 동의
                </label>
              </div>
              <div className="space-y-1.5">
                <Label>동의 일시</Label>
                <Input
                  type="datetime-local"
                  value={form.consentAt ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, consentAt: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>상태(active/inactive)</Label>
                <Input
                  value={form.status ?? "active"}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value === "inactive" ? "inactive" : "active" }))}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={onSave} disabled={saving}>
                  {saving ? "저장 중..." : "저장"}
                </Button>
                <Button variant="outline" onClick={() => setForm({ ...emptyForm })}>
                  선택 해제
                </Button>
              </div>
            </CardContent>
          </Card>
          </div>

          <Card>
            <CardHeader className="space-y-3">
              <CardTitle className="text-base">회원 목록 (LINE 기준)</CardTitle>
              <div className="flex gap-2">
                <Input
                  placeholder="LINE표시명/전화번호/성명/등급/생년월일/회원번호/LINE ID 검색"
                  value={query ?? ""}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") load(query, true)
                  }}
                />
                <Button variant="outline" onClick={() => load(query, true)} disabled={searching}>
                  {searching ? "검색 중..." : "검색"}
                </Button>
                <Button
                  variant="outline"
                  disabled={syncing}
                  onClick={async () => {
                    setSyncing(true)
                    setSyncMessage("")
                    try {
                      const res = await syncLineMembers({ limit: 10000 })
                      if (!res.success) {
                        await appAlert(res.message || "LINE 회원 동기화에 실패했습니다.")
                      } else {
                        setSyncMessage(
                          `동기화 완료: 조회 ${Number(res.scanned || 0).toLocaleString()}명, 반영 ${Number(
                            res.synced || 0
                          ).toLocaleString()}명, 실패 ${Number(res.failed || 0).toLocaleString()}명${lineSyncErrorHint(res.errors)}`
                        )
                        await load(query)
                      }
                    } finally {
                      setSyncing(false)
                    }
                  }}
                >
                  {syncing ? "동기화 중..." : "LINE 동기화"}
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
                  파일 선택
                </Button>
                <Button
                  variant="outline"
                  disabled={importing}
                  onClick={async () => {
                    const file = importFileRef.current?.files?.[0]
                    if (!file) {
                      await appAlert("먼저 LINE CRM 파일(xlsx/xls/csv)을 선택해 주세요.")
                      return
                    }
                    setImporting(true)
                    try {
                      const res = await importLineCrmFile({ file })
                      if (!res.success) {
                        await appAlert(res.message || "LINE CRM 파일 반영에 실패했습니다.")
                        return
                      }
                      setSyncMessage(
                        `CRM 반영 완료: 총 ${Number(res.rowCount || 0).toLocaleString()}건 / 성공 ${Number(
                          res.successCount || 0
                        ).toLocaleString()}건 / 실패 ${Number(res.failedCount || 0).toLocaleString()}건`
                      )
                      if (importFileRef.current) importFileRef.current.value = ""
                      setSelectedImportFileName("")
                      await load(query)
                    } finally {
                      setImporting(false)
                    }
                  }}
                >
                  {importing ? "반영 중..." : "CRM 파일 반영"}
                </Button>
              </div>
              {errorMessage ? (
                <p className="text-xs text-destructive">{errorMessage}</p>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">검색 결과: {members.length.toLocaleString()}건</p>
                  {!!selectedImportFileName && <p className="text-xs text-muted-foreground">선택 파일: {selectedImportFileName}</p>}
                  <p className="text-[11px] text-muted-foreground">
                    CRM 파일 컬럼 예시: LINE display name, phone number, full name, date of birth
                  </p>
                  {!!syncMessage && <p className="text-xs text-emerald-700">{syncMessage}</p>}
                </div>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">불러오는 중...</p>
              ) : (
                <div className="overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="p-2 text-left">LINE 표시명</th>
                        <th className="p-2 text-left">전화번호</th>
                        <th className="p-2 text-left">성명(Full name)</th>
                        <th className="p-2 text-left">생년월일</th>
                        <th className="p-2 text-left">나이</th>
                        <th className="p-2 text-left">LINE User ID</th>
                        <th className="p-2 text-left">회원번호</th>
                        <th className="p-2 text-left">등급</th>
                        <th className="p-2 text-left">업데이트 원인</th>
                        <th className="p-2 text-left">상태</th>
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
                              name: String(m.lineDisplayName || m.name || ""),
                              fullName: m.fullName || "",
                              lineDisplayName: m.lineDisplayName || "",
                              birthDate: toDateInput(m.birthDate || ""),
                              gender: m.gender || "",
                              phone: m.phone || "",
                              email: m.email || "",
                              consentMarketing: Boolean(m.consentMarketing),
                              consentPrivacy: Boolean(m.consentPrivacy),
                              consentAt: toDateTimeLocalInput(m.consentAt || ""),
                              status: m.status === "inactive" ? "inactive" : "active",
                            })
                          }
                        >
                          <td className="p-2">{m.lineDisplayName || "-"}</td>
                          <td className="p-2">{m.phone || "-"}</td>
                          <td className="p-2">{m.fullName || "-"}</td>
                          <td className="p-2">{m.birthDate || "-"}</td>
                          <td className="p-2">{calcAge(m.birthDate)}</td>
                          <td className="p-2">{m.lineUserId || "-"}</td>
                          <td className="p-2">{m.memberNo || "-"}</td>
                          <td className="p-2">{m.tierCode || "-"}</td>
                          <td className="p-2">{reasonLabel(m.lastUpdateReason)}</td>
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
