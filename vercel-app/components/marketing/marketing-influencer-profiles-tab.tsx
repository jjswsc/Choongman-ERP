"use client"

import * as React from "react"
import { FileSpreadsheet, Pencil, Plus, Save, Search, Send, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { appAlert, appConfirm } from "@/lib/app-message"
import { cn } from "@/lib/utils"
import {
  deleteMarketingInfluencerProfile,
  getMarketingInfluencerSalesLift,
  importInfluencerProfilesXlsx,
  saveMarketingInfluencerProfile,
  type InfluencerProfileImportResult,
  type InfluencerSalesLiftRow,
  type MarketingInfluencer,
  type MarketingInfluencerProfile,
} from "@/lib/api-client"
import {
  INFLUENCER_PIPELINE_STATUSES,
  formatFollowersShort,
  parseFollowersCount,
  type InfluencerPipelineStatus,
} from "@/lib/marketing-influencer-profile"
import { addDaysYmd, diffDaysYmd } from "@/lib/marketing-influencer-sales-lift"

type TFn = (key: string) => string

const selectCn =
  "flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm disabled:opacity-60"

const STATUS_BADGE: Record<InfluencerPipelineStatus, string> = {
  waiting: "bg-muted text-muted-foreground",
  interested: "bg-sky-100 text-sky-900 dark:bg-sky-900/35 dark:text-sky-200",
  got_rate: "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/35 dark:text-indigo-200",
  high_rate: "bg-amber-100 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100",
  hired: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/35 dark:text-emerald-200",
  not_selected: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  no_reply: "bg-rose-100 text-rose-900 dark:bg-rose-900/35 dark:text-rose-200",
  unavailable: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
}

export function influencerStatusLabel(t: TFn, s: string): string {
  return t(`mktInfStatus_${s}`)
}

export function InfluencerStatusBadge({ t, status }: { t: TFn; status: InfluencerPipelineStatus }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_BADGE[status])}>
      {influencerStatusLabel(t, status)}
    </span>
  )
}

function fill(template: string, vars: Record<string, string | number>): string {
  let s = template
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}

type ProfileForm = {
  displayName: string
  contentCategories: string
  tiktokUrl: string
  tiktokFollowers: string
  instagramUrl: string
  instagramFollowers: string
  facebookUrl: string
  facebookFollowers: string
  contact: string
  contactName: string
  contactPhone: string
  rateTiktok: string
  rateInstagram: string
  rateFacebook: string
  ratePackage: string
  rateIncludes: string
  extraCost: string
  preferredStore: string
  rateInquiredAt: string
  pipelineStatus: InfluencerPipelineStatus
  rateCardUrl: string
  note: string
}

function emptyForm(): ProfileForm {
  return {
    displayName: "",
    contentCategories: "",
    tiktokUrl: "",
    tiktokFollowers: "",
    instagramUrl: "",
    instagramFollowers: "",
    facebookUrl: "",
    facebookFollowers: "",
    contact: "",
    contactName: "",
    contactPhone: "",
    rateTiktok: "",
    rateInstagram: "",
    rateFacebook: "",
    ratePackage: "",
    rateIncludes: "",
    extraCost: "",
    preferredStore: "",
    rateInquiredAt: "",
    pipelineStatus: "waiting",
    rateCardUrl: "",
    note: "",
  }
}

function profileToForm(p: MarketingInfluencerProfile): ProfileForm {
  return {
    displayName: p.displayName,
    contentCategories: p.contentCategories.join(", "),
    tiktokUrl: p.tiktokUrl,
    tiktokFollowers: formatFollowersShort(p.tiktokFollowers),
    instagramUrl: p.instagramUrl,
    instagramFollowers: formatFollowersShort(p.instagramFollowers),
    facebookUrl: p.facebookUrl,
    facebookFollowers: formatFollowersShort(p.facebookFollowers),
    contact: p.contact,
    contactName: p.contactName,
    contactPhone: p.contactPhone,
    rateTiktok: p.rateTiktok,
    rateInstagram: p.rateInstagram,
    rateFacebook: p.rateFacebook,
    ratePackage: p.ratePackage,
    rateIncludes: p.rateIncludes,
    extraCost: p.extraCost,
    preferredStore: p.preferredStore,
    rateInquiredAt: p.rateInquiredAt ?? "",
    pipelineStatus: p.pipelineStatus,
    rateCardUrl: p.rateCardUrl,
    note: p.note,
  }
}

