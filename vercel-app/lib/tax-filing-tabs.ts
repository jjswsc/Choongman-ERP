export const TAX_FILING_TABS = [
  "pp30",
  "purchaseTaxInv",
  "pp36",
  "pnd1",
  "pnd91",
  "pnd3",
  "pnd5051",
  "pnd53",
  "pnd54",
  "sso",
  "storeProfiles",
] as const

export type TaxFilingTabKey = (typeof TAX_FILING_TABS)[number]

export const TAX_FILING_DEFAULT_TAB: TaxFilingTabKey = "pp30"
export const TAX_FILING_TAB_STORAGE_KEY = "cm_tax_filing_tab"

const LEGACY_TAX_FILING_TABS: Record<string, TaxFilingTabKey> = {
  vat: "pp30",
  pp30pp36: "pp30",
  wht: "pnd1",
  pnd1391: "pnd1",
  cit: "pnd5051",
  dbd: "pnd53",
  workflow: "pnd53",
  pnd5354: "pnd53",
}

export function resolveTaxFilingTab(raw: string | null | undefined): TaxFilingTabKey | null {
  const q = String(raw || "").trim()
  if (!q) return null
  if ((TAX_FILING_TABS as readonly string[]).includes(q)) return q as TaxFilingTabKey
  return LEGACY_TAX_FILING_TABS[q] || null
}

export function readStoredTaxFilingTab(): TaxFilingTabKey | null {
  if (typeof window === "undefined") return null
  try {
    return resolveTaxFilingTab(sessionStorage.getItem(TAX_FILING_TAB_STORAGE_KEY))
  } catch {
    return null
  }
}

export function writeStoredTaxFilingTab(tab: TaxFilingTabKey) {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(TAX_FILING_TAB_STORAGE_KEY, tab)
  } catch {
    /* quota */
  }
}
