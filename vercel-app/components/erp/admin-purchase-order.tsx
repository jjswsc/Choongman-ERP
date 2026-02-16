"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getPurchaseLocations,
  getVendorsForPurchase,
  getItemsByVendor,
  getHqStockByLocation,
  savePurchaseOrder,
  type PurchaseLocation,
  type VendorForPurchase,
  type ItemByVendor,
} from "@/lib/api-client"
import { Minus, Plus, ShoppingCart, Trash2, Package, Printer, FileSpreadsheet } from "lucide-react"

interface CartItem {
  code: string
  name: string
  price: number
  qty: number
}

export function AdminPurchaseOrder() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [locations, setLocations] = React.useState<PurchaseLocation[]>([])
  const [locationSelect, setLocationSelect] = React.useState<PurchaseLocation | null>(null)
  const [vendors, setVendors] = React.useState<VendorForPurchase[]>([])
  const [vendorSelect, setVendorSelect] = React.useState<VendorForPurchase | null>(null)
  const [items, setItems] = React.useState<ItemByVendor[]>([])
  const [stock, setStock] = React.useState<Record<string, number>>({})
  const [loading, setLoading] = React.useState(false)
  const [quantity, setQuantity] = React.useState(1)
  const [selectedItem, setSelectedItem] = React.useState<ItemByVendor | null>(null)
  const [cart, setCart] = React.useState<CartItem[]>([])
  const [submitting, setSubmitting] = React.useState(false)

  const categories = React.useMemo(() => {
    const cats = new Map<string, ItemByVendor[]>()
    for (const item of items) {
      const cat = item.category || t("all")
      if (!cats.has(cat)) cats.set(cat, [])
      cats.get(cat)!.push(item)
    }
    return Array.from(cats.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [items, t])

  const { subtotal, vat, total } = React.useMemo(() => {
    let sub = 0
    for (const c of cart) sub += c.price * c.qty
    const v = Math.round(sub * 0.07)
    return { subtotal: sub, vat: v, total: sub + v }
  }, [cart])

  React.useEffect(() => {
    Promise.all([getPurchaseLocations(), getVendorsForPurchase()]).then(([loc, ven]) => {
      setLocations(loc || [])
      setVendors(ven || [])
      if ((loc || []).length > 0 && !locationSelect) setLocationSelect(loc[0])
    })
  }, [])

  React.useEffect(() => {
    if (!vendorSelect) {
      setItems([])
      setStock({})
      return
    }
    setLoading(true)
    Promise.all([
      getItemsByVendor(vendorSelect.code, vendorSelect.name),
      locationSelect
        ? getHqStockByLocation(locationSelect.location_code)
        : Promise.resolve({}),
    ])
      .then(([itms, st]) => {
        setItems(itms || [])
        setStock(st || {})
        setCart([])
        setSelectedItem(null)
      })
      .catch(() => {
        setItems([])
        setStock({})
      })
      .finally(() => setLoading(false))
  }, [vendorSelect, locationSelect?.location_code])

  const addToCart = () => {
    if (!selectedItem) return
    setCart((prev) => {
      const existing = prev.find((x) => x.code === selectedItem.code)
      if (existing) {
        return prev.map((x) =>
          x.code === selectedItem.code ? { ...x, qty: x.qty + quantity } : x
        )
      }
      return [
        ...prev,
        {
          code: selectedItem.code,
          name: selectedItem.name,
          price: selectedItem.cost > 0 ? selectedItem.cost : selectedItem.price,
          qty: quantity,
        },
      ]
    })
    setSelectedItem(null)
    setQuantity(1)
  }

  const removeFromCart = (code: string) => {
    setCart((prev) => prev.filter((x) => x.code !== code))
  }

  const handleSave = async () => {
    if (!locationSelect || !vendorSelect || !auth?.user || cart.length === 0) return
    setSubmitting(true)
    try {
      const res = await savePurchaseOrder({
        vendorCode: vendorSelect.code,
        vendorName: vendorSelect.name,
        locationName: locationSelect.name,
        locationAddress: locationSelect.address,
        locationCode: locationSelect.location_code,
        cart: cart.map((c) => ({ code: c.code, name: c.name, price: c.price, qty: c.qty })),
        userName: auth.user,
      })
      if (res.success) {
        alert(t("purchaseOrderSuccess") + (res.poNo ? ` (${res.poNo})` : ""))
        setCart([])
      } else {
        alert(t("purchaseOrderFail") + (res.message ? ": " + res.message : ""))
      }
    } catch (e) {
      alert(t("purchaseOrderFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSubmitting(false)
    }
  }

  const getPoHtml = (poNo: string) => {
    const loc = locationSelect
    const ven = vendorSelect
    if (!loc || !ven) return ""
    const locale = { ko: "ko-KR", en: "en-US", th: "th-TH", my: "my-MM", lo: "lo-LA" }[lang] || "en-US"
    const dateStr = new Date().toLocaleDateString(locale)
    return `
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
.info{p{margin:4px 0}
</style>
</head>
<body>
<h1>${t("poTitle")}</h1>
<p><strong>${t("poNo")}:</strong> ${poNo}</p>
<p><strong>${t("poDate")}:</strong> ${dateStr}</p>
<hr/>
<h3>${t("poShipTo")}</h3>
<p><strong>${loc.name}</strong></p>
<p>${loc.address}</p>
<hr/>
<h3>${t("poVendor")}</h3>
<p><strong>${ven.name}</strong></p>
<p>${ven.address || "-"}</p>
<hr/>
<table>
<thead><tr><th>No</th><th>${t("item")}</th><th>${t("orderItemSpec")}</th><th class="num">${t("orderItemUnitPrice")}</th><th class="num">${t("orderItemQty")}</th><th class="num">${t("orderItemTotal")}</th></tr></thead>
<tbody>
${cart
  .map(
    (c, i) =>
      `<tr><td>${i + 1}</td><td>${c.name}</td><td>-</td><td class="num">${c.price}</td><td class="num">${c.qty}</td><td class="num">${c.price * c.qty}</td></tr>`
  )
  .join("")}
</tbody>
<tfoot>
<tr><td colspan="4" class="num">${t("subtotal")}</td><td class="num"></td><td class="num">${subtotal}</td></tr>
<tr><td colspan="4" class="num">${t("vat")} (7%)</td><td class="num"></td><td class="num">${vat}</td></tr>
<tr class="tot"><td colspan="4" class="num">${t("total")}</td><td class="num"></td><td class="num">${total}</td></tr>
</tfoot>
</table>
<p style="margin-top:24px;font-size:12px;color:#666">${t("poPreparedBy")}: ${auth?.user || "-"}</p>
</body>
</html>
`
  }

  const handlePrint = () => {
    const poNo = "PO-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + String(Date.now()).slice(-4)
    const html = getPoHtml(poNo)
    if (!html) return
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

  const handleExcel = () => {
    const poNo = "PO-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + String(Date.now()).slice(-4)
    const locale = { ko: "ko-KR", en: "en-US", th: "th-TH", my: "my-MM", lo: "lo-LA" }[lang] || "en-US"
    const escapeXml = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    const pad = (r: (string | number)[], n: number) => {
      const arr = [...r.map((v) => String(v))]
      while (arr.length < n) arr.push("")
      return arr.slice(0, n)
    }
    const headers = ["No", t("item"), t("orderItemSpec"), t("orderItemUnitPrice"), t("orderItemQty"), t("orderItemTotal")]
    const dataRows = cart.map((c, i) => [i + 1, c.name, "-", c.price, c.qty, c.price * c.qty])
    const allRows = [
      pad([t("poTitle"), poNo], 6),
      pad([t("poDate"), new Date().toLocaleDateString(locale)], 6),
      pad([t("poShipTo"), locationSelect?.name || "", locationSelect?.address || ""], 6),
      pad([t("poVendor"), vendorSelect?.name || "", vendorSelect?.address || ""], 6),
      pad([], 6),
      pad(headers, 6),
      ...dataRows.map((r) => pad(r.map((v) => String(v)), 6)),
      pad([], 6),
      pad([t("subtotal"), "", "", "", "", String(subtotal)], 6),
      pad([t("vat"), "", "", "", "", String(vat)], 6),
      pad([t("total"), "", "", "", "", String(total)], 6),
    ]
    const pxPerChar = 8
    const minW = 50
    const colWidths = Array.from({ length: 6 }, (_, c) => {
      let maxLen = minW / pxPerChar
      for (const row of allRows) {
        const len = String(row[c] ?? "").length
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
      const isHead = ri === 5 || ri >= allRows.length - 3
      return `<tr${isHead ? ' class="head"' : ""}>${row.map((c) => `<td>${escapeXml(c)}</td>`).join("")}</tr>`
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

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t("purchaseOrderLocation")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={locationSelect?.location_code ?? ""}
              onValueChange={(v) => {
                const loc = locations.find((l) => l.location_code === v)
                setLocationSelect(loc || null)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("purchaseOrderSelectLocation")} />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.location_code} value={loc.location_code}>
                    {loc.name} — {loc.address}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t("purchaseOrderVendor")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={vendorSelect?.code ?? ""}
              onValueChange={(v) => {
                const ven = vendors.find((x) => x.code === v)
                setVendorSelect(ven || null)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("purchaseOrderSelectVendor")} />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.code} value={v.code}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">{t("ordNew")}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("purchaseOrderSelectVendor")} • {t("orderStockHq")} 표시
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {!vendorSelect ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("purchaseOrderSelectVendor")}
            </div>
          ) : loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">{t("loadingItems")}</div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("purchaseOrderNoItems")}
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {categories.map(([catName, catItems]) => (
                <AccordionItem
                  key={catName}
                  value={catName}
                  className="border-b border-border/60 last:border-0"
                >
                  <AccordionTrigger className="px-4 py-3.5 text-sm font-semibold hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      {catName}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-3">
                    <div className="flex flex-col gap-1.5">
                      {catItems.map((item) => {
                        const qty = stock[item.code] ?? 0
                        const price = item.cost > 0 ? item.cost : item.price
                        return (
                          <div
                            key={item.code}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedItem(item)}
                            onKeyDown={(e) => e.key === "Enter" && setSelectedItem(item)}
                            className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                              selectedItem?.code === item.code
                                ? "bg-primary/10 font-medium text-primary"
                                : "text-foreground hover:bg-muted"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold">{item.name}</span>
                                <span className="text-xs text-muted-foreground">({item.spec || "-"})</span>
                                <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                                  {t("orderStockHq")}:{qty}
                                </span>
                              </div>
                            </div>
                            <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                              {price}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {vendorSelect && items.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-border bg-card">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-l-xl text-primary"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-10 text-center text-sm font-semibold text-foreground">{quantity}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-r-xl text-primary"
              onClick={() => setQuantity((q) => q + 1)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <Button className="h-10 flex-1 font-semibold" onClick={addToCart} disabled={!selectedItem}>
            <ShoppingCart className="mr-2 h-4 w-4" />
            {t("addCart")}
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-semibold">{t("ordCartItems")}</CardTitle>
          <Badge variant="secondary" className="text-xs">
            {cart.length}
            {t("countUnit")}
          </Badge>
        </CardHeader>
        <CardContent>
          {cart.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("noCartItems")}</p>
          ) : (
            <div className="space-y-2">
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">{t("item")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("price")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("qty")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("sub")}</th>
                      <th className="w-9 px-1 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((c) => (
                      <tr key={c.code} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 font-medium">{c.name}</td>
                        <td className="px-3 py-2 text-right">{c.price}</td>
                        <td className="px-3 py-2 text-right">{c.qty}</td>
                        <td className="px-3 py-2 text-right font-semibold text-primary">
                          {c.price * c.qty}
                        </td>
                        <td className="px-1 py-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => removeFromCart(c.code)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>{t("subtotal")}</span>
                  <span>{subtotal}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t("vat")}</span>
                  <span>{vat}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold text-foreground">
                  <span>{t("total")}</span>
                  <span>{total}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          className="flex-1"
          onClick={handleSave}
          disabled={cart.length === 0 || submitting}
        >
          {submitting ? t("loading") : t("purchaseOrderSave")}
        </Button>
        <Button variant="outline" onClick={handlePrint} disabled={cart.length === 0}>
          <Printer className="mr-2 h-4 w-4" />
          {t("purchaseOrderPrint")}
        </Button>
        <Button variant="outline" onClick={handleExcel} disabled={cart.length === 0}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          {t("purchaseOrderExcel")}
        </Button>
      </div>
    </div>
  )
}
