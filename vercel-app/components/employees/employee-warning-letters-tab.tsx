"use client"

import * as React from "react"
import { ExternalLink } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getEvaluationDistinctStores,
  getWarningLettersFromEvaluations,
  type AdminEmployeeItem,
  type WarningLetterIncidentItem,
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
import { Button } from "@/components/ui/button"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"

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
  if (evalType === "service") return t("eval_list_type_service")
  if (evalType === "manager") return t("eval_list_type_manager")
  if (evalType === "kitchen") return t("eval_list_type_kitchen")
  return t("eval_list_type_kitchen")
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

  const firstDay = bangkokFirstOfMonthMonthsAgo(24)
  const todayStr = bangkokDateYmd()

  const [type, setType] = React.useState("all")
  const [start, setStart] = React.useState(firstDay)
  const [end, setEnd] = React.useState(todayStr)
  const [storeFilter, setStoreFilter] = React.useState("All")
  const [employeeFilter, setEmployeeFilter] = React.useState("All")
  const [evaluatorFilter, setEvaluatorFilter] = React.useState("All")
  const [listMode, setListMode] = React.useState<"warnings" | "all">("warnings")

  const [items, setItems] = React.useState<WarningLetterIncidentItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [truncated, setTruncated] = React.useState(false)
  const [storesFromEvalDb, setStoresFromEvalDb] = React.useState<string[]>([])
  const [employeeOptions, setEmployeeOptions] = React.useState<string[]>([])
  const [evaluatorOptions, setEvaluatorOptions] = React.useState<string[]>([])
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [previewImageError, setPreviewImageError] = React.useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = React.useState(false)

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

  const loadList = React.useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const ev = await getWarningLettersFromEvaluations({
        type,
        start,
        end,
        store: storeFilter !== "All" ? storeFilter : undefined,
        employee: employeeFilter !== "All" && employeeFilter ? employeeFilter : undefined,
        evaluator: evaluatorFilter !== "All" && evaluatorFilter ? evaluatorFilter : undefined,
        warningsOnly: listMode === "warnings",
      })

      setTruncated(Boolean(ev.truncated))

      const evItems = (ev.items || [])
        .filter((x) => (x.source ?? "evaluation") === "evaluation")
        .map((x) => ({ ...x, source: "evaluation" as const }))

      const merged = [...evItems].sort(
        (a, b) =>
          new Date(b.evalDate || "").getTime() - new Date(a.evalDate || "").getTime() ||
          String(b.evaluationId || "").localeCompare(String(a.evaluationId || ""))
      )

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
  }, [type, start, end, storeFilter, employeeFilter, evaluatorFilter, listMode, t])

  const handleOpenEval = (row: WarningLetterIncidentItem) => {
    const { nick, job } = resolveEmployeeForJump(employees, row.store, row.employeeName)
    onOpenEval({
      store: row.store,
      name: row.employeeName,
      nick,
      job,
      evalType: row.evalType === "standalone" ? "kitchen" : row.evalType,
    })
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <h6 className="mb-1 border-b pb-2 text-sm font-bold">{t("warning_registry_title")}</h6>
        <p className="mb-3 text-xs text-muted-foreground">{t("warning_registry_hint")}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold">{t("eval_list_type")}</label>
            <Select value={type} onValueChange={setType}>
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
            <Select value={listMode} onValueChange={(v) => setListMode(v as "warnings" | "all")}>
              <SelectTrigger className="h-8 w-[min(200px,44vw)] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="warnings">{t("warning_filter_warnings_only")}</SelectItem>
                <SelectItem value="all">{t("warning_filter_all_incidents")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" size="sm" className="h-8" onClick={() => void loadList()} disabled={loading}>
            {loading ? t("eval_list_loading") : t("eval_analytics_search")}
          </Button>
        </div>
        {loadError && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {loadError}
          </div>
        )}
        {truncated && !loadError && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{t("warning_registry_truncated")}</p>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#1E293B] text-white">
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("eval_list_th_date")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("warning_col_eval_type")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("emp_label_store")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("eval_list_th_employee")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("warning_col_incident")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("label_date")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("eval_detail")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("eval_warning_letter_check")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("eval_warning_letter")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("eval_list_th_grade")}</th>
              <th className="px-2 py-2.5 text-center font-semibold whitespace-nowrap">{t("warning_col_action")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                  {t("eval_list_loading")}
                </td>
              </tr>
            ) : !hasLoadedOnce ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                  {t("warning_registry_search_prompt")}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                  {t("warning_registry_empty")}
                </td>
              </tr>
            ) : (
              items.map((row, i) => (
                <tr
                  key={`${row.evaluationId}-${row.incidentIndex}-${i}`}
                  className="hover:bg-muted/40"
                >
                  <td className="px-2 py-2 text-center whitespace-nowrap">{row.evalDate}</td>
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
                  <td className="px-2 py-2 text-center align-top">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      onClick={() => handleOpenEval(row)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      {t("warning_open_eval")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
