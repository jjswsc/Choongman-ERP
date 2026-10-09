"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Camera, History, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StoreActionPersonSelect } from "@/components/admin/store-action-person-select"
import { StoreActionTimeline } from "@/components/admin/store-action-timeline"
import { appAlert, appConfirm, appPrompt } from "@/lib/app-message"
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  saveStoreActionItems,
  updateStoreActionItem,
  uploadStoreActionPhoto,
  type CheckHistoryItem,
  type StoreActionItem,
} from "@/lib/api-client"
import {
  STORE_ACTION_CATEGORIES,
  STORE_ACTION_PRIORITIES,
  isStoreActionOpenStatus,
  storeActionDefaultDueDays,
} from "@/lib/store-action-items"
import { STORE_ACTION_CAT_TEMPLATE_I18N, addDaysYmd, storeActionLabelers } from "@/lib/store-action-i18n"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { cn } from "@/lib/utils"

type T = (k: string) => string

/** 같은 점검(매장·날짜)에서 등록한 문제 묶음 — 재발 판정에서 서로 제외 */
export function storeCheckIssueSourceRef(store: string, date: string): string {
  return `check:${store}|${date}`
}

function fill(s: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s)
}

function bkk(iso: string, withTime = false): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  return withTime
    ? d.toLocaleString("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
}

async function uploadPhotos(store: string, files: FileList, t: T): Promise<string[]> {
  const urls: string[] = []
  for (let i = 0; i < files.length; i++) {
    const res = await uploadStoreActionPhoto(store, files[i])
    if (res.success && res.url) urls.push(res.url)
    else await appAlert(translateApiMessage(res.message, t) || t("msg_upload_fail"))
  }
  return urls
}

function Thumbs({ urls, label }: { urls: string[]; label: string }) {
  if (!urls.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      {urls.slice(0, 5).map((u) => (
        <a key={u} href={u} target="_blank" rel="noreferrer" className="block h-10 w-10">
          <img src={u} alt="" className="h-full w-full rounded border object-cover" />
        </a>
      ))}
    </div>
  )
}

