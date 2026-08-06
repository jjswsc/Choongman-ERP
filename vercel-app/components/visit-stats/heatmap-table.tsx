"use client"

import { formatMinutesWithT } from "@/lib/visit-data"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type HeatmapTableProps = {
  stores: string[]
  purposes: string[]
  matrixMin: number[][]
  matrixCount: number[][]
}

const CELL_CLASS = "p-2.5 text-center border-b border-border/50 text-[12px] font-medium text-foreground tabular-nums"
const EMPTY_CLASS = "text-muted-foreground/40 font-normal"

const PURPOSE_COLORS: Record<string, string> = {
  "정기점검": "#2563eb",
  "정기 점검": "#2563eb",
  "직원교육": "#059669",
  "직원 교육": "#059669",
  "긴급지원": "#dc2626",
  "긴급 지원": "#dc2626",
  "매장미팅": "#d97706",
  "매장 미팅": "#d97706",
  "물건배송": "#8b5cf6",
  "물건 배송": "#8b5cf6",
  "기타": "#6b7280",
}

function purposeToKey(p: string): string {
  if (p.startsWith("기타:") || p.startsWith("기타：")) return "visitPurposeEtc"
  const m: Record<string, string> = {
    "정기점검": "visitPurposeInspect", "정기 점검": "visitPurposeInspect",
    "직원교육": "visitPurposeTraining", "직원 교육": "visitPurposeTraining",
    "긴급지원": "visitPurposeUrgent", "긴급 지원": "visitPurposeUrgent",
    "매장미팅": "visitPurposeMeeting", "매장 미팅": "visitPurposeMeeting",
    "물건배송": "visitPurposeDelivery", "물건 배송": "visitPurposeDelivery",
    "기타": "visitPurposeEtc",
  }
  return m[p] || ""
}

function getPurposeColor(p: string): string {
  if (p.startsWith("기타:") || p.startsWith("기타：")) return PURPOSE_COLORS["기타"]
  return PURPOSE_COLORS[p] || "#2563eb"
}

function purposeLabel(p: string, t: (k: string) => string): string {
  const key = purposeToKey(p)
  if (!key) return p
  if (p.startsWith("기타:") || p.startsWith("기타：")) {
    return `${t(key)}: ${p.replace(/^기타[：:]\s*/, "")}`
  }
  return t(key)
}

function TimeCell({
  min,
  count,
  bg,
  t,
}: {
  min: number
  count: number
  bg: string
  t: (k: string) => string
}) {
  if (count <= 0) {
    return (
      <td className={`${CELL_CLASS} min-w-[72px]`}>
        <span className={EMPTY_CLASS}>-</span>
      </td>
    )
  }
  return (
    <td className={`${CELL_CLASS} min-w-[72px]`} style={{ backgroundColor: bg }}>
      {formatMinutesWithT(min, t)}
    </td>
  )
}

function CountCell({
  count,
  bg,
  t,
}: {
  count: number
  bg: string
  t: (k: string) => string
}) {
  if (count <= 0) {
    return (
      <td className={`${CELL_CLASS} min-w-[52px]`}>
        <span className={EMPTY_CLASS}>-</span>
      </td>
    )
  }
  return (
    <td className={`${CELL_CLASS} min-w-[52px]`} style={{ backgroundColor: bg }}>
      {count}
      {t("visit_count_suffix")}
    </td>
  )
}

