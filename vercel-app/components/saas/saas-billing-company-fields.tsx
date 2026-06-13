"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { SaasBillingCompanyInfo } from "@/lib/saas-billing-company-profile"

type TenantValues = {
  companyName: string
  ownerName: string
  phone: string
  billingCompany: SaasBillingCompanyInfo
}

type PartnerValues = {
  name: string
  contactName: string
  contactPhone: string
  contactEmail: string
  billingCompany: SaasBillingCompanyInfo
}

type Props =
  | {
      mode: "tenant"
      values: TenantValues
      onChange: (patch: Partial<TenantValues> & { billingCompany?: Partial<SaasBillingCompanyInfo> }) => void
      t: (key: string) => string
    }
  | {
      mode: "partner"
      values: PartnerValues
      onChange: (patch: Partial<PartnerValues> & { billingCompany?: Partial<SaasBillingCompanyInfo> }) => void
      t: (key: string) => string
    }

function displayValue(raw: string): string {
  return raw === "-" ? "" : raw
}

export function SaasBillingCompanyFields(props: Props) {
  const { t, mode } = props

  const patchBilling = (patch: Partial<SaasBillingCompanyInfo>) => {
    props.onChange({
      billingCompany: { ...props.values.billingCompany, ...patch },
    } as never)
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {mode === "tenant" ? (
        <>
          <div className="space-y-1 md:col-span-2">
            <Label>{t("saasAdminBillingCompany_displayName")}</Label>
            <Input
              value={props.values.companyName}
              onChange={(e) => props.onChange({ companyName: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("saasAdminCust_ownerLabel")}</Label>
            <Input
              value={displayValue(props.values.ownerName)}
              onChange={(e) => props.onChange({ ownerName: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("saasAdminCust_phoneLabel")}</Label>
            <Input
              value={displayValue(props.values.phone)}
              onChange={(e) => props.onChange({ phone: e.target.value })}
            />
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1 md:col-span-2">
            <Label>{t("saasAdminPartners_nameLabel")}</Label>
            <Input value={props.values.name} onChange={(e) => props.onChange({ name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>{t("saasAdminBillingCompany_contactName")}</Label>
            <Input
              value={props.values.contactName}
              onChange={(e) => props.onChange({ contactName: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label>{t("saasAdminCust_phoneLabel")}</Label>
            <Input
              value={props.values.contactPhone}
              onChange={(e) => props.onChange({ contactPhone: e.target.value })}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>{t("saasAdminBillingCompany_billingEmail")}</Label>
            <Input
              type="email"
              value={props.values.contactEmail || props.values.billingCompany.billingEmail}
              onChange={(e) => {
                props.onChange({ contactEmail: e.target.value })
                patchBilling({ billingEmail: e.target.value })
              }}
            />
          </div>
        </>
      )}

      <div className="space-y-1 md:col-span-2">
        <Label>{t("saasAdminBillingCompany_legalName")}</Label>
        <Input
          value={props.values.billingCompany.legalName}
          onChange={(e) => patchBilling({ legalName: e.target.value })}
          placeholder={t("saasAdminBillingCompany_legalNamePh")}
        />
      </div>
      <div className="space-y-1">
        <Label>{t("saasAdminBillingCompany_taxId")}</Label>
        <Input
          value={props.values.billingCompany.taxId}
          onChange={(e) => patchBilling({ taxId: e.target.value.replace(/\D/g, "").slice(0, 13) })}
          placeholder={t("saasAdminBillingCompany_taxIdPh")}
          inputMode="numeric"
        />
      </div>
      {mode === "tenant" ? (
        <div className="space-y-1">
          <Label>{t("saasAdminBillingCompany_billingEmail")}</Label>
          <Input
            type="email"
            value={props.values.billingCompany.billingEmail}
            onChange={(e) => patchBilling({ billingEmail: e.target.value })}
          />
        </div>
      ) : null}
      <div className="space-y-1 md:col-span-2">
        <Label>{t("saasAdminBillingCompany_billingAddress")}</Label>
        <Textarea
          rows={3}
          value={props.values.billingCompany.billingAddress}
          onChange={(e) => patchBilling({ billingAddress: e.target.value })}
          placeholder={t("saasAdminBillingCompany_billingAddressPh")}
        />
      </div>
    </div>
  )
}
