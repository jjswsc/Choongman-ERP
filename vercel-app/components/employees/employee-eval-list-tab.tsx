"use client"

import * as React from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getEvaluationHistory } from "@/lib/api-client"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export interface EmployeeEvalListTabProps {
  stores: string[]
}

interface EvalHistoryRow {
  id: string
  date: string
  store: string
  employeeName: string
  evaluator: string
  finalGrade: string
  totalScore: string
  memo: string
  jsonData?: string
}

export function EmployeeEvalListTab({ stores }: EmployeeEvalListTabProps) {
  const { lang } = useLang()
  const t = useT(lang)

  const today = new Date()
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10)
  const todayStr = today.toISOString().slice(0, 10)

  const [type, setType] = React.useState("all")
  const [start, setStart] = React.useState(firstDay)
  const [end, setEnd] = React.useState(todayStr)
  const [storeFilter, setStoreFilter] = React.useState("All")
  const [employeeFilter, setEmployeeFilter] = React.useState("All")
  const [evaluatorFilter, setEvaluatorFilter] = React.useState("All")
  const [list, setList] = React.useState<EvalHistoryRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [detailRow, setDetailRow] = React.useState<EvalHistoryRow | null>(null)
  const [employeeOptions, setEmployeeOptions] = React.useState<string[]>([])
  const [evaluatorOptions, setEvaluatorOptions] = React.useState<string[]>([])

  const loadHistory = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await getEvaluationHistory({
        type,
        start,
        end,
        store: storeFilter !== "All" ? storeFilter : undefined,
        employee:
          employeeFilter !== "All" && employeeFilter
            ? employeeFilter
            : undefined,
        evaluator:
          evaluatorFilter !== "All" && evaluatorFilter
            ? evaluatorFilter
            : undefined,
      })
      setList(Array.isArray(data) ? data : [])

      if (Array.isArray(data) && data.length > 0) {
        const empSet = new Set<string>()
        const evalSet = new Set<string>()
        for (const r of data) {
          if (r.employeeName) empSet.add(r.employeeName)
          if (r.evaluator) evalSet.add(r.evaluator)
        }
        setEmployeeOptions(Array.from(empSet).sort())
        setEvaluatorOptions(Array.from(evalSet).sort())
      } else {
        setEmployeeOptions([])
        setEvaluatorOptions([])
      }
    } catch {
      setList([])
      setEmployeeOptions([])
      setEvaluatorOptions([])
    } finally {
      setLoading(false)
    }
  }, [type, start, end, storeFilter, employeeFilter, evaluatorFilter])

  const openDetail = (row: EvalHistoryRow) => {
    setDetailRow(row)
    setDetailOpen(true)
  }

  const detailBody = React.useMemo(() => {
    if (!detailRow?.jsonData) return null
    try {
      const data =
        typeof detailRow.jsonData === "string"
          ? JSON.parse(detailRow.jsonData)
          : detailRow.jsonData
      if (!data?.sections) return null

      const sectionKeys = ["menu", "cost", "hygiene", "attitude"]
      const rows: { main: string; name: string; score: string; notes: string }[] =
        []
      for (const key of sectionKeys) {
        const arr = data.sections[key]
        if (!arr?.length) continue
        for (const item of arr) {
          rows.push({
            main: String(item.main || ""),
            name: String(item.name || item.sub || ""),
            score: String(item.score || ""),
            notes: String(item.notes || ""),
          })
        }
      }
      return { totalScore: data.totalScore, rows }
    } catch {
      return null
    }
  }, [detailRow?.jsonData])

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <h6 className="mb-3 border-b pb-2 text-sm font-bold">
          {t("eval_list_title")}
        </h6>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold">
              {t("eval_list_type")}
            </label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("eval_list_type_all")}</SelectItem>
                <SelectItem value="kitchen">
                  {t("eval_list_type_kitchen")}
                </SelectItem>
                <SelectItem value="service">
                  {t("eval_list_type_service")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              {t("eval_list_start")}
            </label>
            <Input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-8 w-[130px] text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              {t("eval_list_end")}
            </label>
            <Input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="h-8 w-[130px] text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              {t("label_store")}
            </label>
            <Select
              value={storeFilter}
              onValueChange={setStoreFilter}
            >
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t("all")}</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              {t("label_employee")}
            </label>
            <Select
              value={employeeFilter}
              onValueChange={setEmployeeFilter}
            >
              <SelectTrigger className="h-8 w-[120px] text-xs">
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
            <label className="mb-1 block text-xs font-semibold">
              {t("eval_list_evaluator")}
            </label>
            <Select
              value={evaluatorFilter}
              onValueChange={setEvaluatorFilter}
            >
              <SelectTrigger className="h-8 w-[120px] text-xs">
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
          <Button
            type="button"
            size="sm"
            onClick={loadHistory}
            disabled={loading}
            className="h-8"
          >
            {t("btn_query_go")}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <div className="max-h-[480px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="sticky top-0 z-10 border-b bg-[#1E293B] text-white">
                <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">
                  {t("eval_list_th_date")}
                </th>
                <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">
                  {t("label_store")}
                </th>
                <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">
                  {t("eval_list_th_employee")}
                </th>
                <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">
                  {t("label_evaluator")}
                </th>
                <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">
                  {t("eval_list_th_score")}
                </th>
                <th className="px-3 py-2.5 text-center font-semibold whitespace-nowrap">
                  {t("eval_list_th_grade")}
                </th>
                <th className="px-3 py-2.5 text-center font-semibold">
                  {t("eval_list_th_memo")}
                </th>
                <th className="w-[80px] px-3 py-2.5 text-center font-semibold">
                  {t("eval_list_btn_view")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center">
                    ⏳ {t("eval_list_loading")}
                  </td>
                </tr>
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    {t("eval_list_no_data")}
                  </td>
                </tr>
              ) : (
                list.map((r) => {
                  const memoShort =
                    (r.memo || "").length > 30
                      ? (r.memo || "").slice(0, 30) + "…"
                      : r.memo || "-"
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-primary/5 transition-colors"
                    >
                      <td className="px-3 py-2.5 text-center text-card-foreground">
                        {r.date}
                      </td>
                      <td className="px-3 py-2.5 text-center font-medium text-card-foreground">
                        {r.store}
                      </td>
                      <td className="px-3 py-2.5 text-center text-card-foreground">
                        {r.employeeName}
                      </td>
                      <td className="px-3 py-2.5 text-center text-card-foreground">
                        {r.evaluator}
                      </td>
                      <td className="px-3 py-2.5 text-center text-card-foreground">
                        {r.totalScore || "-"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold bg-primary/20 text-primary">
                          {r.finalGrade || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-left text-muted-foreground max-w-[200px] truncate">
                        {memoShort}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => openDetail(r)}
                          className="rounded border border-primary bg-transparent px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                        >
                          {t("eval_list_btn_view")}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {!loading && list.length > 0 && (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            {list.length}
            {t("eval_list_count")}
          </p>
        )}
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {detailRow
                ? `${detailRow.store} / ${detailRow.employeeName} (${detailRow.date})`
                : ""}
            </DialogTitle>
          </DialogHeader>
          {detailRow && (
            <>
              <div className="text-muted-foreground text-xs mb-2">
                {t("label_evaluator")}: <strong>{detailRow.evaluator || "-"}</strong> |
                {t("eval_list_th_grade")}:{" "}
                <span className="rounded bg-primary/20 px-1 font-semibold text-primary">
                  {detailRow.finalGrade || "-"}
                </span>{" "}
                | {t("eval_list_th_score")}: {detailRow.totalScore || "-"}
              </div>
              <div className="mb-3 rounded bg-muted/50 p-2 text-xs whitespace-pre-wrap">
                {detailRow.memo || (lang === "ko" ? "(없음)" : "(none)")}
              </div>
              <div className="flex-1 overflow-auto">
                {detailBody ? (
                  <>
                    <p className="mb-2 text-xs font-bold">
                      총점: {detailBody.totalScore ?? "-"}
                    </p>
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-2 py-1.5 text-left">대분류</th>
                          <th className="px-2 py-1.5 text-left">항목</th>
                          <th className="px-2 py-1.5 text-center">점수</th>
                          <th className="px-2 py-1.5 text-left">비고</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailBody.rows.map((row, i) => (
                          <tr key={i} className="border-b">
                            <td className="px-2 py-1.5">{row.main}</td>
                            <td className="px-2 py-1.5">{row.name}</td>
                            <td className="px-2 py-1.5 text-center">
                              {row.score}
                            </td>
                            <td className="px-2 py-1.5 text-muted-foreground">
                              {row.notes}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {lang === "ko"
                      ? "저장된 상세 데이터가 없습니다."
                      : "No detailed data."}
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