export function HeatmapTable({ stores, purposes, matrixMin, matrixCount }: HeatmapTableProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const timeLabel = t("visit_trend_input_time")
  const countLabel = t("visit_trend_visits")
  const allValues = matrixMin.flat().filter((v) => v > 0)
  const maxVal = Math.max(...allValues, 1)

  function getCellBg(val: number, purpose: string): string {
    if (val === 0) return "transparent"
    const base = getPurposeColor(purpose)
    const ratio = Math.min(val / maxVal, 1)
    const opacity = 0.1 + ratio * 0.5
    return `${base}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`
  }

  const colTotalsMin = purposes.map((_, ci) =>
    stores.reduce((sum, _, ri) => sum + matrixMin[ri][ci], 0)
  )
  const colTotalsCount = purposes.map((_, ci) =>
    stores.reduce((sum, _, ri) => sum + matrixCount[ri][ci], 0)
  )
  const grandTotalMin = colTotalsMin.reduce((s, v) => s + v, 0)
  const grandTotalCount = colTotalsCount.reduce((s, v) => s + v, 0)

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-foreground">
          {t("visit_heatmap_title")}
        </h3>
        <div className="flex items-center gap-3 text-[11px]">
          {purposes.map((p) => (
            <span key={p} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: getPurposeColor(p) }}
              />
              {purposeLabel(p, t)}
            </span>
          ))}
        </div>
      </div>
      <AdminTableScroll hint={false}>
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="p-2.5 text-left font-medium text-muted-foreground border-b border-border w-[120px] align-bottom"
              >
                {t("visit_heatmap_store")}
              </th>
              {purposes.map((p) => (
                <th
                  key={p}
                  colSpan={2}
                  className="p-2 pt-2.5 pb-1 text-center font-semibold border-b border-border/50"
                  style={{ color: getPurposeColor(p) }}
                >
                  {purposeLabel(p, t)}
                </th>
              ))}
              <th
                colSpan={2}
                className="p-2 pt-2.5 pb-1 text-center font-semibold text-foreground border-b border-border/50"
              >
                {t("visit_heatmap_total")}
              </th>
            </tr>
            <tr>
              {purposes.flatMap((p) => [
                <th
                  key={`${p}-time`}
                  className="px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground border-b border-border min-w-[72px]"
                >
                  {timeLabel}
                </th>,
                <th
                  key={`${p}-count`}
                  className="px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground border-b border-border min-w-[52px]"
                >
                  {countLabel}
                </th>,
              ])}
              <th className="px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground border-b border-border min-w-[72px]">
                {timeLabel}
              </th>
              <th className="px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground border-b border-border min-w-[52px]">
                {countLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store, ri) => {
              const rowTotalMin = matrixMin[ri].reduce((s, v) => s + v, 0)
              const rowTotalCount = matrixCount[ri].reduce((s, v) => s + v, 0)
              if (rowTotalMin === 0 && rowTotalCount === 0) return null
              return (
                <tr key={store} className="hover:bg-accent/40 transition-colors">
                  <td className="p-2.5 font-medium text-foreground border-b border-border/50">
                    {store}
                  </td>
                  {purposes.flatMap((purpose, ci) => {
                    const min = matrixMin[ri][ci]
                    const count = matrixCount[ri][ci]
                    const bg = getCellBg(min, purpose)
                    return [
                      <TimeCell
                        key={`${purpose}-time`}
                        min={min}
                        count={count}
                        bg={bg}
                        t={t}
                      />,
                      <CountCell
                        key={`${purpose}-count`}
                        count={count}
                        bg={bg}
                        t={t}
                      />,
                    ]
                  })}
                  <TimeCell min={rowTotalMin} count={rowTotalCount} bg="transparent" t={t} />
                  <CountCell count={rowTotalCount} bg="transparent" t={t} />
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30">
              <td className="p-2.5 font-semibold text-foreground border-t border-border">
                {t("visit_heatmap_total")}
              </td>
              {purposes.flatMap((purpose, ci) => [
                <td
                  key={`total-${purpose}-time`}
                  className={`${CELL_CLASS} border-t border-border`}
                  style={{ color: getPurposeColor(purpose) }}
                >
                  {colTotalsMin[ci] > 0 ? formatMinutesWithT(colTotalsMin[ci], t) : <span className={EMPTY_CLASS}>-</span>}
                </td>,
                <td
                  key={`total-${purpose}-count`}
                  className={`${CELL_CLASS} border-t border-border`}
                  style={{ color: getPurposeColor(purpose) }}
                >
                  {colTotalsCount[ci] > 0 ? (
                    <>
                      {colTotalsCount[ci]}
                      {t("visit_count_suffix")}
                    </>
                  ) : (
                    <span className={EMPTY_CLASS}>-</span>
                  )}
                </td>,
              ])}
              <td className={`${CELL_CLASS} border-t border-border`}>
                {grandTotalMin > 0 ? formatMinutesWithT(grandTotalMin, t) : <span className={EMPTY_CLASS}>-</span>}
              </td>
              <td className={`${CELL_CLASS} border-t border-border`}>
                {grandTotalCount > 0 ? (
                  <>
                    {grandTotalCount}
                    {t("visit_count_suffix")}
                  </>
                ) : (
                  <span className={EMPTY_CLASS}>-</span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </AdminTableScroll>
    </div>
  )
}
