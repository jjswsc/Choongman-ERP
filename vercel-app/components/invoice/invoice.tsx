"use client"

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

export interface InvoiceItem {
  id: number
  itemCode?: string
  description: string
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
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

function numberToWords(num: number): string {
  const ones = [
    "",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ]
  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ]

  if (num === 0) return "zero"

  function convert(n: number): string {
    if (n < 20) return ones[n]
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? "-" + ones[n % 10] : "")
    if (n < 1000)
      return ones[Math.floor(n / 100)] + " hundred" + (n % 100 ? " " + convert(n % 100) : "")
    if (n < 1000000)
      return convert(Math.floor(n / 1000)) + " thousand" + (n % 1000 ? " " + convert(n % 1000) : "")
    return (
      convert(Math.floor(n / 1000000)) + " million" + (n % 1000000 ? " " + convert(n % 1000000) : "")
    )
  }

  return convert(Math.floor(num)) + " baht only"
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
    <div className="min-h-screen bg-muted/30 p-4 md:p-8 print:bg-white print:p-0">
      {!printOnly && (onPrint || onDownloadPdf) && (
        <div className="max-w-4xl mx-auto mb-4 flex gap-2 print:hidden">
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

      <div className="max-w-4xl mx-auto bg-background shadow-lg print:shadow-none rounded-lg overflow-hidden">
        <div className="bg-[#1e4d8c] text-white px-8 py-6">
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

        <div className="px-8 py-6 grid md:grid-cols-2 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-[#1e4d8c] font-semibold">
              <Building2 className="h-5 w-5" />
              <span>FROM</span>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
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
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
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

        {(data.paymentTerms || data.shippingMethod) && (
          <div className="px-8 pb-4">
            <div className="bg-[#1e4d8c]/5 border border-[#1e4d8c]/20 rounded-lg p-4 flex flex-wrap gap-6 text-sm">
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

        <div className="px-8 pb-6">
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1e4d8c] text-white">
                  <th className="py-3 px-4 text-center font-semibold w-12">#</th>
                  <th className="py-3 px-4 text-left font-semibold w-20">Code</th>
                  <th className="py-3 px-4 text-left font-semibold">Description</th>
                  <th className="py-3 px-4 text-center font-semibold w-16">Qty</th>
                  <th className="py-3 px-4 text-center font-semibold w-16">Unit</th>
                  <th className="py-3 px-4 text-right font-semibold w-24">Unit Price</th>
                  <th className="py-3 px-4 text-right font-semibold w-20">Disc.</th>
                  <th className="py-3 px-4 text-right font-semibold w-28">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, index) => (
                  <tr
                    key={item.id}
                    className={index % 2 === 0 ? "bg-background" : "bg-muted/30"}
                  >
                    <td className="py-3 px-4 text-center text-muted-foreground">{item.id}</td>
                    <td className="py-3 px-4 text-left font-mono text-xs text-muted-foreground">
                      {item.itemCode || "-"}
                    </td>
                    <td className="py-3 px-4 text-left">{item.description}</td>
                    <td className="py-3 px-4 text-center font-medium">{item.quantity}</td>
                    <td className="py-3 px-4 text-center text-muted-foreground">
                      {item.unit || "-"}
                    </td>
                    <td className="py-3 px-4 text-right">{formatCurrency(item.unitPrice)}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground">{item.discount}</td>
                    <td className="py-3 px-4 text-right font-semibold text-[#1e4d8c]">
                      {formatCurrency(item.amount)}
                    </td>
                  </tr>
                ))}
                {data.items.length < 6 &&
                  Array.from({ length: 6 - data.items.length }).map((_, i) => (
                    <tr
                      key={`empty-${i}`}
                      className={
                        (data.items.length + i) % 2 === 0 ? "bg-background" : "bg-muted/30"
                      }
                    >
                      <td className="py-3 px-4">&nbsp;</td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4"></td>
                      <td className="py-3 px-4"></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="px-8 pb-6">
          <div className="flex justify-end">
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
              <div className="text-center text-sm text-muted-foreground italic pt-2">
                ({numberToWords(data.grandTotal)})
              </div>
            </div>
          </div>
        </div>

        <div className="px-8 pb-6">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 bg-[#1e4d8c]/5 border border-[#1e4d8c]/20 rounded-lg p-4">
              <h4 className="font-semibold text-[#1e4d8c] mb-3 flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payment Information
              </h4>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
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
            <div className="flex flex-col items-center justify-center bg-muted/50 rounded-lg p-4">
              <div className="w-24 h-24 bg-white border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center">
                <QrCode className="h-12 w-12 text-muted-foreground/50" />
              </div>
              <span className="text-xs text-muted-foreground mt-2">Scan to Pay</span>
            </div>
          </div>
        </div>

        {data.termsAndConditions && data.termsAndConditions.length > 0 && (
          <div className="px-8 pb-6">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
              <h4 className="font-semibold text-amber-800 mb-2">Terms & Conditions</h4>
              <ul className="list-disc list-inside space-y-1 text-amber-700">
                {data.termsAndConditions.map((term, i) => (
                  <li key={i}>{term}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {data.remarks && (
          <div className="px-8 pb-6">
            <div className="text-sm">
              <span className="font-semibold">Remarks: </span>
              <span className="text-muted-foreground">{data.remarks}</span>
            </div>
          </div>
        )}

        <Separator />

        <div className="px-8 py-6">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h4 className="font-semibold">{data.client.name}</h4>
              <div className="space-y-3">
                <div className="flex items-end gap-2">
                  <span className="text-sm text-muted-foreground">Received by:</span>
                  <div className="flex-1 border-b border-dashed border-muted-foreground/50 min-w-[150px]"></div>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-sm text-muted-foreground">Date:</span>
                  <div className="flex-1 border-b border-dashed border-muted-foreground/50 min-w-[150px]"></div>
                </div>
              </div>
            </div>

            <div className="space-y-4 text-right">
              <h4 className="font-semibold">{data.seller.name}</h4>
              <div className="flex flex-col items-end">
                {data.stampImageUrl ? (
                  <img
                    src={data.stampImageUrl}
                    alt="S&J GLOBAL"
                    className="w-28 h-28 object-contain opacity-90"
                    style={{ mixBlendMode: "multiply" }}
                  />
                ) : (
                  <div className="w-28 h-28 border-2 border-dashed border-[#1e4d8c]/30 rounded-full flex items-center justify-center bg-[#1e4d8c]/5">
                    <div className="text-center">
                      <div className="text-[#1e4d8c] font-bold text-sm">S&J</div>
                      <div className="text-[#1e4d8c] text-xs">GLOBAL</div>
                    </div>
                  </div>
                )}
                <span className="text-xs text-muted-foreground mt-2">
                  Authorized Signature & Company Stamp
                </span>
              </div>
            </div>
          </div>
        </div>

        {(data.seller.email || data.seller.phone) && (
          <div className="bg-muted/50 px-8 py-4 text-center text-xs text-muted-foreground">
            <p>
              Thank you for your business! For any inquiries, please contact us at{" "}
              {data.seller.email || data.seller.phone}
            </p>
            <p className="mt-1">This is a computer-generated document. No signature is required if stamped.</p>
          </div>
        )}
      </div>
    </div>
  )
}
