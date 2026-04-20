"use client"

import * as React from "react"
import { ExternalLink } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { appAlert, appConfirm } from "@/lib/app-message"
import { translateApiMessage } from "@/lib/translate-api-message"
import { isAccountingRole, isOfficeRole } from "@/lib/permissions"
import {
  getEvaluationDistinctStores,
  getWarningLettersFromEvaluations,
  getWarningLetterRegistry,
  mapWarningRegistryRowToIncident,
  saveWarningLetterRegistry,
  warningLetterRegistryAction,
  deleteWarningLetterRegistry,
  uploadWarningLetterRegistryFile,
  type AdminEmployeeItem,
  type WarningLetterIncidentItem,
  type WarningLetterRegistryRow,
} from "@/lib/api-client"
import { bangkokDateYmd, bangkokFirstOfMonthMonthsAgo } from "@/lib/bangkok-date"
import { normalizeEmployeeNameForGradeMatch } from "@/lib/employee-display-name"
import { storesMatchForGradeLookup } from "@/lib/grade-store-key-variants"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface EmployeeWarningLettersTabProps {
  stores: string[]
  employees: (AdminEmployeeItem & { finalGrade?: string })[]
  /** 직원 평가 탭으로 이동할 때 전달 (상위에서 key 부여) */
  onOpenEval: (target: {
    store: string
    name: string
    nick: string
    job: string
    evalType: WarningLetterIncidentItem["evalType"]
  }) => void
}

function resolveEmployeeForJump(
  list: (AdminEmployeeItem & { finalGrade?: string })[],
  store: string,
  name: string
): { nick: string; job: string } {
  const jStore = String(store || "").trim()
  const jName = String(name || "").trim()
  const jNameNorm = jName ? normalizeEmployeeNameForGradeMatch(jName) : ""
  for (const e of list) {
    const atStore =
      storesMatchForGradeLookup(e.store || "", jStore) ||
      (Array.isArray(e.extraStores) &&
        e.extraStores.some((x) => storesMatchForGradeLookup(String(x || ""), jStore)))
    if (!atStore) continue
    const n = String(e.name || "").trim()
    const nick = String(e.nick || "").trim()
    const job = String(e.job || "").trim()
    if (jName && n === jName) return { nick, job }
    const nNorm = n ? normalizeEmployeeNameForGradeMatch(n) : ""
    if (jNameNorm && nNorm && jNameNorm === nNorm) return { nick, job }
  }
  return { nick: "", job: "" }
}

function formatIncidentTypeLabel(raw: string, t: (k: string) => string): string {
  const s = String(raw || "").trim()
  if (!s) return t("eval_none")
  if (/^eval_incident_\d+$/.test(s) || s.startsWith("eval_")) {
    const tr = t(s)
    if (tr && tr !== s) return tr
  }
  return s
}

function evalTypeLabel(
  evalType: WarningLetterIncidentItem["evalType"],
  t: (k: string) => string
): string {
  if (evalType === "standalone") return t("warning_source_standalone")
  if (evalType === "service") return t("eval_list_type_service")
  if (evalType === "manager") return t("eval_list_type_manager")
  return t("eval_list_type_kitchen")
}

function sourceLabel(row: WarningLetterIncidentItem, t: (k: string) => string): string {
  return row.source === "registry" ? t("warning_source_standalone") : t("warning_source_eval")
}

function approvalLabel(
  row: WarningLetterIncidentItem,
  t: (k: string) => string
): string {
  if (row.source !== "registry" || !row.approvalStatus) return "—"
  const k = row.approvalStatus
  if (k === "draft") return t("warning_approval_draft")
  if (k === "pending") return t("warning_approval_pending")
  if (k === "approved") return t("warning_approval_approved")
  if (k === "rejected") return t("warning_approval_rejected")
  return "—"
}

