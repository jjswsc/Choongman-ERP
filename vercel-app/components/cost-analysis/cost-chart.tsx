"use client"

import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import type { RecipeItem } from "@/lib/cost-data"
import { getIngredient, calculateItemCost } from "@/lib/cost-data"

interface CostChartProps {
  foodItems: RecipeItem[]
  packagingItems: RecipeItem[]
  /** 메뉴 레벨 미세 - 품목별 미세 사용 시 0으로 전달 */
  misePercent: number
  /** 매장(홀)이면 CostSummary와 같이 포장 원가를 총액·도넛에서 제외 */
  serviceType?: "Dine-In" | "Delivery"
}

const COLORS = [
  "oklch(0.72 0.19 160)",
  "oklch(0.75 0.15 55)",
  "oklch(0.65 0.2 250)",
  "oklch(0.7 0.18 340)",
  "oklch(0.78 0.12 90)",
  "oklch(0.6 0.15 200)",
  "oklch(0.68 0.17 120)",
  "oklch(0.73 0.14 280)",
]

export function CostChart({ foodItems, packagingItems, misePercent, serviceType = "Dine-In" }: CostChartProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const foodData = foodItems
    .map((item) => {
      const ingredient = getIngredient(item.ingredientCode)
      const name = ingredient?.name ?? t("posCostUnknown")
      return {
        name,
        value: calculateItemCost(item),
        category: "food",
      }
    })
    .filter((d) => d.value > 0)

  const packagingData = packagingItems
    .map((item) => {
      const ingredient = getIngredient(item.ingredientCode)
      const name = ingredient?.name ?? t("posCostUnknown")
      return {
        name,
        value: calculateItemCost(item),
        category: "packaging",
      }
    })
    .filter((d) => d.value > 0)

  const includePackaging = serviceType === "Delivery"
  const allData = [
    ...foodData,
    ...(misePercent > 0 ? [
      {
        name: `Mise (${misePercent}%)`,
        value: foodData.reduce((s, d) => s + d.value, 0) * (misePercent / 100),
        category: "mise",
      },
    ] : []),
    ...(includePackaging ? packagingData : []),
  ]

  const total = allData.reduce((s, d) => s + d.value, 0)

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-[280px] text-sm text-muted-foreground">
        {t("posCostAddIngredientsPrompt")}
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{t("posCostDistribution")}</h3>
      </div>
      <div className="p-5">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-[200px] h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={allData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {allData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, _name: unknown, props: { payload?: { name?: string } }) => {
                    const label = (props?.payload as { name?: string })?.name ?? ""
                    return [label ? `${label}: ${(value as number).toFixed(2)} THB` : `${(value as number).toFixed(2)} THB`, label]
                  }}
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    color: "hsl(var(--popover-foreground))",
                    fontSize: "12px",
                    fontFamily: "monospace",
                  }}
                  itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                  labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("posCostTotal")}</span>
              <span className="font-mono text-lg font-bold text-foreground">
                {total.toFixed(1)}
              </span>
              <span className="text-[10px] text-muted-foreground">THB</span>
            </div>
          </div>

          {/* Legend: 원형표 밑 리스트 - 재료명 | 원가 | 비율 */}
          <div className="grid grid-cols-1 gap-1.5 w-full max-w-md">
            {allData.map((entry, index) => {
              const pct = total > 0 ? (entry.value / total) * 100 : 0
              return (
                <div
                  key={`${entry.name}-${index}`}
                  className="flex items-center gap-2 text-xs group hover:bg-secondary/30 rounded-md px-2 py-1 transition-colors"
                >
                  <div
                    className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="text-foreground flex-1 min-w-0 truncate" title={entry.name}>
                    {entry.name}
                  </span>
                  <span className="font-mono text-muted-foreground tabular-nums shrink-0">
                    {entry.value.toFixed(2)}
                  </span>
                  <span className="font-mono text-muted-foreground tabular-nums w-10 text-right shrink-0">
                    {pct.toFixed(1)}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
