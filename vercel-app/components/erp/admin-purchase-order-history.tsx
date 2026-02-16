"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getPurchaseOrders, type PurchaseOrderRow } from "@/lib/api-client"
import { Printer, FileSpreadsheet, History, RefreshCw } from "lucide-react"

export function AdminPurchaseOrderHistory() {
  const { lang } = useLang()
  const t = useT(lang)
  const [list, setList] = React.useState<PurchaseOrderRow[]>([])
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(() => {
    setLoading(true)
    getPurchaseOrders()
      .then((rows) => setList(rows || []))
      .catch(() => setList([]))
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const exportPoExcel = (po: PurchaseOrderRow) => {
    const cart = parseCart(po.cart_json)
    const poNo = po.po_no || `PO-${po.id}`
    const locale = { ko: "ko-KR", en: "en-US", th: "th-TH", mm: "my-MM", la: "lo-LA" }[lang] || "en-US"
    const dateStr = po.created_at ? new Date(po.created_at).toLocaleDateString(locale) : new Date().toLocaleDateString(locale)
    const escapeXml = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

    const headers = ["No", t("item"), t("orderItemSpec"), t("orderItemUnitPrice"), t("orderItemQty"), t("orderItemTotal")]
    const dataRows: (string | number)[][] = cart.map((c: { name?: string; price?: number; qty?: number }, i: number) => [
      i + 1,
      c.name || "-",
      "-",
      c.price ?? 0,
      c.qty ?? 0,
      (c.price ?? 0) * (c.qty ?? 0),
    ])
    const pad = (r: (string | number)[], n: number) => {
      const arr = [...r]
      while (arr.length < n) arr.push("")
      return arr.slice(0, n).map((v) => String(v))
    }
    const allRows = [
      pad([t("poTitle"), poNo], 6),
      pad([t("poDate"), dateStr], 6),
      pad([t("poShipTo"), po.location_name || "", po.location_address || ""], 6),
      pad([t("poVendor"), po.vendor_name || ""], 6),
      pad([], 6),
      pad(headers, 6),
      ...dataRows.map((r) => pad(r.map((v) => String(v)), 6)),
      pad([], 6),
      pad([t("subtotal"), "", "", "", "", String(po.subtotal ?? 0)], 6),
      pad([t("vat"), "", "", "", "", String(po.vat ?? 0)], 6),
      pad([t("total"), "", "", "", "", String(po.total ?? 0)], 6),
    ]
    const colCount = 6
    const pxPerChar = 8
    const minW = 50
    const colWidths = Array.from({ length: colCount }, (_, c) => {
      let maxLen = minW / pxPerChar
      for (const row of allRows) {
        const cell = row[c]
        const len = String(cell ?? "").length
        if (len > maxLen) maxLen = len
      }
      return Math.max(minW, Math.min(maxLen * pxPerChar + 16, 400))
    })
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"/><style>td{border:1px solid #ccc;padding:4px 8px;font-size:11px}.head{font-weight:bold;background:#f0f0f0}table{border-collapse:collapse}</style></head>
<body>
<table>
<colgroup>${colWidths.map((w) => `<col width="${w}"/>`).join("")}</colgroup>
${allRows.map((row, ri) => {
      const cells = row.map((c) => escapeXml(c))
      const isHead = ri === 5 || ri >= allRows.length - 3
      return `<tr${isHead ? ' class="head"' : ""}>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`
    }).join("")}
</table>
</body>
</html>`
    const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `PO_${poNo}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  const printPo = (po: PurchaseOrderRow) => {
    const cart = parseCart(po.cart_json)
    const poNo = po.po_no || `PO-${po.id}`
    const locale = { ko: "ko-KR", en: "en-US", th: "th-TH", mm: "my-MM", la: "lo-LA" }[lang] || "en-US"
    const dateStr = po.created_at
      ? new Date(po.created_at).toLocaleDateString(locale)
      : new Date().toLocaleDateString(locale)

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${t("poTitle")} - ${poNo}</title>
<style>
body{font-family:Arial,sans-serif;max-width:800px;margin:24px auto;padding:16px}
h1{font-size:20px;margin-bottom:24px;border-bottom:2px solid #333;padding-bottom:8px}
table{width:100%;border-collapse:collapse;margin:16px 0}
th,td{border:1px solid #ddd;padding:8px;text-align:left}
th{background:#f5f5f5}
.num{text-align:right}
.tot{font-weight:bold}
</style>
</head>
<body>
<h1>${t("poTitle")}</h1>
<p><strong>${t("poNo")}:</strong> ${poNo}</p>
<p><strong>${t("poDate")}:</strong> ${dateStr}</p>
<hr/>
<h3>${t("poShipTo")}</h3>
<p><strong>${po.location_name || "-"}</strong></p>
<p>${po.location_address || "-"}</p>
<hr/>
<h3>${t("poVendor")}</h3>
<p><strong>${po.vendor_name || "-"}</strong></p>
<hr/>
<table>
<thead><tr><th>No</th><th>${t("item")}</th><th>${t("orderItemSpec")}</th><th class="num">${t("orderItemUnitPrice")}</th><th class="num">${t("orderItemQty")}</th><th class="num">${t("orderItemTotal")}</th></tr></thead>
<tbody>
${cart
  .map(
    (c: { name?: string; price?: number; qty?: number }, i: number) =>
      `<tr><td>${i + 1}</td><td>${c.name || "-"}</td><td>-</td><td class="num">${c.price ?? 0}</td><td class="num">${c.qty ?? 0}</td><td class="num">${((c.price ?? 0) * (c.qty ?? 0))}</td></tr>`
  )
  .join("")}
</tbody>
<tfoot>
<tr><td colspan="4" class="num">${t("subtotal")}</td><td class="num"></td><td class="num">${po.subtotal ?? 0}</td></tr>
<tr><td colspan="4" class="num">${t("vat")} (7%)</td><td class="num"></td><td class="num">${po.vat ?? 0}</td></tr>
<tr class="tot"><td colspan="4" class="num">${t("total")}</td><td class="num"></td><td class="num">${po.total ?? 0}</td></tr>
</tfoot>
</table>
<p style="margin-top:24px;font-size:12px;color:#666">${t("poPreparedBy")}: ${po.user_name || "-"}</p>
</body>
</html>
`
    const w = window.open("", "_blank")
    if (w) {
      w.document.write(html)
      w.document.close()
      w.focus()
      setTimeout(() => {
        w.print()
        w.close()
      }, 300)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4 text-primary" />
          {t("poHistoryTitle")}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("loadingItems")}</p>
        ) : list.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("poHistoryEmpty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">{t("poNo")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("poDate")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("poVendor")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("poShipTo")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("total")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("poPreparedBy")}</th>
                  <th className="w-24 px-1 py-2" />
                </tr>
              </thead>
              <tbody>
                {list.map((po) => {
                  const dateStr = po.created_at
                    ? new Date(po.created_at).toLocaleDateString()
                    : "-"
                  return (
                    <tr key={po.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 font-medium">{po.po_no || `#${po.id}`}</td>
                      <td className="px-3 py-2 text-muted-foreground">{dateStr}</td>
                      <td className="px-3 py-2">{po.vendor_name || "-"}</td>
                      <td className="px-3 py-2">{po.location_name || "-"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-primary">
                        {po.total != null ? po.total.toLocaleString() : "-"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{po.user_name || "-"}</td>
                      <td className="px-1 py-2">
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary hover:bg-primary/10"
                            onClick={() => printPo(po)}
                            title={t("purchaseOrderPrint")}
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary hover:bg-primary/10"
                            onClick={() => exportPoExcel(po)}
                            title={t("purchaseOrderExcel")}
                          >
                            <FileSpreadsheet className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function parseCart(json: string | undefined): { name?: string; price?: number; qty?: number }[] {
  if (!json || typeof json !== "string") return []
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
