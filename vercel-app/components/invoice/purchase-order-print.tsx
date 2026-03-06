"use client"

import {
  Hash,
  Building2,
  FileText,
  Calendar,
  MapPin,
  Package,
  Truck,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

export interface PoPrintItem {
  name: string
  code?: string
  price: number
  qty: number
  store?: string
}

export interface PoPrintData {
  poNo: string
  createdAt: string
  vendorName: string
  vendorAddress?: string
  vendorTaxId?: string
  vendorPhone?: string
  locationName: string
  locationAddress: string
  cart: PoPrintItem[]
  subtotal: number
  vat: number
  total: number
  userName: string
  status?: string
  withholdingTaxAmount?: number
}

export interface PoPrintCompany {
  companyName: string
  address: string
  taxId: string
  phone: string
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

function groupCartByStore(cart: PoPrintItem[]): Map<string, PoPrintItem[]> {
  const byStore = new Map<string, PoPrintItem[]>()
  for (const c of cart) {
    const store = (c.store && String(c.store).trim()) || "-"
    const arr = byStore.get(store) || []
    arr.push(c)
    byStore.set(store, arr)
  }
  return byStore
}

export function PurchaseOrderPrint({
  data,
  company,
  labels,
}: {
  data: PoPrintData
  company: PoPrintCompany
  labels?: {
    poTitle?: string
    poNo?: string
    poDate?: string
    from?: string
    supplier?: string
    shipTo?: string
    no?: string
    item?: string
    spec?: string
    unitPrice?: string
    qty?: string
    total?: string
    subtotal?: string
    vat?: string
    grandTotal?: string
    preparedBy?: string
    store?: string
  }
}) {
  const t = (key: keyof NonNullable<typeof labels>) => labels?.[key] ?? key
  const hasStore = data.cart.some((c) => c.store && String(c.store).trim())
  const byStore = hasStore ? groupCartByStore(data.cart) : null

  return (
    <div className="invoice-container max-w-4xl mx-auto w-full print:max-w-full print:mx-0 bg-white shadow-lg print:shadow-none print:bg-white rounded-lg overflow-hidden border border-slate-200 print:border-0">
      <div className="invoice-header bg-[#1e4d8c] text-white px-8 py-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {t("poTitle") || "PURCHASE ORDER"}
            </h1>
            <Badge variant="secondary" className="mt-2 bg-white/20 text-white hover:bg-white/30">
              Original
            </Badge>
          </div>
          <div className="text-right text-sm space-y-1">
            <div className="flex items-center justify-end gap-2">
              <Hash className="h-4 w-4 opacity-70" />
              <span className="opacity-70">{t("poNo") || "PO No"}:</span>
              <span className="font-semibold">{data.poNo}</span>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Calendar className="h-4 w-4 opacity-70" />
              <span className="opacity-70">{t("poDate") || "Date"}:</span>
              <span className="font-semibold">{data.createdAt}</span>
            </div>
            {data.status && (
              <div className="flex items-center justify-end gap-2">
                <span className="opacity-70">Status:</span>
                <span className="font-semibold">{data.status}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="invoice-section invoice-from-billto px-8 py-6 grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-8">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[#1e4d8c] font-semibold">
            <Building2 className="h-5 w-5" />
            <span>{t("from") || "FROM"}</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2 print:border-slate-300">
            <h3 className="font-bold text-lg">{company.companyName}</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{company.address}</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0" />
                <span>Tax ID: {company.taxId}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Phone:</span>
                <span>{company.phone}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[#1e4d8c] font-semibold">
            <Building2 className="h-5 w-5" />
            <span>{t("supplier") || "SUPPLIER"}</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2 print:border-slate-300">
            <h3 className="font-bold text-lg">{data.vendorName}</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{data.vendorAddress || "-"}</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0" />
                <span>Tax ID: {data.vendorTaxId || "-"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span>Phone:</span>
                <span>{data.vendorPhone || "-"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="invoice-section px-8 pb-4">
        <div className="flex items-center gap-2 text-[#1e4d8c] font-semibold mb-2">
          <Truck className="h-5 w-5" />
          <span>{t("shipTo") || "SHIP TO"}</span>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm print:bg-white print:border-slate-300">
          <p className="font-semibold">{data.locationName}</p>
          <p className="text-muted-foreground mt-1">{data.locationAddress}</p>
        </div>
      </div>

      <div className="invoice-section px-8 pb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Package className="h-4 w-4 text-[#1e4d8c]" />
          <span>{t("item") || "Total Items"}:</span>
          <span className="font-medium">{data.cart.length}</span>
        </div>
      </div>

      <div className="invoice-section px-8 pb-6">
        <div className="border rounded-lg overflow-hidden">
          <table className="invoice-table w-full text-sm">
            <thead>
              <tr className="bg-[#1e4d8c] text-white">
                {hasStore && (
                  <th className="py-3 px-4 text-left font-semibold w-24">
                    {t("store") || "Store"}
                  </th>
                )}
                <th className="py-3 px-4 text-center font-semibold w-12">#</th>
                <th className="py-3 px-4 text-left font-semibold w-20">Code</th>
                <th className="py-3 px-4 text-left font-semibold">
                  {t("item") || "Description"}
                </th>
                <th className="py-3 px-4 text-right font-semibold w-24">
                  {t("unitPrice") || "Unit Price"}
                </th>
                <th className="py-3 px-4 text-center font-semibold w-16">
                  {t("qty") || "Qty"}
                </th>
                <th className="py-3 px-4 text-right font-semibold w-28">
                  {t("total") || "Amount"}
                </th>
              </tr>
            </thead>
            <tbody>
              {byStore
                ? Array.from(byStore.entries()).flatMap(([storeName, items]) => [
                    <tr
                      key={`store-${storeName}`}
                      className="bg-slate-100 font-semibold"
                    >
                      <td
                        colSpan={hasStore ? 7 : 6}
                        className="py-2 px-4"
                      >
                        {t("store") || "Store"}: {storeName}
                      </td>
                    </tr>,
                    ...items.map((c, i) => (
                      <tr
                        key={`${storeName}-${i}`}
                        className={
                          (items.length + i) % 2 === 0
                            ? "bg-background"
                            : "bg-muted/30"
                        }
                      >
                        {hasStore && <td className="py-3 px-4"></td>}
                        <td className="py-3 px-4 text-center text-muted-foreground">
                          {i + 1}
                        </td>
                        <td className="py-3 px-4 text-left font-mono text-xs text-muted-foreground">
                          {c.code || "-"}
                        </td>
                        <td className="py-3 px-4 text-left">{c.name}</td>
                        <td className="py-3 px-4 text-right">
                          {formatCurrency(c.price)}
                        </td>
                        <td className="py-3 px-4 text-center font-medium">
                          {c.qty}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-[#1e4d8c]">
                          {formatCurrency(c.price * c.qty)}
                        </td>
                      </tr>
                    )),
                  ])
                : data.cart.map((item, index) => (
                    <tr
                      key={index}
                      className={
                        index % 2 === 0 ? "bg-background" : "bg-muted/30"
                      }
                    >
                      <td className="py-3 px-4 text-center text-muted-foreground">
                        {index + 1}
                      </td>
                      <td className="py-3 px-4 text-left font-mono text-xs text-muted-foreground">
                        {item.code || "-"}
                      </td>
                      <td className="py-3 px-4 text-left">{item.name}</td>
                      <td className="py-3 px-4 text-right">
                        {formatCurrency(item.price)}
                      </td>
                      <td className="py-3 px-4 text-center font-medium">
                        {item.qty}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-[#1e4d8c]">
                        {formatCurrency(item.price * item.qty)}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="invoice-section px-8 pb-6">
        <div className="flex justify-end">
          <div className="w-80 space-y-2">
            <div className="flex justify-between text-sm py-2">
              <span className="text-muted-foreground">
                {t("subtotal") || "Subtotal"}:
              </span>
              <span className="font-medium">
                {formatCurrency(data.subtotal)} THB
              </span>
            </div>
            <div className="flex justify-between text-sm py-2">
              <span className="text-muted-foreground">
                {t("vat") || "VAT"} (7%):
              </span>
              <span className="font-medium">
                {formatCurrency(data.vat)} THB
              </span>
            </div>
            {data.withholdingTaxAmount != null &&
              data.withholdingTaxAmount > 0 && (
                <div className="flex justify-between text-sm py-2">
                  <span className="text-muted-foreground">
                    Withholding Tax:
                  </span>
                  <span className="font-medium text-amber-600">
                    -{formatCurrency(data.withholdingTaxAmount)} THB
                  </span>
                </div>
              )}
            <div className="flex justify-between py-3 bg-[#1e4d8c] text-white -mx-4 px-4 rounded-lg mt-2">
              <span className="font-bold text-lg">
                {t("grandTotal") || "Grand Total"}:
              </span>
              <span className="font-bold text-lg">
                {formatCurrency(
                  (data.total ?? 0) - (data.withholdingTaxAmount ?? 0)
                )}{" "}
                THB
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="invoice-section px-8 py-6 border-t">
        <div className="flex justify-between items-end">
          <div>
            <span className="text-sm text-muted-foreground">
              {t("preparedBy") || "Prepared by"}:
            </span>
            <span className="ml-2 font-medium">{data.userName}</span>
          </div>
          {data.status === "Approved" && (
            <div className="flex items-center gap-2">
              <div className="w-24 h-24 border-2 border-dashed border-[#1e4d8c]/30 rounded-full flex items-center justify-center bg-[#1e4d8c]/5">
                <div className="text-center">
                  <div className="text-[#1e4d8c] font-bold text-sm">S&J</div>
                  <div className="text-[#1e4d8c] text-xs">GLOBAL</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
