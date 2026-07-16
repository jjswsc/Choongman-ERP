import { vendorForSalesOutletStore, type PoVendorStoreRow } from '@/lib/po-vendor-store-match'

export type PoIssuerCompany = {
  companyName: string
  address: string
  taxId: string
  phone: string
  issuerStore?: string
}

export function resolvePoIssuerCompany(params: {
  issuerStore: string | null | undefined
  vendors: PoVendorStoreRow[]
  headOffice: PoIssuerCompany
}): PoIssuerCompany {
  const issuer = String(params.issuerStore ?? '').trim()
  if (!issuer) {
    return { ...params.headOffice }
  }
  const vendor = vendorForSalesOutletStore(params.vendors, issuer)
  if (!vendor) {
    return {
      companyName: issuer,
      address: '',
      taxId: '',
      phone: '',
      issuerStore: issuer,
    }
  }
  return {
    companyName: String(vendor.name || issuer).trim() || issuer,
    address: String(vendor.address ?? '').trim(),
    taxId: String(vendor.taxId ?? '').trim(),
    phone: String(vendor.phone ?? '').trim(),
    issuerStore: issuer,
  }
}