/** 문제 1건 — 발견자·담당·재확인·마감 확인자 + 역할별 처리 + 이력 */
export function StoreCheckIssueCard(props: {
  item: StoreActionItem
  canVerify: boolean
  me: string
  t: T
  onChanged: () => void
  selected?: boolean
  onSelect?: (on: boolean) => void
}) {
  const { item, canVerify, me, t, onChanged, selected, onSelect } = props
  const label = storeActionLabelers(t)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")
  const [resolution, setResolution] = useState(item.resolutionNote || "")
  const [newAfter, setNewAfter] = useState<string[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const open = isStoreActionOpenStatus(item.status)
  const isOwner = !!me && item.ownerName.trim().toLowerCase() === me
  const verifyMode = open && canVerify && !isOwner
  const ownerMode = open && !verifyMode && item.status !== "pending_verify"
  const pending = item.status === "pending_verify"

  const run = async (data: Record<string, unknown>, action?: string) => {
    setBusy(true)
    try {
      const res = await updateStoreActionItem(item.id, data, action)
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("msg_modify_fail"))
        return
      }
      setNote("")
      setNewAfter([])
      setHistoryKey((k) => k + 1)
      onChanged()
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  const afterAll = [...(item.afterPhotoUrls || []), ...newAfter]

  const requestVerify = async () => {
    if (afterAll.length === 0) {
      await appAlert(t("dp_act_need_after_photo"))
      return
    }
    await run({ resolutionNote: resolution, afterPhotoUrls: afterAll }, "request_verify")
  }

  const reject = async () => {
    let reason = note.trim()
    if (!reason) {
      const r = await appPrompt(t("dp_act_reject_prompt"))
      if (!r || !r.trim()) return
      reason = r.trim()
    }
    await run({ verificationNote: reason, afterPhotoUrls: afterAll }, "verify_reject")
  }

  return (
    <div
      className={cn(
        "space-y-1.5 rounded-lg border p-3 text-xs",
        item.overdue
          ? "border-red-400 bg-red-50 dark:bg-red-950/30"
          : pending
            ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20"
            : item.status === "completed"
              ? "border-emerald-400/60 bg-emerald-50/60 dark:bg-emerald-950/20"
              : ""
      )}
    >
      <div className="flex items-start gap-2">
        {onSelect ? (
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0"
            checked={!!selected}
            onChange={(e) => onSelect(e.target.checked)}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{item.title}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
              {label.status(item.status)}
            </Badge>
            {item.overdue ? (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                {t("action_overdue_badge")}
              </Badge>
            ) : null}
            {item.repeatCount > 0 ? (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {fill(t("action_repeat_n"), { n: item.repeatCount })}
              </Badge>
            ) : null}
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {label.category(item.category)}
            </Badge>
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <dt className="text-muted-foreground">{t("check_issue_found_by")}</dt>
        <dd>
          {item.createdBy || "—"} · {bkk(item.createdAt)}
        </dd>
        <dt className="text-muted-foreground">{t("action_field_owner")}</dt>
        <dd>
          {item.ownerName || "—"} · {t("action_field_due")} {item.dueDate || "—"}
        </dd>
        {item.status === "completed" ? (
          <>
            <dt className="text-muted-foreground">{t("check_issue_closed_by")}</dt>
            <dd className="font-medium text-emerald-700 dark:text-emerald-400">
              {item.verifierName || "—"} · {bkk(item.verifiedAt || item.completedAt, true)}
            </dd>
          </>
        ) : (
          <>
            <dt className="text-muted-foreground">{t("action_field_verifier")}</dt>
            <dd>{item.verifierName || "—"}</dd>
          </>
        )}
      </dl>

      {item.actionPlan && !item.resolutionNote ? (
        <p className="line-clamp-3 whitespace-pre-wrap text-muted-foreground">
          {t("action_field_plan")}: {item.actionPlan}
        </p>
      ) : null}
      {item.resolutionNote ? (
        <p className="line-clamp-3 whitespace-pre-wrap">
          {t("action_field_resolution")}: {item.resolutionNote}
        </p>
      ) : null}
      {item.verificationNote ? (
        <p className="line-clamp-2 whitespace-pre-wrap text-muted-foreground">
          {t("action_field_verify_note")}: {item.verificationNote}
        </p>
      ) : null}
      <Thumbs urls={item.photoUrls || []} label={t("action_photo_before")} />
      <Thumbs urls={afterAll} label={t("action_photo_after")} />

      {ownerMode || verifyMode ? (
        <div className="space-y-1.5 rounded border border-dashed p-2">
          {ownerMode ? (
            <Textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              placeholder={t("dp_act_resolution_ph")}
              className="min-h-[48px] text-xs"
            />
          ) : null}
          {verifyMode ? (
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("action_field_verify_note")}
              className="h-8 text-xs"
            />
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {item.status === "open" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={busy}
                onClick={() => void run({ status: "in_progress" })}
              >
                {t("check_issue_start")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Camera className="h-3.5 w-3.5" />
              {t("action_photo_after")}
              {newAfter.length ? ` (+${newAfter.length})` : ""}
            </Button>
            {ownerMode ? (
              <Button type="button" size="sm" className="h-8" disabled={busy} onClick={() => void requestVerify()}>
                {t("action_request_verify")}
              </Button>
            ) : null}
            {verifyMode ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  disabled={busy}
                  onClick={() =>
                    void run({ verificationNote: note, afterPhotoUrls: afterAll }, "verify_pass")
                  }
                >
                  {pending ? t("action_verify_pass") : t("action_verify_field_pass")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-8"
                  disabled={busy}
                  onClick={() => void reject()}
                >
                  {t("action_verify_reject")}
                </Button>
              </>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = e.target.files
              e.target.value = ""
              if (!files?.length) return
              setBusy(true)
              void uploadPhotos(item.store, files, t)
                .then((urls) => setNewAfter((u) => [...u, ...urls]))
                .finally(() => setBusy(false))
            }}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-1.5 text-[11px]"
          onClick={() => setShowHistory((v) => !v)}
        >
          <History className="h-3.5 w-3.5" />
          {t("check_issue_history")}
        </Button>
        <Button asChild variant="link" size="sm" className="h-7 px-0 text-[11px]">
          <Link href={`/admin/store-actions?tab=process&id=${item.id}`}>{t("action_visit_open_go")}</Link>
        </Button>
      </div>
      {showHistory ? <StoreActionTimeline actionId={item.id} refreshKey={historyKey} t={t} /> : null}
    </div>
  )
}

export type StoreCheckIssueKey = { key: string; label: string }

/** 재점검 화면 — 이 매장 미해결 문제 전부(점검 항목별) + 일괄 확정 + 최근 마감 */
export function StoreCheckIssuesPanel(props: {
  items: StoreActionItem[]
  closed: StoreActionItem[]
  prevCheck: CheckHistoryItem | null
  keys: StoreCheckIssueKey[]
  canVerify: boolean
  me: string
  loading: boolean
  t: T
  tr: (s: string) => string
  onAddForKey: (key: string) => void
  onChanged: () => void
}) {
  const { items, closed, prevCheck, keys, canVerify, me, loading, t, tr, onAddForKey, onChanged } = props
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [showClosed, setShowClosed] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  useEffect(() => {
    setSelected((prev) => new Set([...prev].filter((id) => items.some((i) => i.id === id))))
  }, [items])

  const labelOf = (key: string) =>
    keys.find((k) => k.key === key)?.label ||
    key
      .split(" > ")
      .map((s) => tr(s))
      .join(" > ")

  const groups = useMemo(() => {
    const order = new Map(keys.map((k, i) => [k.key, i]))
    const m = new Map<string, StoreActionItem[]>()
    for (const it of items) {
      const k = it.checkItemId || ""
      m.set(k, [...(m.get(k) || []), it])
    }
    return [...m.entries()].sort((a, b) => {
      if (!a[0]) return 1
      if (!b[0]) return -1
      return (order.get(a[0]) ?? 9999) - (order.get(b[0]) ?? 9999)
    })
  }, [items, keys])

  const verifiable = (it: StoreActionItem) =>
    canVerify && isStoreActionOpenStatus(it.status) && it.ownerName.trim().toLowerCase() !== me
  const overdue = items.filter((i) => i.overdue).length
  const pending = items.filter((i) => i.status === "pending_verify").length

  const bulkPass = async () => {
    const ids = [...selected]
    if (!ids.length) return
    if (!(await appConfirm(fill(t("check_issue_bulk_confirm"), { n: ids.length })))) return
    setBulkBusy(true)
    let ok = 0
    let fail = 0
    for (const id of ids) {
      try {
        const res = await updateStoreActionItem(id, { verificationNote: "" }, "verify_pass")
        if (res.success) ok += 1
        else fail += 1
      } catch {
        fail += 1
      }
    }
    setBulkBusy(false)
    setSelected(new Set())
    await appAlert(fill(t("check_issue_bulk_done"), { ok, fail }))
    onChanged()
  }

  return (
    <div className="mb-4 space-y-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">{t("check_issue_panel_title")}</p>
          <p className="text-xs">
            {fill(t("check_issue_summary"), { open: items.length, overdue, pending })}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {prevCheck
              ? fill(t("check_issue_prev_check"), {
                  date: prevCheck.date,
                  name: prevCheck.inspector || "—",
                  result: prevCheck.result || "—",
                })
              : t("check_issue_no_prev")}
          </p>
        </div>
        {canVerify && items.some(verifiable) ? (
          <div className="flex flex-wrap gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() =>
                setSelected(new Set(items.filter((i) => verifiable(i) && i.status === "pending_verify").map((i) => i.id)))
              }
            >
              {t("check_issue_select_all_pending")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs"
              disabled={bulkBusy || selected.size === 0}
              onClick={() => void bulkPass()}
            >
              {fill(t("check_issue_bulk_pass"), { n: selected.size })}
            </Button>
          </div>
        ) : null}
      </div>
      <p className="text-[11px] text-muted-foreground">{t("check_issue_panel_hint")}</p>

      {loading ? (
        <p className="text-xs text-muted-foreground">{t("loading")}</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("action_visit_open_empty")}</p>
      ) : (
        <div className="space-y-3">
          {groups.map(([key, list]) => (
            <div key={key || "__other__"} className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold">
                  {key ? labelOf(key) : t("check_issue_group_other")} · {list.length}
                </p>
                {key && keys.some((k) => k.key === key) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-1.5 text-[11px]"
                    onClick={() => onAddForKey(key)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("check_issue_add_row")}
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {list.map((it) => (
                  <StoreCheckIssueCard
                    key={it.id}
                    item={it}
                    canVerify={canVerify}
                    me={me}
                    t={t}
                    onChanged={onChanged}
                    selected={selected.has(it.id)}
                    onSelect={
                      verifiable(it)
                        ? (on) =>
                            setSelected((s) => {
                              const n = new Set(s)
                              if (on) n.add(it.id)
                              else n.delete(it.id)
                              return n
                            })
                        : undefined
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {closed.length > 0 ? (
        <div className="space-y-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-1.5 text-xs"
            onClick={() => setShowClosed((v) => !v)}
          >
            {fill(t("check_issue_recent_closed"), { n: closed.length })} {showClosed ? "▲" : "▼"}
          </Button>
          {showClosed ? (
            <div className="grid gap-2 md:grid-cols-2">
              {closed.map((it) => (
                <StoreCheckIssueCard key={it.id} item={it} canVerify={false} me={me} t={t} onChanged={onChanged} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

type Draft = {
  uid: number
  title: string
  category: string
  priority: string
  dueDate: string
  ownerName: string
  ownerUserId: string
  actionPlan: string
  photoUrls: string[]
  useCheckPhotos: boolean
}

/** 점검 항목 1개 — 이 항목의 미해결 문제 + 새 문제 여러 건 한 번에 등록 */
export function StoreCheckIssueDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  store: string
  date: string
  itemKey: string
  itemLabel: string
  checkPhotos: string[]
  existing: StoreActionItem[]
  canVerify: boolean
  me: string
  myName: string
  myEmployeeId: string
  t: T
  onChanged: () => void
}) {
  const { open, onOpenChange, store, date, itemKey, itemLabel, checkPhotos, existing, canVerify, me, myName, myEmployeeId, t, onChanged } =
    props
  const label = storeActionLabelers(t)
  const today = getBangkokTodayDateString()
  const uidRef = useRef(1)
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadFor = useRef<number | null>(null)

  const blank = (prev?: Draft): Draft => ({
    uid: uidRef.current++,
    title: "",
    category: prev?.category || "기타",
    priority: "보통",
    dueDate: addDaysYmd(today, storeActionDefaultDueDays(prev?.category || "기타")),
    ownerName: prev?.ownerName || "",
    ownerUserId: prev?.ownerUserId || "",
    actionPlan: t(STORE_ACTION_CAT_TEMPLATE_I18N[prev?.category || "기타"] || "action_tpl_etc"),
    photoUrls: [],
    useCheckPhotos: !prev,
  })

  const [drafts, setDrafts] = useState<Draft[]>([])
  const [verifier, setVerifier] = useState({ name: "", userId: "" })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setDrafts([blank()])
    setVerifier(canVerify ? { name: myName, userId: myEmployeeId } : { name: "", userId: "" })
  }, [open, itemKey])

  const patch = (uid: number, p: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d) => (d.uid === uid ? { ...d, ...p } : d)))

  const onCategory = (d: Draft, category: string) => {
    const prevTpl = t(STORE_ACTION_CAT_TEMPLATE_I18N[d.category] || "action_tpl_etc")
    const keepPlan = d.actionPlan.trim() && d.actionPlan !== prevTpl
    patch(d.uid, {
      category,
      dueDate: addDaysYmd(today, storeActionDefaultDueDays(category)),
      actionPlan: keepPlan ? d.actionPlan : t(STORE_ACTION_CAT_TEMPLATE_I18N[category] || "action_tpl_etc"),
    })
  }

  const save = async () => {
    const v = verifier.name.trim()
    for (const d of drafts) {
      if (!d.ownerName.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(d.dueDate) || !v) {
        await appAlert(t("action_required_fields"))
        return
      }
      if (d.ownerName.trim().toLowerCase() === v.toLowerCase()) {
        await appAlert(t("action_msg_owner_ne_verifier"))
        return
      }
    }
    setBusy(true)
    try {
      const res = await saveStoreActionItems(
        drafts.map((d) => ({
          store,
          title: d.title.trim() || itemLabel,
          description: `${t("action_desc_from_check")} ${itemKey}`,
          category: d.category,
          priority: d.priority,
          ownerName: d.ownerName,
          ownerUserId: d.ownerUserId,
          dueDate: d.dueDate,
          verifierName: v,
          verifierUserId: verifier.userId,
          actionPlan: d.actionPlan,
          photoUrls: [...(d.useCheckPhotos ? checkPhotos : []), ...d.photoUrls],
          sourceType: "check_fail",
          sourceRef: storeCheckIssueSourceRef(store, date),
          checkItemId: itemKey,
          createdBy: myName,
        }))
      )
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail"))
        return
      }
      await appAlert(fill(t("check_issue_saved_n"), { n: res.created?.length ?? drafts.length }))
      setDrafts([blank(drafts[drafts.length - 1])])
      onChanged()
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {t("check_issue_dialog_title")}
            <span className="text-sm font-normal text-muted-foreground"> — {itemLabel}</span>
          </DialogTitle>
        </DialogHeader>

        {existing.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold">
              {t("check_issue_existing")} · {existing.length}
            </p>
            {existing.map((it) => (
              <StoreCheckIssueCard key={it.id} item={it} canVerify={canVerify} me={me} t={t} onChanged={onChanged} />
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-semibold">{t("check_issue_new")}</p>
          {drafts.map((d, idx) => (
            <div key={d.uid} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold tabular-nums">#{idx + 1}</span>
                <Input
                  value={d.title}
                  onChange={(e) => patch(d.uid, { title: e.target.value })}
                  placeholder={t("check_issue_title_ph")}
                  className="h-9 flex-1 text-xs"
                />
                {drafts.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    aria-label={t("check_issue_remove_row")}
                    onClick={() => setDrafts((ds) => ds.filter((x) => x.uid !== d.uid))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="col-span-2">
                  <label className="text-[11px] text-muted-foreground">{t("action_field_owner")}</label>
                  <StoreActionPersonSelect
                    store={store}
                    name={d.ownerName}
                    userId={d.ownerUserId}
                    t={t}
                    onChange={(p) => patch(d.uid, { ownerName: p.name, ownerUserId: p.userId })}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">{t("action_field_due")}</label>
                  <Input
                    type="date"
                    value={d.dueDate}
                    onChange={(e) => patch(d.uid, { dueDate: e.target.value })}
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">{t("action_field_priority")}</label>
                  <Select value={d.priority} onValueChange={(v) => patch(d.uid, { priority: v })}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STORE_ACTION_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {label.priority(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] text-muted-foreground">{t("action_field_category")}</label>
                  <Select value={d.category} onValueChange={(v) => onCategory(d, v)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STORE_ACTION_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {label.category(c)} ({fill(t("action_due_days"), { n: storeActionDefaultDueDays(c) })})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Textarea
                value={d.actionPlan}
                onChange={(e) => patch(d.uid, { actionPlan: e.target.value })}
                placeholder={t("action_field_plan")}
                className="min-h-[48px] text-xs"
              />
              <div className="flex flex-wrap items-center gap-2">
                {checkPhotos.length > 0 ? (
                  <label className="flex items-center gap-1 text-[11px]">
                    <input
                      type="checkbox"
                      checked={d.useCheckPhotos}
                      onChange={(e) => patch(d.uid, { useCheckPhotos: e.target.checked })}
                    />
                    {fill(t("check_issue_attach_check_photos"), { n: checkPhotos.length })}
                  </label>
                ) : null}
                {d.photoUrls.map((u) => (
                  <div key={u} className="relative h-10 w-10">
                    <img src={u} alt="" className="h-full w-full rounded border object-cover" />
                    <button
                      type="button"
                      className="absolute -right-1 -top-1 rounded-full border bg-background p-0.5"
                      onClick={() => patch(d.uid, { photoUrls: d.photoUrls.filter((x) => x !== u) })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1"
                  disabled={busy}
                  onClick={() => {
                    uploadFor.current = d.uid
                    fileRef.current?.click()
                  }}
                >
                  <Camera className="h-3.5 w-3.5" />
                  {t("action_photo_before")}
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1"
            onClick={() => setDrafts((ds) => [...ds, blank(ds[ds.length - 1])])}
          >
            <Plus className="h-3.5 w-3.5" />
            {t("check_issue_add_row")}
          </Button>
          <div>
            <label className="text-[11px] text-muted-foreground">{t("check_issue_verifier_shared")}</label>
            <StoreActionPersonSelect
              store={store}
              name={verifier.name}
              userId={verifier.userId}
              t={t}
              preferHq
              onChange={(p) => setVerifier({ name: p.name, userId: p.userId })}
            />
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files
            const uid = uploadFor.current
            e.target.value = ""
            uploadFor.current = null
            if (!files?.length || uid == null) return
            setBusy(true)
            void uploadPhotos(store, files, t)
              .then((urls) =>
                setDrafts((ds) => ds.map((x) => (x.uid === uid ? { ...x, photoUrls: [...x.photoUrls, ...urls] } : x)))
              )
              .finally(() => setBusy(false))
          }}
        />

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="h-9" onClick={() => onOpenChange(false)}>
            {t("btn_close")}
          </Button>
          <Button type="button" className="h-9" disabled={busy || drafts.length === 0} onClick={() => void save()}>
            {fill(t("check_issue_save_n"), { n: drafts.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
