"use client"

import * as React from "react"
import {
  Hash,
  Building2,
  Phone,
  Mail,
  Globe,
  MapPin,
  FileText,
  Calendar,
  CreditCard,
  Truck,
  Package,
  QrCode,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface InvoiceItem {
  id: number
  itemCode?: string
  description: string
  /** 품목 행 바로 아래(무게·kg당가 등) — cart `line_remarks` */
  lineRemarks?: string
  quantity: number
  unit?: string
  unitPrice: number
  discount: number
  amount: number
}

export interface InvoiceData {
  documentType: string
  documentNo: string
  dueDate: string
  referenceNo: string
  issueDate: string
  shipTo?: string
  poNumber?: string
  paymentTerms?: string
  shippingMethod?: string
  seller: {
    name: string
    address: string
    taxId: string
    phone: string
    email?: string
    website?: string
  }
  client: {
    name: string
    address: string
    taxId: string
    phone: string
    contactPerson?: string
    email?: string
  }
  items: InvoiceItem[]
  subtotal: number
  vatRate: number
  vatAmount: number
  grandTotal: number
  bankInfo: {
    bankName: string
    accountNo: string
    accountName: string
    swiftCode?: string
  }
  remarks?: string
  termsAndConditions?: string[]
  /** 회사 도장 이미지 URL (인쇄 시 사용) */
  stampImageUrl?: string
  /** 인쇄 편집값 영구 저장용 source 식별자 */
  sourceRefType?: string
  sourceRefId?: number
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function Invoice({
  data,
  onPrint,
  onDownloadPdf,
  printOnly = false,
}: {
  data: InvoiceData
  onPrint?: () => void
  onDownloadPdf?: () => void
  printOnly?: boolean
}) {
  const handlePrint = () => {
    if (onPrint) {
      onPrint()
    } else {
      window.print()
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 print:bg-white print:p-0 print:min-h-0">
        {!printOnly && (onPrint || onDownloadPdf) && (
        <div className="no-print max-w-4xl mx-auto mb-4 flex gap-2">
          <Button onClick={handlePrint} className="gap-2">
            인쇄
          </Button>
          {onDownloadPdf && (
            <Button variant="outline" onClick={onDownloadPdf} className="gap-2">
              PDF 다운로드
            </Button>
          )}
        </div>
      )}

      <div className="invoice-container max-w-4xl mx-auto w-full print:max-w-full print:mx-0 bg-white shadow-lg print:shadow-none print:bg-white rounded-lg overflow-hidden border border-slate-200 print:border-0">
        <div className="invoice-header bg-[#1e4d8c] text-white px-8 py-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{data.documentType}</h1>
              <Badge variant="secondary" className="mt-2 bg-white/20 text-white hover:bg-white/30">
                Original (Set Document)
              </Badge>
            </div>
            <div className="text-right text-sm space-y-1">
              <div className="flex items-center justify-end gap-2">
                <Hash className="h-4 w-4 opacity-70" />
                <span className="opacity-70">Document No:</span>
                <span className="font-semibold">{data.documentNo}</span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Calendar className="h-4 w-4 opacity-70" />
                <span className="opacity-70">Issue Date:</span>
                <span className="font-semibold">{data.issueDate}</span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Calendar className="h-4 w-4 opacity-70" />
                <span className="opacity-70">Due Date:</span>
                <span className="font-semibold">{data.dueDate}</span>
              </div>
              <div className="flex items-center justify-end gap-2">
                <FileText className="h-4 w-4 opacity-70" />
                <span className="opacity-70">Reference:</span>
                <span className="font-semibold">{data.referenceNo || "-"}</span>
              </div>
              {data.poNumber && (
                <div className="flex items-center justify-end gap-2">
                  <FileText className="h-4 w-4 opacity-70" />
                  <span className="opacity-70">PO Number:</span>
                  <span className="font-semibold">{data.poNumber}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="invoice-section invoice-from-billto px-8 py-6 grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[#1e4d8c] font-semibold">
              <Building2 className="h-5 w-5" />
              <span>FROM</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2 print:border-slate-300">
              <h3 className="font-bold text-lg">{data.seller.name}</h3>
              <div className="text-sm text-muted-foreground space-y-1">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{data.seller.address}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0" />
                  <span>Tax ID: {data.seller.taxId}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0" />
                  <span>{data.seller.phone}</span>
                </div>
                {data.seller.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span>{data.seller.email}</span>
                  </div>
                )}
                {data.seller.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 shrink-0" />
                    <span>{data.seller.website}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[#1e4d8c] font-semibold">
              <Building2 className="h-5 w-5" />
              <span>BILL TO</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2 print:border-slate-300">
              <h3 className="font-bold text-lg">{data.client.name}</h3>
              <div className="text-sm text-muted-foreground space-y-1">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{data.client.address}</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0" />
                  <span>Tax ID: {data.client.taxId}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 shrink-0" />
                  <span>{data.client.phone}</span>
                </div>
                {data.client.contactPerson && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">Contact:</span>
                    <span>{data.client.contactPerson}</span>
                  </div>
                )}
                {data.client.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span>{data.client.email}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="invoice-section px-8 pb-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[#1e4d8c] font-semibold">
              <Truck className="h-5 w-5" />
              <span>SHIP TO</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4 print:border-slate-300">
              <div className="text-sm text-muted-foreground">
                {data.shipTo?.trim() || "-"}
              </div>
            </div>
          </div>
        </div>

        {(data.paymentTerms || data.shippingMethod) && (
          <div className="invoice-section px-8 pb-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-wrap gap-6 text-sm print:bg-white print:border-slate-300">
              {data.paymentTerms && (
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-[#1e4d8c]" />
                  <span className="text-muted-foreground">Payment Terms:</span>
                  <span className="font-medium">{data.paymentTerms}</span>
                </div>
              )}
              {data.shippingMethod && (
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-[#1e4d8c]" />
                  <span className="text-muted-foreground">Shipping:</span>
                  <span className="font-medium">{data.shippingMethod}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-[#1e4d8c]" />
                <span className="text-muted-foreground">Total Items:</span>
                <span className="font-medium">{data.items.length}</span>
              </div>
            </div>
          </div>
        )}

        <div className="invoice-section px-8 pb-6">
          <div className="border rounded-lg overflow-hidden">
            <table className="invoice-table w-full text-sm">
              <thead>
                <tr className="bg-[#1e4d8c] text-white">
                  <th className="py-3 px-4 text-center font-semibold w-12">#</th>
                  <th className="py-3 px-4 text-left font-semibold w-20">Code</th>
                  <th className="py-3 px-4 text-left font-semibold">Description</th>
                  <th className="py-3 px-4 text-center font-semibold w-16">Qty</th>
                  <th className="py-3 px-4 text-right font-semibold w-24">Unit Price</th>
                  <th className="py-3 px-4 text-right font-semibold w-20">Disc.</th>
                  <th className="py-3 px-4 text-right font-semibold w-28">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const rowBlocks = data.items.map((item) => {
                    const hasNote = Boolean(item.lineRemarks?.trim())
                    return 1 + (hasNote ? 1 : 0)
                  })
                  const dataRowCount = rowBlocks.reduce((a, b) => a + b, 0)
                  return (
                    <>
                {data.items.map((item, index) => {
                  const remarkLines = (item.lineRemarks || "")
                    .trim()
                    .split(/\r?\n/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                  const stripe = index % 2 === 0 ? "bg-background" : "bg-muted/30"
                  return (
                    <React.Fragment key={item.id}>
                  <tr className={cn(stripe, remarkLines.length > 0 && "border-b-0")}>
                    <td className="py-3 px-4 text-center text-muted-foreground align-top">{item.id}</td>
                    <td className="py-3 px-4 text-left font-mono text-xs text-muted-foreground align-top">
                      {item.itemCode || "-"}
                    </td>
                    <td className="py-3 px-4 text-left align-top text-foreground">{item.description}</td>
                    <td className="py-3 px-4 text-center font-medium align-top">{item.quantity}</td>
                    <td className="py-3 px-4 text-right align-top">{formatCurrency(item.unitPrice)}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground align-top">{item.discount}</td>
                    <td className="py-3 px-4 text-right font-semibold text-[#1e4d8c] align-top">
                      {formatCurrency(item.amount)}
                    </td>
                  </tr>
                  {remarkLines.length > 0 && (
                    <tr className={cn(stripe, "border-t-0") }>
                      <td className="p-0 border-t-0" />
                      <td className="p-0 border-t-0" />
                      <td className="py-1.5 pl-4 pr-4 pb-3 border-t-0 align-top" colSpan={1}>
                        <div className="rounded-md border-l-[3px] border-[#1e4d8c]/35 border-y border-r border-slate-200/80 bg-gradient-to-b from-slate-50 to-slate-50/90 pl-3 pr-2.5 py-2 text-[11.5px] leading-snug text-slate-700 shadow-sm print:border-slate-300 print:from-white print:to-slate-50 print:shadow-none">
                          {remarkLines.map((line, li) => (
                            <div
                              key={li}
                              className={li > 0 ? "mt-0.5" : undefined}
                            >
                              {line}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="p-0 border-t-0" colSpan={4} />
                    </tr>
                  )}
                    </React.Fragment>
                  )
                })}
                {dataRowCount < 6 &&
                  Array.from({ length: 6 - dataRowCount }).map((_, i) => (
                    <tr
                      key={`empty-${i}`}
                      className={
                        (dataRowCount + i) % 2 === 0 ? "bg-background" : "bg-muted/30"
                      }
                    >
                      <td className="py-3 px-4">&nbsp;</td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4"></td>
                    </tr>
                  ))}
                    </>
                  )
                })()}
              </tbody>
            </table>
          </div>
        </div>

        <div className="invoice-section px-8 pb-6 space-y-6">
          {/* 1행: Payment Information(왼쪽) | Grand Total(오른쪽) */}
          <div className="invoice-total-payment-grid grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-6 items-start">
            <div className="bg-[#1e4d8c]/5 border border-[#1e4d8c]/20 rounded-lg p-4">
              <h4 className="font-semibold text-[#1e4d8c] mb-3 flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payment Information
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Bank Name:</span>
                  <p className="font-medium">{data.bankInfo.bankName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Account Number:</span>
                  <p className="font-medium font-mono">{data.bankInfo.accountNo}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Account Name:</span>
                  <p className="font-medium">{data.bankInfo.accountName}</p>
                </div>
                {data.bankInfo.swiftCode && (
                  <div>
                    <span className="text-muted-foreground">SWIFT Code:</span>
                    <p className="font-medium font-mono">{data.bankInfo.swiftCode}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end md:justify-end print:justify-end">
              <div className="w-80 space-y-2">
                <div className="flex justify-between text-sm py-2">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium">{formatCurrency(data.subtotal)} THB</span>
                </div>
                <div className="flex justify-between text-sm py-2">
                  <span className="text-muted-foreground">VAT ({data.vatRate}%):</span>
                  <span className="font-medium">{formatCurrency(data.vatAmount)} THB</span>
                </div>
                <Separator />
                <div className="flex justify-between py-3 bg-[#1e4d8c] text-white -mx-4 px-4 rounded-lg">
                  <span className="font-bold text-lg">Grand Total:</span>
                  <span className="font-bold text-lg">
                    {formatCurrency(data.grandTotal)} THB
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 2행: Terms & Conditions(Remarks 포함) 넓게 | QR Code 크기에 맞춰 좁게 */}
          <div className="invoice-terms-qr-grid grid grid-cols-1 md:grid-cols-[1fr_auto] print:grid-cols-[1fr_auto] gap-6 items-start">
            <div className="flex flex-col gap-4 min-w-0">
              {data.termsAndConditions && data.termsAndConditions.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
                  <h4 className="font-semibold text-amber-800 mb-2">Terms & Conditions</h4>
                  <ul className="list-disc list-inside space-y-1 text-amber-700">
                    {data.termsAndConditions.map((term, i) => (
                      <li key={i}>{term}</li>
                    ))}
                  </ul>
                </div>
              )}
              {data.remarks && (
                <div className="text-sm">
                  <span className="font-semibold">Remarks: </span>
                  <span className="text-muted-foreground">{data.remarks}</span>
                </div>
              )}
            </div>
            <div className="flex flex-col items-center justify-center md:justify-start md:items-end print:justify-start print:items-end bg-muted/50 rounded-lg p-4 w-fit shrink-0">
              <div className="w-24 h-24 bg-white border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center shrink-0">
                <QrCode className="h-12 w-12 text-muted-foreground/50" />
              </div>
              <span className="text-xs text-muted-foreground mt-2">Scan to Pay</span>
            </div>
          </div>
        </div>

        <Separator />

        <div className="invoice-section px-8 py-6">
          <div className="invoice-signature-grid grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-8 items-stretch min-h-[160px]">
            {/* 왼쪽: 상대방 회사명 + Received by, Date - 도장 높이에 정렬 */}
            <div className="flex flex-col justify-between min-h-[160px] py-1">
              <h4 className="font-semibold">{data.client.name}</h4>
              <div className="space-y-1.5">
                <div className="flex items-end gap-2">
                  <span className="text-sm text-muted-foreground shrink-0">Received by:</span>
                  <div className="flex-1 border-b border-dashed border-muted-foreground/50 min-w-[120px]"></div>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-sm text-muted-foreground shrink-0">Date:</span>
                  <div className="flex-1 border-b border-dashed border-muted-foreground/50 min-w-[120px]"></div>
                </div>
              </div>
            </div>

            {/* 오른쪽: [S&J + Authorized Signature](도장 왼쪽, 위·아래 높이 맞춤) | [도장] */}
            <div className="flex items-center justify-end gap-4 min-h-[160px]">
              <div className="flex flex-col justify-between items-end text-right min-h-[160px] py-0">
                <h4 className="font-semibold">{data.seller.name}</h4>
                <span className="text-xs text-muted-foreground">
                  Authorized Signature & Company Stamp
                </span>
              </div>
              <div className="invoice-stamp shrink-0 flex-shrink-0">
                {data.stampImageUrl ? (
                  <img
                    src={data.stampImageUrl}
                    alt="S&J GLOBAL"
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
        </div>

      </div>
    </div>
  )
}