/** data URL / URL — 이미지·PDF·기타 구분 (미리보기용). 확장자 없는 URL은 이미지로 시도 후 onError 시 새 탭 안내 */
function warningAttachmentKind(url: string): "image" | "pdf" | "other" {
  const u = String(url || "").trim().toLowerCase()
  if (!u) return "other"
  if (u.startsWith("data:image/")) return "image"
  if (u.startsWith("data:application/pdf")) return "pdf"
  if (/\.pdf(\?|#|$)/i.test(u)) return "pdf"
  if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?|#|$)/i.test(u)) return "image"
  if (u.startsWith("http://") || u.startsWith("https://")) return "image"
  return "other"
}

export function EmployeeWarningLettersTab({
  stores,
  employees,
  onOpenEval,
}: EmployeeWarningLettersTabProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()

  const canApprove = React.useMemo(
    () => isOfficeRole(auth?.role || "") || isAccountingRole(auth?.role || ""),
    [auth?.role]
  )

  const firstDay = bangkokFirstOfMonthMonthsAgo(24)
  const todayStr = bangkokDateYmd()

  const [type, setType] = React.useState("all")
  const [start, setStart] = React.useState(firstDay)
  const [end, setEnd] = React.useState(todayStr)
  const [storeFilter, setStoreFilter] = React.useState("All")
  const [employeeFilter, setEmployeeFilter] = React.useState("All")
  const [evaluatorFilter, setEvaluatorFilter] = React.useState("All")
  const [listMode, setListMode] = React.useState<"warnings" | "all">("warnings")
  const [listSource, setListSource] = React.useState<"merged" | "evaluation" | "registry">("merged")
  const [approvalFilter, setApprovalFilter] = React.useState<
    "All" | "draft" | "pending" | "approved" | "rejected"
  >("All")

  const [items, setItems] = React.useState<WarningLetterIncidentItem[]>([])
  const [registryById, setRegistryById] = React.useState<Record<number, WarningLetterRegistryRow>>({})
  const [registrySummary, setRegistrySummary] = React.useState({
    draft: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  })
  const [loading, setLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [truncated, setTruncated] = React.useState(false)
  const [registryTruncated, setRegistryTruncated] = React.useState(false)
  const [storesFromEvalDb, setStoresFromEvalDb] = React.useState<string[]>([])
  const [employeeOptions, setEmployeeOptions] = React.useState<string[]>([])
  const [evaluatorOptions, setEvaluatorOptions] = React.useState<string[]>([])
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [previewImageError, setPreviewImageError] = React.useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = React.useState(false)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingRegistryId, setEditingRegistryId] = React.useState<number | null>(null)
  const [formStore, setFormStore] = React.useState("")
  const [formEmployee, setFormEmployee] = React.useState("")
  const [formIncidentDate, setFormIncidentDate] = React.useState(todayStr)
  const [formIncidentType, setFormIncidentType] = React.useState("")
  const [formDetails, setFormDetails] = React.useState("")
  const [formUrl, setFormUrl] = React.useState("")
  const [formEvaluator, setFormEvaluator] = React.useState("")
  const [formSaving, setFormSaving] = React.useState(false)
  const [uploadBusy, setUploadBusy] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const openPreview = (url: string) => {
    setPreviewImageError(false)
    setPreviewUrl(url)
  }

  React.useEffect(() => {
    let cancelled = false
    void getEvaluationDistinctStores()
      .then((r) => {
        if (!cancelled && Array.isArray(r?.stores)) setStoresFromEvalDb(r.stores)
      })
      .catch(() => {
        if (!cancelled) setStoresFromEvalDb([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const storeOptionsForList = React.useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const s of [...stores, ...storesFromEvalDb]) {
      const x = String(s || "").trim()
      if (!x || seen.has(x)) continue
      seen.add(x)
      out.push(x)
    }
    return out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
  }, [stores, storesFromEvalDb])

  const resetForm = React.useCallback(() => {
    setEditingRegistryId(null)
    setFormStore("")
    setFormEmployee("")
    setFormIncidentDate(todayStr)
    setFormIncidentType("")
    setFormDetails("")
    setFormUrl("")
    setFormEvaluator(String(auth?.user || "").trim())
  }, [auth?.user, todayStr])

  const openNewDialog = () => {
    resetForm()
    setDialogOpen(true)
  }

  const openEditDialog = (id: number) => {
    const row = registryById[id]
    if (!row) return
    setEditingRegistryId(id)
    setFormStore(row.store_name)
    setFormEmployee(row.employee_name)
    setFormIncidentDate(String(row.incident_date || "").slice(0, 10) || todayStr)
    setFormIncidentType(row.incident_type || "")
    setFormDetails(row.details || "")
    setFormUrl(row.warning_letter_url || "")
    setFormEvaluator(row.evaluator_name || String(auth?.user || "").trim())
    setDialogOpen(true)
  }

  const loadList = React.useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const wantEval = listSource !== "registry"
      const wantReg = listSource !== "evaluation"

      const evalP = wantEval
        ? getWarningLettersFromEvaluations({
            type,
            start,
            end,
            store: storeFilter !== "All" ? storeFilter : undefined,
            employee:
              employeeFilter !== "All" && employeeFilter ? employeeFilter : undefined,
            evaluator:
              evaluatorFilter !== "All" && evaluatorFilter ? evaluatorFilter : undefined,
            warningsOnly: listMode === "warnings",
          })
        : Promise.resolve({ items: [] as WarningLetterIncidentItem[], truncated: false, pageCap: undefined })

      const regP = wantReg
        ? getWarningLetterRegistry({
            start,
            end,
            store: storeFilter !== "All" ? storeFilter : undefined,
            employee:
              employeeFilter !== "All" && employeeFilter ? employeeFilter : undefined,
            evaluator:
              evaluatorFilter !== "All" && evaluatorFilter ? evaluatorFilter : undefined,
            approval: listSource === "registry" && approvalFilter !== "All" ? approvalFilter : undefined,
          })
        : Promise.resolve({
            items: [] as WarningLetterRegistryRow[],
            summary: { draft: 0, pending: 0, approved: 0, rejected: 0 },
            truncated: false,
          })

      const [ev, reg] = await Promise.all([evalP, regP])

      setTruncated(Boolean(ev.truncated))
      setRegistryTruncated(Boolean(reg.truncated))
      if (wantReg) {
        setRegistrySummary(reg.summary)
      } else {
        setRegistrySummary({ draft: 0, pending: 0, approved: 0, rejected: 0 })
      }

      const regMap: Record<number, WarningLetterRegistryRow> = {}
      if (wantReg) {
        for (const r of reg.items) {
          if (r.id != null) regMap[r.id] = r
        }
      }
      setRegistryById(regMap)

      const evItems = (ev.items || []).map((x) => ({
        ...x,
        source: (x.source ?? "evaluation") as "evaluation",
      }))
      const regItems = (reg.items || []).map(mapWarningRegistryRowToIncident)

      let merged: WarningLetterIncidentItem[] = []
      if (listSource === "merged") {
        merged = [...evItems, ...regItems].sort(
          (a, b) =>
            new Date(b.evalDate || "").getTime() - new Date(a.evalDate || "").getTime() ||
            String(b.evaluationId || "").localeCompare(String(a.evaluationId || ""))
        )
      } else if (listSource === "evaluation") {
        merged = evItems
      } else {
        merged = regItems
      }

      setItems(merged)

      const empSet = new Set<string>()
      const evalSet = new Set<string>()
      for (const r of merged) {
        if (r.employeeName) empSet.add(r.employeeName)
        if (r.evaluator) evalSet.add(r.evaluator)
      }
      setEmployeeOptions(Array.from(empSet).sort())
      setEvaluatorOptions(Array.from(evalSet).sort())
    } catch (e) {
      setItems([])
      setLoadError(e instanceof Error ? e.message : t("warning_registry_load_fail"))
    } finally {
      setHasLoadedOnce(true)
      setLoading(false)
    }
  }, [
    type,
    start,
    end,
    storeFilter,
    employeeFilter,
    evaluatorFilter,
    listMode,
    listSource,
    approvalFilter,
    t,
  ])

  const handleOpenEval = (row: WarningLetterIncidentItem) => {
    if (row.source === "registry" || row.evalType === "standalone") {
      void appAlert(t("warning_registry_no_eval_jump"))
      return
    }
    const { nick, job } = resolveEmployeeForJump(employees, row.store, row.employeeName)
    onOpenEval({
      store: row.store,
      name: row.employeeName,
      nick,
      job,
      evalType: row.evalType,
    })
  }

  const handleAttachmentFile = async (file: File | null) => {
    if (!file || file.size <= 0) return
    const store = formStore.trim()
    if (!store) {
      await appAlert(t("warning_upload_need_store_first"))
      return
    }
    setUploadBusy(true)
    try {
      const { publicUrl } = await uploadWarningLetterRegistryFile(file, store)
      setFormUrl(publicUrl)
      await appAlert(t("warning_upload_ok"))
    } catch (e) {
      await appAlert((e instanceof Error ? e.message : String(e)) || t("warning_upload_fail"))
    } finally {
      setUploadBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleSaveForm = async () => {
    const store_name = formStore.trim()
    const employee_name = formEmployee.trim()
    if (!store_name || !employee_name) {
      await appAlert(t("warning_form_need_store_employee"))
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formIncidentDate)) {
      await appAlert(t("warning_form_need_date"))
      return
    }
    setFormSaving(true)
    try {
      const res = await saveWarningLetterRegistry({
        id: editingRegistryId ?? undefined,
        store_name,
        employee_name,
        incident_date: formIncidentDate,
        incident_type: formIncidentType.trim(),
        details: formDetails.trim(),
        warning_letter_url: formUrl.trim(),
        evaluator_name: formEvaluator.trim() || String(auth?.user || "").trim(),
      })
      if (res.success) {
        await appAlert(translateApiMessage(res.message, t) || t("warning_registry_saved_ok"))
        setDialogOpen(false)
        await loadList()
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("warning_registry_save_fail"))
      }
    } catch {
      await appAlert(t("warning_registry_save_fail"))
    } finally {
      setFormSaving(false)
    }
  }

  const runRegistryAction = async (id: number, action: "submit" | "approve" | "reject" | "reopen") => {
    if (action === "reject") {
      const ok = await appConfirm(t("warning_reject_confirm"))
      if (!ok) return
      const reason =
        typeof window !== "undefined"
          ? window.prompt(t("warning_reject_prompt"), "") || ""
          : ""
      const res = await warningLetterRegistryAction({ id, action: "reject", rejectedReason: reason })
      await appAlert(translateApiMessage(res.message, t) || (res.success ? "OK" : "fail"))
      if (res.success) void loadList()
      return
    }
    if (action === "reopen") {
      if (!(await appConfirm(t("warning_reopen_confirm")))) return
    }
    const res = await warningLetterRegistryAction({ id, action })
    await appAlert(translateApiMessage(res.message, t) || (res.success ? "OK" : "fail"))
    if (res.success) void loadList()
  }

  const handleDeleteRegistry = async (id: number) => {
    if (!(await appConfirm(t("warning_delete_confirm")))) return
    const res = await deleteWarningLetterRegistry({ id })
    await appAlert(translateApiMessage(res.message, t) || (res.success ? "OK" : "fail"))
    if (res.success) void loadList()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <h6 className="mb-1 border-b pb-2 text-sm font-bold">{t("warning_registry_title")}</h6>
        <p className="mb-3 text-xs text-muted-foreground">{t("warning_registry_hint_b")}</p>
        {listSource !== "evaluation" ? (
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-md border border-border bg-muted/40 px-2 py-1">
            {t("warning_summary_draft")}: {registrySummary.draft}
          </span>
          <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1">
            {t("warning_summary_pending")}: {registrySummary.pending}
          </span>
          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1">
            {t("warning_summary_approved")}: {registrySummary.approved}
          </span>
          <span className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1">
            {t("warning_summary_rejected")}: {registrySummary.rejected}
          </span>
        </div>
        ) : null}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold">{t("warning_list_source")}</label>
            <Select value={listSource} onValueChange={(v) => setListSource(v as typeof listSource)}>
              <SelectTrigger className="h-8 w-[min(200px,44vw)] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="merged">{t("warning_list_source_merged")}</SelectItem>
                <SelectItem value="evaluation">{t("warning_list_source_eval")}</SelectItem>
                <SelectItem value="registry">{t("warning_list_source_registry")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">{t("eval_list_type")}</label>
            <Select value={type} onValueChange={setType} disabled={listSource === "registry"}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("eval_list_type_all")}</SelectItem>
                <SelectItem value="kitchen">{t("eval_list_type_kitchen")}</SelectItem>
                <SelectItem value="service">{t("eval_list_type_service")}</SelectItem>
                <SelectItem value="manager">{t("eval_list_type_manager")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">{t("eval_list_start")}</label>
            <Input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-8 w-[130px] text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">{t("eval_list_end")}</label>
            <Input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="h-8 w-[130px] text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">{t("emp_label_store")}</label>
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t("all")}</SelectItem>
                {storeOptionsForList.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">{t("label_employee")}</label>
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger className="h-8 w-[min(180px,40vw)] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t("all")}</SelectItem>
                {employeeOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">{t("eval_list_evaluator")}</label>
            <Select value={evaluatorFilter} onValueChange={setEvaluatorFilter}>
              <SelectTrigger className="h-8 w-[min(160px,36vw)] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t("all")}</SelectItem>
                {evaluatorOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">{t("warning_filter_list_mode")}</label>
            <Select
              value={listMode}
              onValueChange={(v) => setListMode(v as "warnings" | "all")}
              disabled={listSource === "registry"}
            >
              <SelectTrigger className="h-8 w-[min(200px,44vw)] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="warnings">{t("warning_filter_warnings_only")}</SelectItem>
                <SelectItem value="all">{t("warning_filter_all_incidents")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {listSource === "registry" ? (
            <div>
              <label className="mb-1 block text-xs font-semibold">{t("warning_col_approval")}</label>
              <Select
                value={approvalFilter}
                onValueChange={(v) => setApprovalFilter(v as typeof approvalFilter)}
              >
                <SelectTrigger className="h-8 w-[min(140px,36vw)] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">{t("all")}</SelectItem>
                  <SelectItem value="draft">{t("warning_approval_draft")}</SelectItem>
                  <SelectItem value="pending">{t("warning_approval_pending")}</SelectItem>
                  <SelectItem value="approved">{t("warning_approval_approved")}</SelectItem>
                  <SelectItem value="rejected">{t("warning_approval_rejected")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <Button type="button" size="sm" className="h-8" onClick={() => void loadList()} disabled={loading}>
            {loading ? t("eval_list_loading") : t("eval_analytics_search")}
          </Button>
          {listSource !== "evaluation" ? (
            <Button type="button" size="sm" variant="secondary" className="h-8" onClick={openNewDialog}>
              {t("warning_btn_add_registry")}
            </Button>
          ) : null}
        </div>
        {loadError && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {loadError}
          </div>
        )}
        {(truncated || registryTruncated) && !loadError && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{t("warning_registry_truncated")}</p>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#1E293B] text-white">
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("eval_list_th_date")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("warning_col_source")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("warning_col_eval_type")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("emp_label_store")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("eval_list_th_employee")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("warning_col_incident")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("label_date")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("eval_detail")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("eval_warning_letter_check")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("eval_warning_letter")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("eval_list_th_grade")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("warning_col_approval")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("warning_col_action")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-muted-foreground">
                  {t("eval_list_loading")}
                </td>
              </tr>
            ) : !hasLoadedOnce ? (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-muted-foreground">
                  {t("warning_registry_search_prompt")}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-3 py-8 text-center text-muted-foreground">
                  {t("warning_registry_empty")}
                </td>
              </tr>
            ) : (
              items.map((row, i) => (
                <tr
                  key={
                    row.source === "registry" && row.registryId != null
                      ? `reg-${row.registryId}`
                      : `${row.evaluationId}-${row.incidentIndex}-${i}`
                  }
                  className="hover:bg-muted/40"
                >
                  <td className="px-2 py-2 text-center whitespace-nowrap">{row.evalDate}</td>
                  <td className="px-2 py-2 text-center whitespace-nowrap">{sourceLabel(row, t)}</td>
                  <td className="px-2 py-2 text-center whitespace-nowrap">{evalTypeLabel(row.evalType, t)}</td>
                  <td className="px-2 py-2 text-center">{row.store}</td>
                  <td className="px-2 py-2 text-center">{row.employeeName}</td>
                  <td className="px-2 py-2 text-center max-w-[140px] break-words">
                    {formatIncidentTypeLabel(row.incidentType, t)}
                  </td>
                  <td className="px-2 py-2 text-center whitespace-nowrap">{row.incidentDate || "—"}</td>
                  <td className="px-2 py-2 text-left max-w-[min(280px,32vw)] break-words">{row.details || "—"}</td>
                  <td className="px-2 py-2 text-center">{row.warningLetterChecked ? t("eval_warning_letter_issued") : "—"}</td>
                  <td className="px-2 py-2 text-center">
                    {row.warningLetterUrl ? (
                      <button
                        type="button"
                        className="text-primary underline"
                        onClick={() => openPreview(row.warningLetterUrl)}
                      >
                        {t("eval_warning_letter_view")}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">{row.finalGrade || "—"}</td>
                  <td className="px-2 py-2 text-center whitespace-nowrap">{approvalLabel(row, t)}</td>
                  <td className="px-2 py-2 text-center align-top">
                    <div className="flex flex-col items-center gap-1">
                      {row.source !== "registry" ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                          onClick={() => handleOpenEval(row)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          {t("warning_open_eval")}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {row.source === "registry" && row.registryId != null ? (
                        <div className="flex flex-wrap justify-center gap-1">
                          {row.approvalStatus === "draft" || row.approvalStatus === "pending" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[10px]"
                              onClick={() => openEditDialog(row.registryId!)}
                            >
                              {t("warning_btn_edit")}
                            </Button>
                          ) : null}
                          {row.approvalStatus === "draft" ? (
                            <>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => void runRegistryAction(row.registryId!, "submit")}
                              >
                                {t("warning_btn_submit_approval")}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[10px] text-destructive"
                                onClick={() => void handleDeleteRegistry(row.registryId!)}
                              >
                                {t("warning_btn_delete_draft")}
                              </Button>
                            </>
                          ) : null}
                          {row.approvalStatus === "pending" && canApprove ? (
                            <>
                              <Button
                                type="button"
                                variant="default"
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => void runRegistryAction(row.registryId!, "approve")}
                              >
                                {t("warning_btn_approve")}
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                className="h-7 px-2 text-[10px]"
                                onClick={() => void runRegistryAction(row.registryId!, "reject")}
                              >
                                {t("warning_btn_reject")}
                              </Button>
                            </>
                          ) : null}
                          {row.approvalStatus === "rejected" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[10px]"
                              onClick={() => void runRegistryAction(row.registryId!, "reopen")}
                            >
                              {t("warning_btn_reopen")}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingRegistryId ? t("warning_dialog_title_edit") : t("warning_dialog_title_new")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-semibold">{t("emp_label_store")}</label>
              <Select value={formStore || "__none__"} onValueChange={(v) => setFormStore(v === "__none__" ? "" : v)}>
                <SelectTrigger className="mt-1 h-9">
                  <SelectValue placeholder={t("emp_label_store")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("att_select_store")}</SelectItem>
                  {storeOptionsForList.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold">{t("label_employee")}</label>
              <Input className="mt-1 h-9" value={formEmployee} onChange={(e) => setFormEmployee(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold">{t("warning_field_incident_date")}</label>
              <Input
                type="date"
                className="mt-1 h-9"
                value={formIncidentDate}
                onChange={(e) => setFormIncidentDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold">{t("warning_col_incident")}</label>
              <Input className="mt-1 h-9" value={formIncidentType} onChange={(e) => setFormIncidentType(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold">{t("eval_detail")}</label>
              <Textarea className="mt-1 min-h-[80px]" value={formDetails} onChange={(e) => setFormDetails(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold">{t("warning_field_warn_url")}</label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Input
                  className="h-9 min-w-0 flex-1"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://..."
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => void handleAttachmentFile(e.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-9 shrink-0"
                  disabled={uploadBusy || formSaving}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadBusy ? t("warning_uploading") : t("warning_upload_file")}
                </Button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{t("warning_upload_hint")}</p>
            </div>
            <div>
              <label className="text-xs font-semibold">{t("eval_list_evaluator")}</label>
              <Input className="mt-1 h-9" value={formEvaluator} onChange={(e) => setFormEvaluator(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="button" disabled={formSaving} onClick={() => void handleSaveForm()}>
              {formSaving ? t("loading") : t("warning_btn_save_registry")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div
            className="relative max-w-[90vw] max-h-[85vh] overflow-auto rounded-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {warningAttachmentKind(previewUrl) === "pdf" ? (
              <iframe
                title={t("eval_warning_letter")}
                src={previewUrl}
                className="h-[min(80vh,720px)] w-[min(90vw,960px)] rounded-lg bg-white"
              />
            ) : warningAttachmentKind(previewUrl) === "image" && !previewImageError ? (
              <ImageViewerWithRotate
                src={previewUrl}
                alt={t("eval_warning_letter")}
                imgClassName="max-w-full max-h-[80vh] rounded-lg object-contain"
                rotateLeftLabel={t("imageRotateLeft") || "↺"}
                rotateRightLabel={t("imageRotateRight") || "↻"}
                referrerPolicy="no-referrer"
                onError={() => setPreviewImageError(true)}
              />
            ) : (
              <div className="max-w-md rounded-lg border border-border bg-card p-4 text-center text-sm">
                <p className="mb-3 text-muted-foreground">{t("warning_attachment_preview_fallback")}</p>
              </div>
            )}
            <div className="mt-3 flex justify-center">
              <Button type="button" variant="outline" size="sm" asChild>
                <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                  {t("warning_attachment_open_new_tab")}
                </a>
              </Button>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="absolute -top-2 -right-2 rounded-full bg-black/50 text-white hover:bg-black/70"
              onClick={() => setPreviewUrl(null)}
            >
              ✕
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