function formToPayload(f: ProfileForm) {
  return {
    ...f,
    contentCategories: f.contentCategories
      .split(/[,/]+/)
      .map((x) => x.trim())
      .filter(Boolean),
    tiktokFollowers: parseFollowersCount(f.tiktokFollowers),
    instagramFollowers: parseFollowersCount(f.instagramFollowers),
    facebookFollowers: parseFollowersCount(f.facebookFollowers),
    rateInquiredAt: f.rateInquiredAt || null,
  }
}

function profileSearchBlob(p: MarketingInfluencerProfile): string {
  return [
    p.displayName,
    p.tiktokHandle,
    p.instagramHandle,
    p.contact,
    p.contactName,
    p.contactPhone,
    p.note,
    p.rateIncludes,
    p.preferredStore,
    ...p.contentCategories,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
}

function SocialCell({ url, followers, handle }: { url: string; followers: number | null; handle?: string }) {
  if (!url && followers == null) return <span className="text-muted-foreground">—</span>
  return (
    <div className="space-y-0.5">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block max-w-[140px] truncate text-xs text-primary hover:underline">
          {handle ? `@${handle}` : url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 28)}
        </a>
      ) : null}
      {followers != null ? <div className="text-[11px] tabular-nums text-muted-foreground">{formatFollowersShort(followers)}</div> : null}
    </div>
  )
}

