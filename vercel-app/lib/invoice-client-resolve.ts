import type { InvoiceDataClient, InvoiceDataCompany } from "@/lib/api-client"

const OFFICE_STORES = ["본사", "Office", "오피스", "본점", "Head Office", "HQ", "Head office", "head office"]

/** 출고·미수금 인보이스 공통: 매출처명으로 거래처 마스터 매칭, 없으면 오피스 여부 시 본사 정보 */
export function resolveInvoiceClientForTarget(
  target: string,
  company: InvoiceDataCompany | null,
  clients: Record<string, InvoiceDataClient> | null | undefined
): InvoiceDataClient | { companyName: string } {
  const targetNorm = (target || "").trim()
  const targetLower = targetNorm.toLowerCase()
  const found = clients && (clients[target || ""] ?? clients[targetNorm] ?? clients[targetLower])
  if (found) return found
  const isOfficeTarget = OFFICE_STORES.some((s) => (target || "").toLowerCase().includes(s.toLowerCase()))
  if (isOfficeTarget && company) {
    return {
      companyName: company.companyName,
      address: company.address || "-",
      taxId: company.taxId || "-",
      phone: company.phone || "-",
    }
  }
  return { companyName: target || "-" }
}
