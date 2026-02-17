"use client"

import { formatMinutes } from "@/lib/visit-data"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type HeatmapTableProps = {
  stores: string[]
  purposes: string[]
  matrix: number[][]
}

const PURPOSE_COLORS: Record<string, string> = {
  "정기점검": "#2563eb",
  "정기 점검": "#2563eb",
  "직원교육": "#059669",
  "직원 교육": "#059669",
  "긴급지원": "#dc2626",
  "긴급 지원": "#dc2626",
  "매장미팅": "#d97706",
  "매장 미팅": "#d97706",
  "기타": "#6b7280",
}

function purposeToKey(p: string): string {
  const m: Record<string, string> = {
    "정기점검": "visitPurposeInspect", "정기 점검": "visitPurposeInspect",
    "직원교육": "visitPurposeTraining", "직원 교육": "visitPurposeTraining",
    "긴급지원": "visitPurposeUrgent", "긴급 지원": "visitPurposeUrgent",
    "매장미팅": "visitPurposeMeeting", "매장 미팅": "visitPurposeMeeting",
    "기타": "visitPurposeEtc",
  }
  return m[p] || ""
}

export function HeatmapTable({ stores, purposes, matrix }: HeatmapTableProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const allValues = matrix.flat().filter((v) => v > 0)
  const maxVal = Math.max(...allValues, 1)

  function getCellBg(val: number, purpose: string): string {
    if (val === 0) return "transparent"
    const base = PURPOSE_COLORS[purpose] || "#2563eb"
    const ratio = Math.min(val / maxVal, 1)
    const opacity = 0.1 + ratio * 0.5
    return `${base}${Math.round(opacity * 255).toString(16).padStart(2, "0")}`
  }

  // Column totals
  const colTotals = purposes.map((_, ci) =>
    stores.reduce((sum, _, ri) => sum + matrix[ri][ci], 0)
  )

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
                style={{ backgroundColor: PURPOSE_COLORS[p] || "#2563eb" }}
              />
              {purposeToKey(p) ? t(purposeToKey(p)) : p}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr>
              <th className="p-2.5 text-left font-medium text-muted-foreground border-b border-border w-[120px]">
                {t("visit_heatmap_store")}
              </th>
              {purposes.map((p) => (
                <th
                  key={p}
                  className="p-2.5 text-center font-semibold border-b border-border min-w-[80px]"
                  style={{ color: PURPOSE_COLORS[p] || "hsl(220, 13%, 18%)" }}
                >
                  {purposeToKey(p) ? t(purposeToKey(p)) : p}
                </th>
              ))}
              <th className="p-2.5 text-right font-semibold text-foreground border-b border-border w-[90px]">
                {t("visit_heatmap_total")}
              </th>
            </tr>
          </thead>
          <tbody>
            {stores.map((store, ri) => {
              const rowTotal = matrix[ri].reduce((s, v) => s + v, 0)
              if (rowTotal === 0) return null
              return (
                <tr key={store} className="hover:bg-accent/40 transition-colors">
                  <td className="p-2.5 font-medium text-foreground border-b border-border/50">
                    {store}
                  </td>
                  {purposes.map((purpose, ci) => {
                    const val = matrix[ri][ci]
                    return (
                      <td
                        key={purpose}
                        className="p-2.5 text-center border-b border-border/50"
                        style={{ backgroundColor: getCellBg(val, purpose) }}
                      >
                        {val > 0 ? (
                          <span className="font-medium text-foreground">
                            {formatMinutes(val)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">-</span>
                        )}
                      </td>
                    )
                  })}
                  <td className="p-2.5 text-right font-bold text-foreground border-b border-border/50">
                    {formatMinutes(rowTotal)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-muted/30">
              <td className="p-2.5 font-semibold text-foreground border-t border-border">
                {t("visit_heatmap_total")}
              </td>
              {colTotals.map((total, ci) => (
                <td
                  key={ci}
                  className="p-2.5 text-center font-bold border-t border-border"
                  style={{ color: PURPOSE_COLORS[purposes[ci]] || "hsl(220, 13%, 18%)" }}
                >
                  {formatMinutes(total)}
                </td>
              ))}
              <td className="p-2.5 text-right font-bold text-foreground border-t border-border">
                {formatMinutes(colTotals.reduce((s, v) => s + v, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
