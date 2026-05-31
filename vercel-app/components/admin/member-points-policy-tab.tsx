"use client"

import * as React from "react"
import { appAlert } from "@/lib/app-message"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getMemberTiers, recalculateMemberTier, saveMemberTier } from "@/lib/api-client"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

type TierRow = { code: string; name: string; min_amount: number; point_rate: number }

export function MemberPointsPolicyTab() {
  const { lang } = useLang()
  const t = useT(lang)
  const [rows, setRows] = React.useState<TierRow[]>([])
  const [code, setCode] = React.useState("BRONZE")
  const [name, setName] = React.useState("Bronze")
  const [minAmount, setMinAmount] = React.useState("0")
  const [pointRate, setPointRate] = React.useState("0.01")

  const load = React.useCallback(async () => {
    const tiers = await getMemberTiers()
    setRows(tiers as TierRow[])
  }, [])

  React.useEffect(() => {
    load().catch(() => {})
  }, [load])

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("memberPointsEarnHint")}</p>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("memberTierRuleTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Input placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <Input placeholder={t("name")} value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            placeholder={t("memberTierMinAmount")}
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
          />
          <Input
            placeholder={t("memberTierPointRatePh")}
            value={pointRate}
            onChange={(e) => setPointRate(e.target.value)}
          />
          <Button
            onClick={async () => {
              const res = await saveMemberTier({
                code: code.trim(),
                name: name.trim(),
                minAmount: Number(minAmount || 0),
                pointRate: Number(pointRate || 0),
              })
              if (!res.success) await appAlert(res.message || t("msg_save_fail"))
              await load()
            }}
          >
            {t("commonSave")}
          </Button>
        </CardContent>
        <CardContent className="border-t pt-4">
          <p className="text-xs text-muted-foreground">{t("memberPointsPolicyExample")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("memberTierRecalculateTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={async () => {
              const res = await recalculateMemberTier()
              if (!res.success) await appAlert(res.message || t("memberTierRecalculateFail"))
              else await appAlert(`${t("memberTierRecalculateDone")}: ${res.updated ?? 0}${t("memberCountUnit")}`)
            }}
          >
            {t("memberTierRecalculateAll")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("memberTierListTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-2 text-left">{t("code")}</th>
                  <th className="p-2 text-left">{t("name")}</th>
                  <th className="p-2 text-left">{t("memberTierMinAmount")}</th>
                  <th className="p-2 text-left">{t("memberTierPointRate")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.code}
                    className="cursor-pointer border-t hover:bg-muted/20"
                    onClick={() => {
                      setCode(r.code)
                      setName(r.name)
                      setMinAmount(String(r.min_amount))
                      setPointRate(String(r.point_rate))
                    }}
                  >
                    <td className="p-2">{r.code}</td>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2">{Number(r.min_amount || 0).toLocaleString()}</td>
                    <td className="p-2">{Number(r.point_rate || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
