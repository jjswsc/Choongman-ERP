/**
 * RD Prep ใบแนบ 주소 칸 — 원장에 payee_address가 없으면
 * 거래처(vendors.addr)·직원(employees.address)에서 TIN/이름으로 채움.
 */

export type RdPrepPayeeMaster = {
  code?: string | null
  name?: string | null
  taxId?: string | null
  address?: string | null
}

export type RdPrepPayeeAddressRow = {
  payee_name?: string | null
  payee_tax_id?: string | null
  payee_address?: string | null
}

function tinDigits(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

function compactSpaces(v: unknown): string {
  return String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ')
}

/** 법인명 비교용: บริษัท / จำกัด / Co., Ltd. / (Head Office) 제거 */
export function normalizeVendorNameKey(raw: string): string {
  return compactSpaces(raw)
    .toLowerCase()
    .replace(/\s*\((?:head office|สำนักงานใหญ่|\d{5})\)\s*$/gi, '')
    .replace(/บริษัท\s*/g, '')
    .replace(/\s*จำกัด\s*$/g, '')
    .replace(/\s*co\.?\s*,?\s*ltd\.?\s*$/g, '')
    .trim()
}

function tinsMatch(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  if (a.length >= 10 && b.length >= 10 && (a.startsWith(b) || b.startsWith(a))) return true
  return false
}

/** 개인명 비교용: นาย/นางสาว 등 호칭 제거 */
export function normalizePersonNameKey(raw: string): string {
  return compactSpaces(raw)
    .toLowerCase()
    .replace(/^(นางสาว|นาง|นาย|น\.ส\.|นส\.|คุณ|miss|mrs\.?|mr\.?|ms\.?)\s*/i, '')
    .trim()
}

function masterTin(row: RdPrepPayeeMaster): string {
  return tinDigits(row.taxId)
}

function masterAddress(row: RdPrepPayeeMaster | undefined): string {
  return compactSpaces(row?.address)
}

export function findPayeeMaster(
  masters: RdPrepPayeeMaster[],
  query: { code?: string; name?: string; taxId?: string }
): RdPrepPayeeMaster | undefined {
  const list = masters || []
  const code = compactSpaces(query.code)
  const name = compactSpaces(query.name)
  const tin = tinDigits(query.taxId)
  const vendorKey = normalizeVendorNameKey(name)
  const personKey = normalizePersonNameKey(name)

  if (tin.length >= 10) {
    const exactAddr = list.find((m) => masterTin(m) === tin && masterAddress(m))
    if (exactAddr) return exactAddr
    const prefixAddr = list.find((m) => tinsMatch(masterTin(m), tin) && masterAddress(m))
    if (prefixAddr) return prefixAddr
    const exactAny = list.find((m) => masterTin(m) === tin)
    if (exactAny) return exactAny
    const prefixAny = list.find((m) => tinsMatch(masterTin(m), tin))
    if (prefixAny) return prefixAny
  }
  if (code) {
    const byCode = list.find((m) => compactSpaces(m.code) === code)
    if (byCode) return byCode
  }
  if (name) {
    const exact = list.find((m) => compactSpaces(m.name) === name)
    if (exact) return exact
  }
  if (vendorKey) {
    const byVendorAddr = list.find(
      (m) => normalizeVendorNameKey(String(m.name || '')) === vendorKey && masterAddress(m)
    )
    if (byVendorAddr) return byVendorAddr
    const byVendor = list.find((m) => normalizeVendorNameKey(String(m.name || '')) === vendorKey)
    if (byVendor) return byVendor
  }
  if (personKey) {
    const byPersonAddr = list.find(
      (m) => normalizePersonNameKey(String(m.name || '')) === personKey && masterAddress(m)
    )
    if (byPersonAddr) return byPersonAddr
    const byPerson = list.find((m) => normalizePersonNameKey(String(m.name || '')) === personKey)
    if (byPerson) return byPerson
  }
  return undefined
}

export function resolvePayeeAddressFromMasters(
  row: RdPrepPayeeAddressRow,
  masters: { vendors?: RdPrepPayeeMaster[]; employees?: RdPrepPayeeMaster[] }
): string {
  const existing = compactSpaces(row.payee_address)
  if (existing) return existing
  const query = {
    name: String(row.payee_name || ''),
    taxId: String(row.payee_tax_id || ''),
  }
  const vendor = findPayeeMaster(masters.vendors || [], query)
  if (masterAddress(vendor)) return masterAddress(vendor)
  const employee = findPayeeMaster(masters.employees || [], query)
  return masterAddress(employee)
}

export function enrichLedgerRowsWithPayeeAddress<T extends RdPrepPayeeAddressRow>(
  rows: T[],
  masters: { vendors?: RdPrepPayeeMaster[]; employees?: RdPrepPayeeMaster[] }
): T[] {
  return (rows || []).map((row) => {
    const address = resolvePayeeAddressFromMasters(row, masters)
    if (!address || compactSpaces(row.payee_address) === address) return row
    return { ...row, payee_address: address }
  })
}