function ProfileLiftSummary({ t, profileId, posts }: { t: TFn; profileId: string; posts: MarketingInfluencer[] }) {
  const [loading, setLoading] = React.useState(false)
  const [rows, setRows] = React.useState<InfluencerSalesLiftRow[] | null>(null)
  const [error, setError] = React.useState("")

  const run = React.useCallback(async () => {
    const dates = posts.map((p) => (p.publishDate || "").trim()).filter(Boolean).sort()
    if (!dates.length) return
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
    let from = dates[0]!
    if (diffDaysYmd(today, from) > 395) from = addDaysYmd(today, -395)
    setLoading(true)
    setError("")
    try {
      const res = await getMarketingInfluencerSalesLift({ from, to: today, windowDays: 7, profileId })
      if (!res.success) {
        setError(res.message || "")
        setRows([])
      } else setRows(res.rows || [])
    } finally {
      setLoading(false)
    }
  }, [posts, profileId])

  const agg = React.useMemo(() => {
    const usable = (rows || []).filter((r) => r.lift && !r.lift.pending && !r.lift.overlap && !r.lift.noSales && !r.lift.notStarted)
    let inc = 0
    let cost = 0
    let liftSum = 0
    let liftN = 0
    for (const r of usable) {
      inc += r.lift!.incrementalSales
      cost += r.lift!.cost
      if (r.lift!.liftPct != null) {
        liftSum += r.lift!.liftPct
        liftN++
      }
    }
    return { n: usable.length, inc, cost, avgLift: liftN ? liftSum / liftN : null, roi: cost > 0 ? inc / cost : null }
  }, [rows])

  if (!posts.some((p) => (p.publishDate || "").trim())) {
    return <p className="text-[11px] text-muted-foreground">{t("mktInfPublishDateRequiredForLift")}</p>
  }
  if (rows == null) {
    return (
      <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={loading} onClick={() => void run()}>
        {loading ? t("loading") : t("mktInfLoadLift")}
      </Button>
    )
  }
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {error ? <span className="text-destructive">{error}</span> : null}
      <span className="text-muted-foreground">{t("mktInfDetailLiftSummary")}</span>
      <span>{fill(t("mktInfLiftUploadsCount"), { n: agg.n })}</span>
      <span>
        {t("mktInfLiftColLift")}{" "}
        <b className={cn(agg.avgLift != null && agg.avgLift >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300")}>
          {agg.avgLift == null ? "—" : `${agg.avgLift >= 0 ? "+" : ""}${agg.avgLift.toFixed(1)}%`}
        </b>
      </span>
      <span>
        {t("mktInfLiftColIncremental")} <b>฿{Math.round(agg.inc).toLocaleString()}</b>
      </span>
      <span>
        {t("mktInfLiftColCost")} ฿{Math.round(agg.cost).toLocaleString()}
      </span>
      <span>
        ROI <b>{agg.roi == null ? "—" : `${agg.roi.toFixed(2)}x`}</b>
      </span>
    </div>
  )
}

export function MarketingInfluencerProfilesTab(props: {
  profiles: MarketingInfluencerProfile[]
  posts: MarketingInfluencer[]
  stores: string[]
  formatStoreLabel: (s: string) => string
  loading: boolean
  t: TFn
  onReload: () => Promise<void> | void
  onCreatePost: (p: MarketingInfluencerProfile) => void
}) {
  const { profiles, posts, stores, formatStoreLabel, loading, t, onReload, onCreatePost } = props

  const [statusFilter, setStatusFilter] = React.useState<"" | InfluencerPipelineStatus>("")
  const [storeFilter, setStoreFilter] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [formOpen, setFormOpen] = React.useState(false)
  const [form, setForm] = React.useState<ProfileForm>(emptyForm)
  const [saving, setSaving] = React.useState(false)
  const [detailId, setDetailId] = React.useState<string | null>(null)

  const fileRef = React.useRef<HTMLInputElement>(null)
  const [importFile, setImportFile] = React.useState<File | null>(null)
  const [importBusy, setImportBusy] = React.useState(false)
  const [importPreview, setImportPreview] = React.useState<InfluencerProfileImportResult | null>(null)
  const [importSheet, setImportSheet] = React.useState("")

  const postsByProfile = React.useMemo(() => {
    const m = new Map<string, MarketingInfluencer[]>()
    for (const p of posts) {
      const pid = (p.profileId || "").trim()
      if (!pid) continue
      const list = m.get(pid) || []
      list.push(p)
      m.set(pid, list)
    }
    return m
  }, [posts])

  const categories = React.useMemo(() => {
    const s = new Set<string>()
    for (const p of profiles) for (const c of p.contentCategories) s.add(c)
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [profiles])

  const storeOptions = React.useMemo(() => {
    const s = new Set<string>(stores)
    for (const p of profiles) if (p.preferredStore) s.add(p.preferredStore)
    return [...s]
  }, [stores, profiles])

  const statusCounts = React.useMemo(() => {
    const m = new Map<string, number>()
    for (const p of profiles) m.set(p.pipelineStatus, (m.get(p.pipelineStatus) || 0) + 1)
    return m
  }, [profiles])

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return profiles
      .filter((p) => !statusFilter || p.pipelineStatus === statusFilter)
      .filter((p) => !storeFilter || p.preferredStore === storeFilter)
      .filter((p) => !categoryFilter || p.contentCategories.includes(categoryFilter))
      .filter((p) => !q || profileSearchBlob(p).includes(q))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  }, [profiles, statusFilter, storeFilter, categoryFilter, search])

  const openNew = () => {
    setEditingId(null)
    setForm(emptyForm())
    setFormOpen(true)
  }

  const openEdit = (p: MarketingInfluencerProfile) => {
    setEditingId(p.id)
    setForm(profileToForm(p))
    setFormOpen(true)
    requestAnimationFrame(() => {
      document.getElementById("mkt-inf-profile-form")?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditingId(null)
    setForm(emptyForm())
  }

  const handleSave = async () => {
    if (!form.displayName.trim() && !form.tiktokUrl.trim()) {
      await appAlert(t("marketingAlertEnterName"))
      return
    }
    setSaving(true)
    try {
      const res = await saveMarketingInfluencerProfile({ id: editingId ?? undefined, ...formToPayload(form) })
      if (!res.success) {
        await appAlert(res.message || t("marketingCollabDetailSaveError"))
        return
      }
      await onReload()
      closeForm()
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (p: MarketingInfluencerProfile, status: InfluencerPipelineStatus) => {
    const res = await saveMarketingInfluencerProfile({ ...p, pipelineStatus: status })
    if (!res.success) await appAlert(res.message || t("marketingCollabDetailSaveError"))
    await onReload()
  }

  const handleDelete = async (p: MarketingInfluencerProfile) => {
    if (!(await appConfirm(fill(t("mktInfConfirmDeleteProfile"), { name: p.displayName })))) return
    const res = await deleteMarketingInfluencerProfile({ id: p.id })
    if (!res.success) {
      await appAlert(res.message || "")
      return
    }
    if (editingId === p.id) closeForm()
    await onReload()
  }

  const runImportPreview = async (file: File, sheetName?: string) => {
    setImportBusy(true)
    try {
      const res = await importInfluencerProfilesXlsx(file, { dryRun: true, sheetName, stores })
      if (!res.success) {
        await appAlert(res.message || "")
        setImportPreview(null)
        return
      }
      setImportPreview(res)
      setImportSheet(res.summary?.sheetName || "")
    } finally {
      setImportBusy(false)
    }
  }

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f) return
    setImportFile(f)
    await runImportPreview(f)
  }

  const confirmImport = async () => {
    if (!importFile) return
    setImportBusy(true)
    try {
      const res = await importInfluencerProfilesXlsx(importFile, { dryRun: false, sheetName: importSheet, stores })
      await appAlert(res.message || (res.success ? t("itemsAlertSaved") : ""))
      if (res.success) {
        setImportPreview(null)
        setImportFile(null)
        await onReload()
      }
    } finally {
      setImportBusy(false)
    }
  }

  const textField = (key: keyof ProfileForm, label: string, opts?: { placeholder?: string; type?: string; span2?: boolean }) => (
    <div className={cn(opts?.span2 && "sm:col-span-2")}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        className="mt-1 h-9"
        type={opts?.type || "text"}
        value={form[key] as string}
        placeholder={opts?.placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  )

  const s = importPreview?.summary

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-muted-foreground">{t("mktInfProfilesHint")}</p>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={openNew}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t("mktInfBtnNewProfile")}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={importBusy} onClick={() => fileRef.current?.click()}>
          <FileSpreadsheet className="mr-1.5 h-4 w-4" />
          {importBusy ? t("loading") : t("mktInfBtnImportXlsx")}
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => void onPickFile(e)} />
        <div className="ml-auto flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
          {INFLUENCER_PIPELINE_STATUSES.filter((st) => statusCounts.get(st)).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter((cur) => (cur === st ? "" : st))}
              className={cn("rounded-full", statusFilter === st && "ring-2 ring-primary/50")}
            >
              <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_BADGE[st])}>
                {influencerStatusLabel(t, st)} {statusCounts.get(st)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {importPreview?.success && s ? (
        <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{t("mktInfImportTitle")}</h4>
            <div className="flex flex-wrap items-center gap-2">
              {s.sheetNames.length > 1 ? (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {t("mktInfImportSheet")}
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    value={importSheet}
                    disabled={importBusy}
                    onChange={(e) => {
                      setImportSheet(e.target.value)
                      if (importFile) void runImportPreview(importFile, e.target.value)
                    }}
                  >
                    {s.sheetNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <Button type="button" size="sm" disabled={importBusy || s.toInsert + s.toUpdate === 0} onClick={() => void confirmImport()}>
                <Save className="mr-1.5 h-4 w-4" />
                {t("mktInfImportConfirm")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setImportPreview(null)
                  setImportFile(null)
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-xs">
            {fill(t("mktInfImportSummary"), {
              rows: s.dataRows,
              profiles: s.profiles,
              merged: s.mergedDuplicates,
              insert: s.toInsert,
              update: s.toUpdate,
              unchanged: s.unchanged,
            })}
          </p>
          {(importPreview.warnings || []).length > 0 ? (
            <details className="rounded-md border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2 text-[11px]">
              <summary className="cursor-pointer font-medium text-amber-900 dark:text-amber-200">
                {fill(t("mktInfImportWarnings"), { n: importPreview.warnings!.length })}
              </summary>
              <ul className="mt-2 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-4 text-muted-foreground">
                {importPreview.warnings!.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="max-h-80 overflow-auto rounded-md border bg-background">
            <table className="w-full min-w-[640px] border-collapse text-xs">
              <thead className="sticky top-0 bg-muted/80">
                <tr className="text-left text-[10px] text-muted-foreground">
                  <th className="px-2 py-1.5" />
                  <th className="px-2 py-1.5">{t("mktInfFieldDisplayName")}</th>
                  <th className="px-2 py-1.5">TikTok</th>
                  <th className="px-2 py-1.5">{t("mktInfFieldStatus")}</th>
                  <th className="px-2 py-1.5">{t("mktInfFieldPreferredStore")}</th>
                  <th className="px-2 py-1.5 text-right">{t("mktInfColMinRate")}</th>
                  <th className="px-2 py-1.5">{t("mktInfImportRows")}</th>
                </tr>
              </thead>
              <tbody>
                {(importPreview.preview || []).map((r, i) => (
                  <tr key={i} className="border-t border-border/40">
                    <td className="px-2 py-1">
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-medium",
                          r.action === "insert" && "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/35 dark:text-emerald-200",
                          r.action === "update" && "bg-sky-100 text-sky-900 dark:bg-sky-900/35 dark:text-sky-200",
                          r.action === "unchanged" && "bg-muted text-muted-foreground"
                        )}
                      >
                        {t(`mktInfImportAction_${r.action}`)}
                      </span>
                    </td>
                    <td className="px-2 py-1 font-medium">{r.displayName}</td>
                    <td className="px-2 py-1 text-muted-foreground">
                      {r.tiktokHandle ? `@${r.tiktokHandle}` : "—"}
                      {r.tiktokFollowers != null ? ` · ${formatFollowersShort(r.tiktokFollowers)}` : ""}
                    </td>
                    <td className="px-2 py-1">{influencerStatusLabel(t, r.pipelineStatus)}</td>
                    <td className="px-2 py-1">{r.preferredStore ? formatStoreLabel(r.preferredStore) : "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.rateMinThb != null ? `฿${r.rateMinThb.toLocaleString()}` : "—"}</td>
                    <td className="px-2 py-1 text-muted-foreground">{r.sourceRows.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {formOpen ? (
        <div id="mkt-inf-profile-form" className="space-y-4 rounded-xl border border-primary/15 p-4 shadow-sm ring-1 ring-primary/5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              <Pencil className="h-4 w-4 text-primary" />
              {editingId ? t("mktInfFormTitleEdit") : t("mktInfBtnNewProfile")}
            </h4>
            <Button type="button" size="sm" variant="ghost" onClick={closeForm}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {textField("displayName", `${t("mktInfFieldDisplayName")} *`)}
            {textField("contentCategories", t("mktInfFieldCategories"), { placeholder: t("mktInfFieldCategoriesHint") })}
            <div>
              <Label className="text-xs text-muted-foreground">{t("mktInfFieldStatus")}</Label>
              <select
                className={cn(selectCn, "mt-1")}
                value={form.pipelineStatus}
                onChange={(e) => setForm((f) => ({ ...f, pipelineStatus: e.target.value as InfluencerPipelineStatus }))}
              >
                {INFLUENCER_PIPELINE_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {influencerStatusLabel(t, st)}
                  </option>
                ))}
              </select>
            </div>
            {textField("tiktokUrl", t("mktInfFieldTiktok"), { placeholder: "https://www.tiktok.com/@..." })}
            {textField("instagramUrl", t("mktInfFieldInstagram"), { placeholder: "https://www.instagram.com/..." })}
            {textField("facebookUrl", t("mktInfFieldFacebook"), { placeholder: "https://www.facebook.com/..." })}
            {textField("tiktokFollowers", `TikTok ${t("mktInfFieldFollowers")}`, { placeholder: "138.6k" })}
            {textField("instagramFollowers", `Instagram ${t("mktInfFieldFollowers")}`, { placeholder: "22.3k" })}
            {textField("facebookFollowers", `Facebook ${t("mktInfFieldFollowers")}`, { placeholder: "430k" })}
            {textField("contact", t("mktInfFieldContact"), { placeholder: "line: @..." })}
            {textField("contactName", t("marketingInfluencersFieldContactName"))}
            {textField("contactPhone", t("marketingInfluencersFieldContactPhone"), { type: "tel" })}
            {textField("rateTiktok", t("mktInfFieldRateTiktok"), { placeholder: "28k+VAT" })}
            {textField("rateInstagram", t("mktInfFieldRateInstagram"))}
            {textField("rateFacebook", t("mktInfFieldRateFacebook"))}
            {textField("ratePackage", t("mktInfFieldRatePackage"))}
            {textField("rateIncludes", t("mktInfFieldRateIncludes"), { placeholder: "Short Video on TT/IG/FB" })}
            {textField("extraCost", t("mktInfFieldExtraCost"))}
            <div>
              <Label className="text-xs text-muted-foreground">{t("mktInfFieldPreferredStore")}</Label>
              <select
                className={cn(selectCn, "mt-1")}
                value={form.preferredStore}
                onChange={(e) => setForm((f) => ({ ...f, preferredStore: e.target.value }))}
              >
                <option value="">{t("marketingInfluencersStorePlaceholder")}</option>
                {storeOptions.map((st) => (
                  <option key={st} value={st}>
                    {formatStoreLabel(st)}
                  </option>
                ))}
              </select>
            </div>
            {textField("rateInquiredAt", t("mktInfFieldInquiredAt"), { type: "date" })}
            {textField("rateCardUrl", t("mktInfFieldRateCard"), { placeholder: "https://..." })}
            <div className="sm:col-span-2 lg:col-span-3">
              <Label className="text-xs text-muted-foreground">{t("marketingFieldMemo")}</Label>
              <Textarea
                className="mt-1 min-h-[60px]"
                rows={2}
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={() => void handleSave()} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? t("marketingSavingShort") : t("itemsBtnSave")}
            </Button>
            <Button type="button" variant="outline" onClick={closeForm}>
              {t("posCancel")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/70 bg-muted/10 p-2 sm:p-3">
        <div className="w-36">
          <Label className="text-[10px] text-muted-foreground">{t("mktInfFieldStatus")}</Label>
          <select
            className={cn(selectCn, "h-8 text-xs")}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | InfluencerPipelineStatus)}
          >
            <option value="">{t("mktInfFilterAllStatus")}</option>
            {INFLUENCER_PIPELINE_STATUSES.map((st) => (
              <option key={st} value={st}>
                {influencerStatusLabel(t, st)}
              </option>
            ))}
          </select>
        </div>
        <div className="w-40">
          <Label className="text-[10px] text-muted-foreground">{t("mktInfFieldPreferredStore")}</Label>
          <select className={cn(selectCn, "h-8 text-xs")} value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
            <option value="">{t("mktInfFilterAllStores")}</option>
            {storeOptions.map((st) => (
              <option key={st} value={st}>
                {formatStoreLabel(st)}
              </option>
            ))}
          </select>
        </div>
        <div className="w-36">
          <Label className="text-[10px] text-muted-foreground">{t("mktInfFieldCategories")}</Label>
          <select className={cn(selectCn, "h-8 text-xs")} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">{t("mktInfFilterAllCategories")}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[12rem] flex-1">
          <Label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Search className="h-3 w-3" />
            {t("search")}
          </Label>
          <Input className="h-8 text-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("mktInfSearchPh")} />
        </div>
        <span className="pb-1.5 text-[11px] text-muted-foreground">
          {filtered.length} / {profiles.length}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">{t("mktInfProfilesEmpty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/80">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <th className="min-w-[150px] px-3 py-2.5">{t("mktInfFieldDisplayName")}</th>
                <th className="px-3 py-2.5">TikTok</th>
                <th className="px-3 py-2.5">Instagram</th>
                <th className="px-3 py-2.5">Facebook</th>
                <th className="min-w-[120px] px-3 py-2.5">{t("mktInfFieldContact")}</th>
                <th className="px-3 py-2.5 text-right">{t("mktInfColMinRate")}</th>
                <th className="px-3 py-2.5">{t("mktInfFieldPreferredStore")}</th>
                <th className="whitespace-nowrap px-3 py-2.5">{t("mktInfFieldInquiredAt")}</th>
                <th className="px-3 py-2.5">{t("mktInfFieldStatus")}</th>
                <th className="px-3 py-2.5 text-right">{t("mktInfColUploads")}</th>
                <th className="min-w-[180px] px-3 py-2.5 text-right" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const uploads = postsByProfile.get(p.id) || []
                const open = detailId === p.id
                return (
                  <React.Fragment key={p.id}>
                    <tr
                      className={cn("cursor-pointer border-b border-border/40 hover:bg-muted/20", open && "bg-primary/[0.04]")}
                      onClick={() => setDetailId(open ? null : p.id)}
                    >
                      <td className="px-3 py-2 align-top">
                        <div className="font-semibold leading-snug">{p.displayName}</div>
                        {p.contentCategories.length ? (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">{p.contentCategories.join(", ")}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                        <SocialCell url={p.tiktokUrl} followers={p.tiktokFollowers} handle={p.tiktokHandle} />
                      </td>
                      <td className="px-3 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                        <SocialCell url={p.instagramUrl} followers={p.instagramFollowers} handle={p.instagramHandle} />
                      </td>
                      <td className="px-3 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                        <SocialCell url={p.facebookUrl} followers={p.facebookFollowers} />
                      </td>
                      <td className="px-3 py-2 align-top text-xs">
                        <div className="line-clamp-2">{p.contact || "—"}</div>
                        {p.contactPhone ? <div className="text-[11px] text-muted-foreground">{p.contactPhone}</div> : null}
                      </td>
                      <td className="px-3 py-2 text-right align-top text-xs tabular-nums">
                        {p.rateMinThb != null ? `฿${p.rateMinThb.toLocaleString()}` : "—"}
                      </td>
                      <td className="px-3 py-2 align-top text-xs">{p.preferredStore ? formatStoreLabel(p.preferredStore) : "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 align-top text-xs text-muted-foreground">{p.rateInquiredAt || "—"}</td>
                      <td className="px-3 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                        <select
                          className={cn(
                            "h-7 rounded-full border-0 px-2 text-[10px] font-medium",
                            STATUS_BADGE[p.pipelineStatus]
                          )}
                          value={p.pipelineStatus}
                          onChange={(e) => void changeStatus(p, e.target.value as InfluencerPipelineStatus)}
                        >
                          {INFLUENCER_PIPELINE_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {influencerStatusLabel(t, st)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-right align-top text-xs tabular-nums">{uploads.length || "—"}</td>
                      <td className="px-3 py-2 text-right align-top" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button type="button" size="sm" variant="secondary" className="h-8 text-xs" onClick={() => onCreatePost(p)}>
                            <Send className="mr-1 h-3.5 w-3.5" />
                            {t("mktInfBtnAddUpload")}
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => openEdit(p)}>
                            {t("posEdit")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => void handleDelete(p)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="border-b border-border/40 bg-muted/10">
                        <td colSpan={11} className="space-y-3 px-4 py-3">
                          {(p.rateTiktok || p.rateInstagram || p.rateFacebook || p.ratePackage || p.rateIncludes || p.extraCost || p.note) ? (
                            <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                              {p.rateTiktok ? <div>{t("mktInfFieldRateTiktok")}: {p.rateTiktok}</div> : null}
                              {p.rateInstagram ? <div>{t("mktInfFieldRateInstagram")}: {p.rateInstagram}</div> : null}
                              {p.rateFacebook ? <div>{t("mktInfFieldRateFacebook")}: {p.rateFacebook}</div> : null}
                              {p.ratePackage ? <div>{t("mktInfFieldRatePackage")}: {p.ratePackage}</div> : null}
                              {p.rateIncludes ? <div>{t("mktInfFieldRateIncludes")}: {p.rateIncludes}</div> : null}
                              {p.extraCost ? <div>{t("mktInfFieldExtraCost")}: {p.extraCost}</div> : null}
                              {p.rateCardUrl ? (
                                <div className="truncate">
                                  {t("mktInfFieldRateCard")}:{" "}
                                  {/^https?:\/\//.test(p.rateCardUrl.split(" ").pop() || "") ? (
                                    <a className="text-primary hover:underline" href={p.rateCardUrl.split(" ").pop()} target="_blank" rel="noreferrer">
                                      {p.rateCardUrl}
                                    </a>
                                  ) : (
                                    p.rateCardUrl
                                  )}
                                </div>
                              ) : null}
                              {p.note ? <div className="whitespace-pre-wrap text-muted-foreground sm:col-span-2">{p.note}</div> : null}
                            </div>
                          ) : null}
                          <div>
                            <div className="mb-1 text-xs font-semibold">{t("mktInfDetailUploads")}</div>
                            {uploads.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground">{t("mktInfDetailNoUploads")}</p>
                            ) : (
                              <ul className="space-y-0.5 text-xs">
                                {[...uploads]
                                  .sort((a, b) => (b.publishDate || "").localeCompare(a.publishDate || ""))
                                  .map((u) => (
                                    <li key={u.id} className="flex flex-wrap gap-x-3 text-muted-foreground">
                                      <span className="font-medium text-foreground">{u.publishDate || "—"}</span>
                                      <span>{u.branchReview ? formatStoreLabel(u.branchReview) : "—"}</span>
                                      <span>{u.campaignNo?.trim() || t("mktInfCampaignNone")}</span>
                                      {(u.actualCost ?? 0) > 0 ? <span>฿{(u.actualCost ?? 0).toLocaleString()}</span> : null}
                                    </li>
                                  ))}
                              </ul>
                            )}
                          </div>
                          {uploads.length > 0 ? <ProfileLiftSummary t={t} profileId={p.id} posts={uploads} /> : null}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
