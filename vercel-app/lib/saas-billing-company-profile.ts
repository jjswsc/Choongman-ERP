export type SaasBillingCompanyInfo = {
  legalName: string
  taxId: string
  billingAddress: string
  billingEmail: string
}

export function emptySaasBillingCompanyInfo(): SaasBillingCompanyInfo {
  return {
    legalName: "",
    taxId: "",
    billingAddress: "",
    billingEmail: "",
  }
}

export function normalizeSaasTaxId(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, 13)
}

export function formatSaasTaxId(raw: unknown): string {
  const digits = normalizeSaasTaxId(raw)
  if (digits.length <= 10) return digits
  return `${digits.slice(0, 10)}${digits.length > 10 ? digits.slice(10) : ""}`
}

type TenantBillingRow = {
  owner_name?: string | null
  phone?: string | null
  legal_name?: string | null
  tax_id?: string | null
  billing_address?: string | null
  billing_email?: string | null
}

type PartnerBillingRow = {
  legal_name?: string | null
  tax_id?: string | null
  billing_address?: string | null
  contact_name?: string | null
  contact_phone?: string | null
  contact_email?: string | null
}

export function mapTenantBillingCompanyFromRow(row: TenantBillingRow): SaasBillingCompanyInfo {
  return {
    legalName: String(row.legal_name ?? "").trim(),
    taxId: normalizeSaasTaxId(row.tax_id),
    billingAddress: String(row.billing_address ?? "").trim(),
    billingEmail: String(row.billing_email ?? "").trim(),
  }
}

export function mapPartnerBillingCompanyFromRow(row: PartnerBillingRow): SaasBillingCompanyInfo {
  return {
    legalName: String(row.legal_name ?? "").trim(),
    taxId: normalizeSaasTaxId(row.tax_id),
    billingAddress: String(row.billing_address ?? "").trim(),
    billingEmail: String(row.contact_email ?? "").trim(),
  }
}

export function tenantBillingDbPatch(params: {
  companyName: string
  ownerName?: string
  phone?: string
  billingCompany?: Partial<SaasBillingCompanyInfo>
}): Record<string, unknown> {
  const billing = { ...emptySaasBillingCompanyInfo(), ...params.billingCompany }
  return {
    company_name: String(params.companyName || "").trim(),
    owner_name: String(params.ownerName ?? "").trim() || null,
    phone: String(params.phone ?? "").trim() || null,
    legal_name: billing.legalName.trim() || null,
    tax_id: normalizeSaasTaxId(billing.taxId) || null,
    billing_address: billing.billingAddress.trim() || null,
    billing_email: billing.billingEmail.trim() || null,
  }
}

export function partnerBillingDbPatch(params: {
  name: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  billingCompany?: Partial<SaasBillingCompanyInfo>
}): Record<string, unknown> {
  const billing = { ...emptySaasBillingCompanyInfo(), ...params.billingCompany }
  const contactEmail = String(params.contactEmail ?? billing.billingEmail ?? "").trim()
  return {
    name: String(params.name || "").trim(),
    contact_name: String(params.contactName ?? "").trim() || null,
    contact_phone: String(params.contactPhone ?? "").trim() || null,
    contact_email: contactEmail || null,
    legal_name: billing.legalName.trim() || null,
    tax_id: normalizeSaasTaxId(billing.taxId) || null,
    billing_address: billing.billingAddress.trim() || null,
  }
}

export type SaasBillingParty = {
  displayName: string
  legalName: string
  taxId: string
  billingAddress: string
  billingEmail: string
  contactName: string
  contactPhone: string
}

export function billingPartyFromTenant(tenant: {
  companyName: string
  ownerName?: string
  phone?: string
  billingCompany?: Partial<SaasBillingCompanyInfo>
}): SaasBillingParty {
  const billing = { ...emptySaasBillingCompanyInfo(), ...tenant.billingCompany }
  return {
    displayName: tenant.companyName,
    legalName: billing.legalName || tenant.companyName,
    taxId: billing.taxId,
    billingAddress: billing.billingAddress,
    billingEmail: billing.billingEmail,
    contactName: tenant.ownerName && tenant.ownerName !== "-" ? tenant.ownerName : "",
    contactPhone: tenant.phone && tenant.phone !== "-" ? tenant.phone : "",
  }
}

export function billingPartyFromPartner(partner: {
  name: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  billingCompany?: Partial<SaasBillingCompanyInfo>
}): SaasBillingParty {
  const billing = { ...emptySaasBillingCompanyInfo(), ...partner.billingCompany }
  return {
    displayName: partner.name,
    legalName: billing.legalName || partner.name,
    taxId: billing.taxId,
    billingAddress: billing.billingAddress,
    billingEmail: billing.billingEmail || String(partner.contactEmail ?? "").trim(),
    contactName: String(partner.contactName ?? "").trim(),
    contactPhone: String(partner.contactPhone ?? "").trim(),
  }
}

export function renderBillingPartyHtml(party: SaasBillingParty, labels: {
  legalName: string
  taxId: string
  address: string
  contact: string
  email: string
}): string {
  const lines = [
    `<strong>${party.displayName}</strong>`,
    party.legalName && party.legalName !== party.displayName
      ? `<div>${labels.legalName}: ${party.legalName}</div>`
      : "",
    party.taxId ? `<div>${labels.taxId}: ${party.taxId}</div>` : "",
    party.billingAddress ? `<div>${labels.address}: ${party.billingAddress.replace(/\n/g, "<br>")}</div>` : "",
    party.contactName || party.contactPhone
      ? `<div>${labels.contact}: ${[party.contactName, party.contactPhone].filter(Boolean).join(" · ")}</div>`
      : "",
    party.billingEmail ? `<div>${labels.email}: ${party.billingEmail}</div>` : "",
  ].filter(Boolean)
  return lines.join("")
}
