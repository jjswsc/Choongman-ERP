"use client"

import { useCallback, useEffect, useState } from "react"
import { appAlert } from "@/lib/app-message"
import { apiFetch } from "@/lib/api/fetch"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  defaultModuleCatalogRows,
  SAAS_MODULE_LABEL_KEY,
  type SaasModuleCatalogRow,
} from "@/lib/saas-module-pricing"

export default function SaasGlobalPricingPage() {
  const t = useT(useLang().lang)
  const [rows, setRows] = useState<SaasModuleCatalogRow[]>(defaultModuleCatalogRows())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setNotice("")
    try {
      const res = await apiFetch("/api/saasAdminModulePricingCatalog")
      const json = (await res.json()) as { success?: boolean; rows?: SaasModuleCatalogRow[]; message?: string }
      if (!res.ok || json.success !== true || !Array.isArray(json.rows)) {
        setNotice(json.message || t("saasAdminPricing_errLoad"))
        return
      }
      setRows(json.rows)
    } catch (e) {
      setNotice(String(e))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  const updateRow = (moduleKey: SaasModuleCatalogRow["moduleKey"], patch: Partial<SaasModuleCatalogRow>) => {
    setRows((prev) => prev.map((r) => (r.moduleKey === moduleKey ? { ...r, ...patch } : r)))
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await apiFetch("/api/saasAdminModulePricingCatalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      })
      const json = (await res.json()) as { success?: boolean; message?: string; rows?: SaasModuleCatalogRow[] }
      if (!res.ok || json.success !== true) {
        await appAlert(json.message || t("saasAdminPricing_errSave"))
        return
      }
      if (Array.isArray(json.rows)) setRows(json.rows)
      await appAlert(t("saasAdminPricing_saved"))
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("saasAdminPricing_pageTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("saasAdminPricing_pageIntro")}</p>
          {notice ? <p className="mt-2 text-xs text-amber-600">{notice}</p> : null}
        </div>
        <Button type="button" onClick={() => void save()} disabled={loading || saving}>
          {t("saasAdminPricing_save")}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t("saasAdminPricing_catalogTitle")}</CardTitle>
          <CardDescription>{t("saasAdminPricing_catalogDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("saasAdminCust_moduleName")}</TableHead>
                <TableHead>{t("saasAdminCust_monthlyThb")}</TableHead>
                <TableHead>{t("saasAdminCust_yearlyThb")}</TableHead>
                <TableHead>{t("saasAdminPricing_colType")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.moduleKey}>
                  <TableCell className="font-medium">{t(SAAS_MODULE_LABEL_KEY[row.moduleKey])}</TableCell>
                  <TableCell>
                    {row.isCustomQuote ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-28"
                        value={row.monthly}
                        disabled={loading || saving}
                        onChange={(e) => updateRow(row.moduleKey, { monthly: Math.max(0, Number(e.target.value || 0)) })}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {row.isCustomQuote ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        className="h-8 w-28"
                        value={row.yearly}
                        disabled={loading || saving}
                        onChange={(e) => updateRow(row.moduleKey, { yearly: Math.max(0, Number(e.target.value || 0)) })}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {row.isCustomQuote ? (
                      <Badge variant="outline">{t("saasAdminCust_moduleCustomQuote")}</Badge>
                    ) : row.isPerUnit ? (
                      <Badge variant="secondary">{t("saasAdminCust_modulePerDevice")}</Badge>
                    ) : (
                      <Badge variant="outline">{t("saasAdminPricing_typeFlat")}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && !loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t("saasAdmin_noData")}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("saasAdminPricing_tipsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>{t("saasAdminPricing_tip1")}</p>
          <p>{t("saasAdminPricing_tip2")}</p>
          <p>{t("saasAdminPricing_tip3")}</p>
        </CardContent>
      </Card>
    </main>
  )
}
