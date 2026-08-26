"use client"

import {
  Hash,
  Building2,
  FileText,
  Calendar,
  MapPin,
  Package,
  Truck,
  CheckCircle,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export interface PoPrintItem {
  name: string
  code?: string
  price: number
  qty: number
  store?: string
  /** taxable | exempt 등 — 면세 줄 표시용 */
  taxType?: string
}

export interface PoPrintData {
  /** 발주 DB id — 인쇄 화면에서 승인 API 호출용 */
  poId?: number
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
  /** 원천징수(예: 3%) — 공급가 기준 저장값과 동일 */
  withholdingTaxAmount?: number
  withholdingTaxRate?: number | null
  userName: string
  status?: string
  /** 회계 PO: 청구 대상 매장 — 매장 발행 시 타 매장, 본사 발행 시 청구받는 가맹 매장 */
  relatedStore?: string
  /** 회계 PO: 발행 매장 (없으면 본사) */
  issuerStore?: string
  /** 인쇄 FROM — 매장 발행 시 발행 매장 법인 */
  issuerCompany?: PoPrintCompany
  /** 회계 PO: 매장별 거래처 표시명 */
  storeVendorName?: string
  /** 외부/타사 PO 양식 참고 문구 */
  poFormatLabel?: string
  /** 회계·청구 PO: 인쇄에서 공급자 블록을 청구처로 표시하고 매장명을 강조 */
  accountingBillToStyle?: boolean
  /** 회계 청구 PO: 수금·Tax Invoice 발행 확인(updatePurchaseOrderInvoice) */
  invoiceReceived?: boolean
}

export interface PoPrintCompany {
  companyName: string
  address: string
  taxId: string
  phone: string
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/** DB·캐시에서 Approved / approved 등 변형 허용 */
export function isPoApprovedStatus(status?: string): boolean {
  const s = String(status ?? "").trim().toLowerCase()
  return s === "approved"
}

/** 회계 청구 PO: 승인 + 수금(인보이스) 확인 시 인쇄 제목을 Tax Invoice/Receipt 로 (물류 미수금과 동일) */
export function isPoAccountingTaxInvoiceMode(
  accountingBillToStyle?: boolean,
  status?: string,
  invoiceReceived?: boolean
): boolean {
  return Boolean(accountingBillToStyle && isPoApprovedStatus(status) && invoiceReceived)
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
  stampImageUrl,
  onApprove,
  approveBusy,
  approveLabel,
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
    /** VAT 행 왼쪽 라벨(끝 콜론 제외) — None VAT 시 다국어 문구 */
    poPrintVatLineLeft?: string
    /** 세금 포함 공급대가 합계(인보이스 총액) */
    invoiceTotal?: string
    preparedBy?: string
    store?: string
    receivedBy?: string
    signatureDate?: string
    authorizedSignatureStamp?: string
    poMetaStore?: string
    poMetaStoreVendor?: string
    poFormatBadgeExternal?: string
    /** 회계 PO 인쇄: 법인명 보조 라벨 */
    poPrintLegalEntity?: string
    /** 회계 청구: Draft / Approved / Tax Invoice/Receipt 뱃지 (외부 양식 없을 때) */
    poHeaderBadge?: string
    poWht3LineLabel?: string
    poNetAfterWht?: string
  }
  stampImageUrl?: string
  onApprove?: () => void
  approveBusy?: boolean
  approveLabel?: string
}) {
  const t = (key: keyof NonNullable<typeof labels>) => labels?.[key] ?? key
  const approved = isPoApprovedStatus(data.status)
  const hasStore = data.cart.some((c) => c.store && String(c.store).trim())
  const byStore = hasStore ? groupCartByStore(data.cart) : null
  const billToFranchiseLayout =
    Boolean(data.accountingBillToStyle) &&
    Boolean(String(data.relatedStore ?? "").trim()) &&
    Boolean(String(data.vendorName ?? "").trim())
  const fromCompany =
    billToFranchiseLayout && data.issuerCompany?.companyName
      ? data.issuerCompany
      : company

  const externalFormat = Boolean(data.poFormatLabel && String(data.poFormatLabel).trim())
  const headerBadgeText = externalFormat
    ? labels?.poFormatBadgeExternal ?? "External format"
    : labels?.poHeaderBadge != null && String(labels.poHeaderBadge).trim() !== ""
      ? String(labels.poHeaderBadge)
      : "Original"

  return (
    <div className="invoice-container max-w-4xl mx-auto w-full print:max-w-full print:mx-0 bg-white shadow-lg print:shadow-none print:bg-white rounded-lg overflow-hidden border border-slate-200 print:border-0">
      <div className="invoice-header bg-[#1e4d8c] text-white px-8 py-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight">
              {t("poTitle") || "PURCHASE ORDER"}
            </h1>
            {data.poFormatLabel ? (
              <p className="mt-1 max-w-xl text-sm font-medium leading-snug text-white/95">{data.poFormatLabel}</p>
            ) : null}
            <Badge variant="secondary" className="mt-2 bg-white/20 text-white hover:bg-white/30">
              {headerBadgeText}
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
            <h3 className="font-bold text-lg">{fromCompany.companyName}</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{fromCompany.address}</span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 shrink-0" />
                <span>Tax ID: {fromCompany.taxId}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Phone:</span>
                <span>{fromCompany.phone}</span>
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
            {billToFranchiseLayout ? (
              <>
                <h3 className="font-bold text-lg">{data.relatedStore}</h3>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    <span className="font-medium text-slate-700">
                      {t("poPrintLegalEntity") || "Legal entity"}:
                    </span>{" "}
                    {data.vendorName}
                  </p>
                  {data.storeVendorName &&
                  String(data.storeVendorName).trim() &&
                  data.storeVendorName !== data.vendorName ? (
                    <p className="text-xs text-slate-600">
                      <span className="font-medium text-slate-800">
                        {t("poMetaStoreVendor") || "Store vendor"}:
                      </span>{" "}
                      {data.storeVendorName}
                    </p>
                  ) : null}
                  <div className="flex items-start gap-2 pt-1">
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
              </>
            ) : (
              <>
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
                  {(data.relatedStore || data.storeVendorName) && (
                    <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-600">
                      {data.relatedStore ? (
                        <p>
                          <span className="font-medium text-slate-800">{t("poMetaStore") || "Store"}:</span>{" "}
                          {data.relatedStore}
                        </p>
                      ) : null}
                      {data.storeVendorName ? (
                        <p className="mt-0.5">
                          <span className="font-medium text-slate-800">
                            {t("poMetaStoreVendor") || "Store vendor"}:
                          </span>{" "}
                          {data.storeVendorName}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              </>
            )}
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
                {t("subtotal") || "Subtotal:"}
              </span>
              <span className="font-medium">
                {formatCurrency(data.subtotal)} THB
              </span>
            </div>
            <div className="flex justify-between text-sm py-2">
              <span className="text-muted-foreground">
                {labels?.poPrintVatLineLeft ?? `${t("vat") || "VAT"} (7%)`}
                :
              </span>
              <span className="font-medium">
                {formatCurrency(data.vat)} THB
              </span>
            </div>
            <div className="flex justify-between text-sm py-2 border-t border-slate-200">
              <span className="text-muted-foreground font-medium">
                {t("invoiceTotal") || "Total (incl. tax)"}:
              </span>
              <span className="font-semibold text-[#1e4d8c]">
                {formatCurrency(data.total ?? 0)} THB
              </span>
            </div>
            {Number(data.withholdingTaxAmount ?? 0) > 0 ? (
              <>
                <div className="flex justify-between text-sm py-2 text-rose-800 dark:text-rose-300">
                  <span>
                    {(data.withholdingTaxRate != null && Number(data.withholdingTaxRate) > 0
                      ? `${t("poWht3LineLabel") || "Withholding tax"} (${Number(data.withholdingTaxRate)}%)`
                      : t("poWht3LineLabel") || "Withholding tax")}
                    :
                  </span>
                  <span className="font-medium">
                    −{formatCurrency(Number(data.withholdingTaxAmount))} THB
                  </span>
                </div>
                <div className="flex justify-between text-sm py-2 border-t border-slate-200">
                  <span className="text-muted-foreground">{t("poNetAfterWht") || "Net after withholding"}:</span>
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(
                      Math.max(0, Math.round(((data.total ?? 0) - Number(data.withholdingTaxAmount)) * 100) / 100)
                    )}{" "}
                    THB
                  </span>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="invoice-section px-8 py-6 border-t">
        <div className="mb-4">
          <span className="text-sm text-muted-foreground">
            {t("preparedBy") || "Prepared by"}:
          </span>
          <span className="ml-2 font-medium">{data.userName}</span>
        </div>
        {(approved || onApprove) && (
          <div
            className={`invoice-signature-grid grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-8 items-stretch min-h-[160px]${approved ? "" : " no-print"}`}
          >
            <div className="flex flex-col justify-between min-h-[160px] py-1">
              <h4 className="font-semibold">{data.vendorName}</h4>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-end gap-2">
                    <span className="text-sm text-muted-foreground shrink-0">
                      {t("receivedBy") || "Received by"}:
                    </span>
                    <div className="flex-1 border-b border-dashed border-muted-foreground/50 min-w-[120px]" />
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-sm text-muted-foreground shrink-0">
                      {t("signatureDate") || "Date"}:
                    </span>
                    <div className="flex-1 border-b border-dashed border-muted-foreground/50 min-w-[120px]" />
                  </div>
                </div>
                {!approved && onApprove ? (
                  <Button
                    type="button"
                    size="sm"
                    className="gap-2 bg-success hover:bg-success/90 text-success-foreground"
                    onClick={onApprove}
                    disabled={approveBusy}
                  >
                    <CheckCircle className="h-4 w-4" />
                    {approveLabel || "PO Approve"}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="flex items-center justify-end gap-4 min-h-[160px]">
              <div className="flex flex-col justify-between items-end text-right min-h-[160px] py-0">
                <h4 className="font-semibold">{fromCompany.companyName}</h4>
                <span className="text-xs text-muted-foreground">
                  {t("authorizedSignatureStamp") ||
                    "Authorized Signature & Company Stamp"}
                </span>
              </div>
              <div className="invoice-stamp shrink-0 flex-shrink-0">
                {approved && stampImageUrl ? (
                  <img
                    src={stampImageUrl}
                    alt=""
                    className="w-36 h-36 md:w-40 md:h-40 print:w-40 print:h-40 object-contain opacity-90"
                    style={{ mixBlendMode: "multiply" }}
                  />
                ) : (
                  <div className="w-36 h-36 md:w-40 md:h-40 print:w-40 print:h-40 border-2 border-dashed border-[#1e4d8c]/30 rounded-full flex items-center justify-center bg-[#1e4d8c]/5">
                    <div className="text-center">
                      <div className="text-[#1e4d8c] font-bold text-sm">S&J</div>
                      <div className="text-[#1e4d8c] text-xs">GLOBAL</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
