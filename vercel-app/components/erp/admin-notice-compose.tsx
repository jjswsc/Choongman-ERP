"use client"

import * as React from "react"
import {
  Send,
  Paperclip,
  X,
  Store,
  Briefcase,
  Shield,
  Users,
  FileText,
  Image as ImageIcon,
  File,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { getNoticeOptions, sendNotice, useStoreList } from "@/lib/api-client"

interface AttachedFile {
  id: string
  name: string
  size: string
  type: "image" | "pdf" | "doc"
  dataUrl: string
  mime: string
}

const MAX_FILE_SIZE = 1024 * 1024
const MAX_FILES = 3

export function AdminNoticeCompose() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [title, setTitle] = React.useState("")
  const [content, setContent] = React.useState("")
  const [stores, setStores] = React.useState<string[]>([])
  const [positions, setPositions] = React.useState<string[]>([])
  const [permissionGroups, setPermissionGroups] = React.useState<string[]>([])
  const [selectedStores, setSelectedStores] = React.useState<string[]>([])
  const [selectedPositions, setSelectedPositions] = React.useState<string[]>([])
  const [selectedPermissionGroups, setSelectedPermissionGroups] = React.useState<string[]>([])
  const [selectedRecipients, setSelectedRecipients] = React.useState<string[]>([])
  const [files, setFiles] = React.useState<AttachedFile[]>([])
  const { staffByStore } = useStoreList()
  const [sending, setSending] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!auth?.store) return
    const isOffice = auth.role === "director" || auth.role === "officer"
    getNoticeOptions().then((r) => {
      const allLabel = t("noticeFilterAll")
      const storeList = isOffice ? (r.stores || []) : [auth.store!]
      setStores([allLabel, ...storeList])
      setPositions([allLabel, ...(r.roles || [])])
      setPermissionGroups([allLabel, ...(r.permissionGroups || [])])
    })
  }, [auth?.store, auth?.role, lang])

  const toggleStore = (store: string) => {
    const allLabel = t("noticeFilterAll")
    if (store === allLabel) {
      setSelectedStores(
        selectedStores.length === stores.length - 1
          ? []
          : stores.filter((s) => s !== allLabel)
      )
      return
    }
    setSelectedStores((prev) =>
      prev.includes(store) ? prev.filter((s) => s !== store) : [...prev, store]
    )
  }

  const togglePosition = (position: string) => {
    const allLabel = t("noticeFilterAll")
    if (position === allLabel) {
      setSelectedPositions(
        selectedPositions.length === positions.length - 1
          ? []
          : positions.filter((p) => p !== allLabel)
      )
      return
    }
    setSelectedPositions((prev) =>
      prev.includes(position)
        ? prev.filter((p) => p !== position)
        : [...prev, position]
    )
  }

  const togglePermissionGroup = (perm: string) => {
    const allLabel = t("noticeFilterAll")
    if (perm === allLabel) {
      setSelectedPermissionGroups(
        selectedPermissionGroups.length === permissionGroups.length - 1
          ? []
          : permissionGroups.filter((p) => p !== allLabel)
      )
      return
    }
    setSelectedPermissionGroups((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
    )
  }

  const toggleRecipient = (store: string, name: string) => {
    const key = `${store}|${name}`
    setSelectedRecipients((prev) =>
      prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
    )
  }

  const allStoresForStaff =
    selectedStores.length === 0 ||
    selectedStores.length === stores.length - 1
  const storeNamesForStaff = allStoresForStaff
    ? stores.filter((s) => s !== t("noticeFilterAll"))
    : selectedStores
  const allPositionsForStaff =
    selectedPositions.length === 0 ||
    selectedPositions.length === positions.length - 1
  const positionsToMatch = allPositionsForStaff
    ? null
    : new Set(
        selectedPositions
          .filter((p) => p !== t("noticeFilterAll"))
          .map((r) => r.trim().toLowerCase())
          .filter(Boolean)
      )
  const allPermissionGroupsForStaff =
    selectedPermissionGroups.length === 0 ||
    selectedPermissionGroups.length === permissionGroups.length - 1
  const permissionGroupsToMatch = allPermissionGroupsForStaff
    ? null
    : new Set(
        selectedPermissionGroups
          .filter((p) => p !== t("noticeFilterAll"))
          .map((r) => r.trim().toLowerCase())
          .filter(Boolean)
      )
  const employeeList = (() => {
    const list: { store: string; name: string; nick: string }[] = []
    for (const store of storeNamesForStaff) {
      const staff = staffByStore[store] || []
      for (const s of staff) {
        if (!s.name) continue
        if (positionsToMatch && positionsToMatch.size > 0) {
          const empJob = String(s.job || "").trim().toLowerCase()
          if (!empJob || !positionsToMatch.has(empJob)) continue
        }
        if (permissionGroupsToMatch && permissionGroupsToMatch.size > 0) {
          const empRole = String(s.role || "").trim().toLowerCase()
          if (!empRole || !permissionGroupsToMatch.has(empRole)) continue
        }
        list.push({ store, name: s.name, nick: s.nick || s.name })
      }
    }
    return list.sort((a, b) => (a.nick || "").localeCompare(b.nick || ""))
  })()

  // 매장/권한그룹/부서 선택 시 해당 직원을 모두 체크(선택) 상태로. 필요 없는 직원만 체크 해제하면 됨
  const employeeKeysStr = employeeList.map((e) => `${e.store}|${e.name}`).sort().join(",")
  React.useEffect(() => {
    const keys = employeeList.map((e) => `${e.store}|${e.name}`)
    setSelectedRecipients(keys)
  }, [employeeKeysStr])

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const selected = input.files
    if (!selected || selected.length === 0) return
    const remaining = MAX_FILES - files.length
    if (remaining <= 0) {
      alert(t("noticeFileLimit") || "파일당 5MB, 최대 10개")
      input.value = ""
      return
    }
    const newFiles: AttachedFile[] = []
    const processNext = (idx: number) => {
      if (idx >= selected.length || newFiles.length >= remaining) {
        if (newFiles.length > 0) setFiles((prev) => [...prev, ...newFiles])
        input.value = ""
        return
      }
      const file = selected[idx]
      if (file.size > MAX_FILE_SIZE) {
        alert(`${file.name}: ` + (t("noticeFileLimit") || "파일당 1MB, 최대 3개"))
        processNext(idx + 1)
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const mime = file.type || "application/octet-stream"
        let typ: "image" | "pdf" | "doc" = "doc"
        if (mime.startsWith("image/")) typ = "image"
        else if (mime.includes("pdf")) typ = "pdf"
        newFiles.push({
          id: `f-${Date.now()}-${idx}`,
          name: file.name,
          size: `${(file.size / 1024).toFixed(1)} KB`,
          type: typ,
          dataUrl,
          mime,
        })
        processNext(idx + 1)
      }
      reader.readAsDataURL(file)
    }
    processNext(0)
  }

  const handleSend = async () => {
    if (!title.trim()) {
      alert(t("adminNoticeSubjectRequired"))
      return
    }
    if (!auth?.store || !auth?.user) return
    const allStores = selectedStores.length === stores.length - 1
    const allPos = selectedPositions.length === positions.length - 1
    const allPerm = selectedPermissionGroups.length === permissionGroups.length - 1
    const targetStore =
      selectedStores.length === 0 || allStores ? "전체" : selectedStores.join(",")
    const targetRole =
      selectedPositions.length === 0 || allPos ? "전체" : selectedPositions.join(",")
    const targetPermissionGroup =
      selectedPermissionGroups.length === 0 || allPerm ? "" : selectedPermissionGroups.join(",")
    const targetRecipients =
      selectedRecipients.length > 0
        ? selectedRecipients.map((k) => {
            const [s, n] = k.split("|")
            return { store: s || "", name: n || "" }
          })
        : undefined
    setSending(true)
    try {
      const attachments = files.map((f) => ({ name: f.name, mime: f.mime, url: f.dataUrl }))
      const res = await sendNotice({
        title: title.trim(),
        content: content.trim(),
        targetStore,
        targetRole,
        targetPermissionGroup: targetPermissionGroup || undefined,
        sender: auth.user,
        userStore: auth.store,
        userRole: auth.role,
        attachments,
        targetRecipients,
      })
      if (res.success) {
        setTitle("")
        setContent("")
        setSelectedStores([])
        setSelectedPositions([])
        setSelectedPermissionGroups([])
        setSelectedRecipients([])
        setFiles([])
        window.dispatchEvent(new CustomEvent("notice-sent"))
        alert(translateApiMessage(res.message, t) || t("noticeSentSuccess"))
      } else {
        alert(translateApiMessage(res.message, t) || t("noticeSendFail"))
      }
    } finally {
      setSending(false)
    }
  }

  if (!auth?.store || !auth?.user) return null

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Send className="h-[18px] w-[18px] text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-card-foreground">
              {t("noticeNewTitle")}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {t("noticeNewSub")}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:text-foreground underline"
          onClick={async () => {
            try {
              const r = await fetch('/api/debugPushStatus')
              const d = await r.json()
              const msg = [
                `푸시 알림: ${d.pushNoticeEnabled ? 'ON' : 'OFF'}`,
                `Firebase: ${d.firebaseConfigured ? '설정됨' : '미설정'}`,
                `등록 토큰: ${d.pushTokensCount}개`,
                d.employeesWithoutTokenTotal > 0
                  ? `토큰 미등록: ${d.employeesWithoutTokenTotal}명`
                  : '',
                d.hint || '',
              ]
                .filter(Boolean)
                .join('\n')
              alert(msg)
            } catch (e) {
              alert('점검 실패: ' + (e instanceof Error ? e.message : String(e)))
            }
          }}
        >
          푸시 상태 점검
        </button>
      </div>

      <div className="flex flex-col gap-5 p-6">
        {/* Title */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-foreground">
            {t("labelSubject")}
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("noticeTitlePlaceholder")}
            className="h-10 text-sm"
          />
        </div>

        {/* 매장 | 권한 그룹 | 대상 부서 한 줄 */}
        <div className="grid grid-cols-3 gap-4">
          {/* 매장 */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Store className="h-3.5 w-3.5 text-primary" />
              {t("store")}
              {selectedStores.length > 0 && (
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                  {selectedStores.length === stores.length - 1
                    ? t("noticeFilterAll")
                    : `${selectedStores.length}${t("noticeStoreCountSuffix")}`}
                </span>
              )}
            </label>
            <ScrollArea className="h-[180px] rounded-lg border bg-muted/20 p-1">
              <div className="flex flex-col gap-0.5">
                {stores.map((store) => {
                  const isAll = store === t("noticeFilterAll")
                  const checked = isAll
                    ? selectedStores.length === stores.length - 1
                    : selectedStores.includes(store)
                  return (
                    <label
                      key={store}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-xs cursor-pointer transition-colors",
                        checked
                          ? "bg-primary/10 font-semibold text-primary"
                          : "text-card-foreground hover:bg-muted/50"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleStore(store)}
                        className="h-4 w-4"
                      />
                      <span>{store}</span>
                    </label>
                  )
                })}
              </div>
            </ScrollArea>
          </div>

          {/* 권한 그룹 */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Shield className="h-3.5 w-3.5 text-amber-600" />
              {t("adminTargetPermissionGroups")}
              {selectedPermissionGroups.length > 0 && (
                <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                  {selectedPermissionGroups.length === permissionGroups.length - 1
                    ? t("noticePermissionGroupAll")
                    : `${selectedPermissionGroups.length}${t("noticePermissionGroupCountSuffix")}`}
                </span>
              )}
            </label>
            <ScrollArea className="h-[180px] rounded-lg border bg-muted/20 p-1">
              <div className="flex flex-col gap-0.5">
                {permissionGroups.map((perm) => {
                  const isAll = perm === t("noticeFilterAll")
                  const checked = isAll
                    ? selectedPermissionGroups.length === permissionGroups.length - 1
                    : selectedPermissionGroups.includes(perm)
                  return (
                    <label
                      key={perm}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-xs cursor-pointer transition-colors",
                        checked
                          ? "bg-amber-500/10 font-semibold text-amber-700"
                          : "text-card-foreground hover:bg-muted/50"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => togglePermissionGroup(perm)}
                        className="h-4 w-4"
                      />
                      <span>{perm}</span>
                    </label>
                  )
                })}
              </div>
            </ScrollArea>
          </div>

          {/* 대상 부서 */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
              <Briefcase className="h-3.5 w-3.5 text-success" />
              {t("noticeTargetDept") || "대상 부서"}
              {selectedPositions.length > 0 && (
                <span className="rounded-md bg-success/10 px-1.5 py-0.5 text-[10px] font-bold text-success">
                  {selectedPositions.length === positions.length - 1
                    ? t("noticeFilterAll")
                    : `${selectedPositions.length}${t("noticePositionCountSuffix")}`}
                </span>
              )}
            </label>
            <ScrollArea className="h-[180px] rounded-lg border bg-muted/20 p-1">
              <div className="flex flex-col gap-0.5">
                {positions.map((pos) => {
                  const isAll = pos === t("noticeFilterAll")
                  const checked = isAll
                    ? selectedPositions.length === positions.length - 1
                    : selectedPositions.includes(pos)
                  return (
                    <label
                      key={pos}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-xs cursor-pointer transition-colors",
                        checked
                          ? "bg-success/10 font-semibold text-success"
                          : "text-card-foreground hover:bg-muted/50"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => togglePosition(pos)}
                        className="h-4 w-4"
                      />
                      <span>{pos}</span>
                    </label>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Individual employees (by nickname) */}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Users className="h-3.5 w-3.5 text-amber-500" />
            {t("adminTargetIndividuals")}
            {selectedRecipients.length > 0 && (
              <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
                {selectedRecipients.length}{t("adminRecipientsCountSuffix")}
              </span>
            )}
          </label>
          <ScrollArea className="h-[120px] rounded-lg border bg-muted/20 p-2">
            <div className="flex flex-wrap gap-1.5">
              {employeeList.length === 0 ? (
                <span className="text-xs text-muted-foreground">-</span>
              ) : (
                employeeList.map((emp) => {
                  const key = `${emp.store}|${emp.name}`
                  const checked = selectedRecipients.includes(key)
                  return (
                    <label
                      key={key}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs cursor-pointer transition-colors",
                        checked
                          ? "bg-amber-500/15 font-semibold text-amber-700"
                          : "text-card-foreground hover:bg-muted/50"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleRecipient(emp.store, emp.name)}
                        className="h-3.5 w-3.5"
                      />
                      <span>{emp.nick}</span>
                    </label>
                  )
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-foreground">
            {t("labelContent")}
          </label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t("noticeContentPlaceholder")}
            className="min-h-[160px] text-sm resize-none"
          />
        </div>

        {/* File attachment */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-foreground">
            {t("noticeFileLabel")}
          </label>
          {files.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2.5 rounded-lg border bg-muted/20 px-3 py-2"
                >
                  {file.type === "image" ? (
                    <ImageIcon className="h-4 w-4 shrink-0 text-primary" />
                  ) : file.type === "pdf" ? (
                    <FileText className="h-4 w-4 shrink-0 text-destructive" />
                  ) : (
                    <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-card-foreground">
                      {file.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{file.size}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(file.id)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/30 hover:border-muted-foreground/30"
            >
              <Paperclip className="h-4 w-4" />
              <span>{t("noticeFileAdd").split("(")[0]?.trim() || t("noticeFileAdd")}</span>
            </button>
            <p className="text-[11px] text-muted-foreground">{t("noticeFileLimit")}</p>
          </div>
        </div>

        {/* Submit */}
        <Button
          className="h-11 text-sm font-bold"
          onClick={handleSend}
          disabled={sending}
        >
          <Send className="mr-2 h-4 w-4" />
          {sending ? t("loading") : t("adminSendNoticeBtn")}
        </Button>
      </div>
    </div>
  )
}
