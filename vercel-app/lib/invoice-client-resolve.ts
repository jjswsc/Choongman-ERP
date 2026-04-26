import type { InvoiceDataClient, InvoiceDataCompany } from "@/lib/api-client"

const OFFICE_STORES = ["본사", "Office", "오피스", "본점", "Head Office", "HQ", "Head office", "head office"]

function lookupClientInMap(
  key: string,
  clients: Record<string, InvoiceDataClient> | null | undefined
): InvoiceDataClient | undefined {
  if (!clients) return undefined
  const norm = key.trim()
  if (!norm) return undefined
  return clients[key] ?? clients[norm] ?? clients[norm.toLowerCase()]
}

function isOfficeLikeTarget(target: string): boolean {
  return OFFICE_STORES.some((s) => (target || "").toLowerCase().includes(s.toLowerCase()))
}

function clientHasBillToAddress(c: InvoiceDataClient): boolean {
  const a = (c.address || "").trim()
  return Boolean(a && a !== "-")
}

/** 출고·미수금 인보이스 공통: 매출처명으로 거래처 마스터 매칭, 없으면 오피스 여부 시 본사 정보 */
export function resolveInvoiceClientForTarget(
  target: string,
  company: InvoiceDataCompany | null,
  clients: Record<string, InvoiceDataClient> | null | undefined
): InvoiceDataClient | { companyName: string } {
  const targetNorm = (target || "").trim()
  const found = lookupClientInMap(target || "", clients)
  if (found) return found
  const isOfficeTarget = isOfficeLikeTarget(targetNorm)
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

/**
 * 출고 target이 POS 등으로만 저장돼 vendors에 없을 때, 주문 cart의 vendor 문자열로 매출처를 찾는다.
 * candidates는 우선순위 순(예: store_name 먼저, 이후 cart vendor).
 */
export function resolveInvoiceClientFromBillToCandidates(
  candidates: string[],
  company: InvoiceDataCompany | null,
  clients: Record<string, InvoiceDataClient> | null | undefined
): InvoiceDataClient | { companyName: string } {
  const list = [...new Set(candidates.map((c) => String(c || "").trim()).filter(Boolean))]
  if (list.length === 0) {
    return resolveInvoiceClientForTarget("", company, clients)
  }
  const hits: InvoiceDataClient[] = []
  let hasOfficeLikeCandidate = false
  let hasNonOfficeLikeCandidate = false
  for (const key of list) {
    if (isOfficeLikeTarget(key)) hasOfficeLikeCandidate = true
    else hasNonOfficeLikeCandidate = true
    const found = lookupClientInMap(key, clients)
    if (found) hits.push(found)
  }
  const withAddr = hits.find((h) => clientHasBillToAddress(h))
  if (withAddr) return withAddr
  if (hits[0]) return hits[0]
  // 본사 fallback은 "전부 본사 후보"인 경우에만 허용한다.
  // 매장 후보가 하나라도 있으면 절대 본사로 강등하지 않는다.
  if (hasOfficeLikeCandidate && !hasNonOfficeLikeCandidate && company) {
    return {
      companyName: company.companyName,
      address: company.address || "-",
      taxId: company.taxId || "-",
      phone: company.phone || "-",
    }
  }
  return resolveInvoiceClientForTarget(list[0], company, clients)
}
