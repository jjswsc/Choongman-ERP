type StoreAccessResult = {
  allowed: boolean
  reason: 'allow_all' | 'missing_store_code' | 'not_in_allowlist'
  allowedStores: string[]
}

function normalizeStoreCode(v: string): string {
  return String(v || '').trim().toUpperCase()
}

function parseAllowlistFromEnv(): string[] {
  const raw = String(process.env.KBANK_QR_TEST_STORE_CODES || '').trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((v) => normalizeStoreCode(v))
    .filter(Boolean)
}

export function checkKbankStoreAccess(storeCodeRaw: string): StoreAccessResult {
  const allowlist = parseAllowlistFromEnv()
  if (allowlist.length === 0) {
    return { allowed: true, reason: 'allow_all', allowedStores: [] }
  }
  const storeCode = normalizeStoreCode(storeCodeRaw)
  if (!storeCode) {
    return { allowed: false, reason: 'missing_store_code', allowedStores: allowlist }
  }
  const allowed = allowlist.includes(storeCode)
  return {
    allowed,
    reason: allowed ? 'allow_all' : 'not_in_allowlist',
    allowedStores: allowlist,
  }
}
