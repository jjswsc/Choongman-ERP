"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import type { MarketingCollabDetail } from "@/lib/marketing-collab-detail"
import { Loader2, Save } from "lucide-react"

type Basics = {
  topic: string
  campaignNo?: string
  startDate?: string | null
  endDate?: string | null
  branches: string[]
  discountType?: string
  discountValue?: number
  discountTargetAudience?: string
  discountPricePromotion?: string
}

type TFn = (key: string) => string

function scopeCheckbox(
  id: string,
  label: string,
  checked: boolean,
  onChecked: (v: boolean) => void
) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(x) => onChecked(x === true)} />
      <label htmlFor={id} className="cursor-pointer text-sm leading-none">
        {label}
      </label>
    </div>
  )
}

export function CollabManagementDetailForm(props: {
  t: TFn
  basics: Basics
  allStoresLabel: string
  draft: MarketingCollabDetail
  onChange: (next: MarketingCollabDetail) => void
  onSave: () => void
  saving: boolean
  loading: boolean
}) {
  const { t, basics, allStoresLabel, draft, onChange, onSave, saving, loading } = props

  const set = React.useCallback(
    (patch: Partial<MarketingCollabDetail>) => {
      onChange({ ...draft, ...patch })
    },
    [draft, onChange]
  )

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3">
        <p className="text-xs font-semibold text-foreground">{t("marketingCollabDetailSectionCampaignBasics")}</p>
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-[10px] text-muted-foreground">{t("marketingCollabDetailBasicsTopic")}</span>
            <p className="font-medium leading-tight">{basics.topic || "—"}</p>
          </div>
          {basics.campaignNo ? (
            <div>
              <span className="text-[10px] text-muted-foreground">{t("marketingCollabDetailBasicsNo")}</span>
              <p className="font-mono text-sm">{basics.campaignNo}</p>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <span className="text-[10px] text-muted-foreground">{t("marketingCollabDetailBasicsPeriod")}</span>
            <p>
              {basics.startDate || "—"} ~ {basics.endDate || "—"}
            </p>
          </div>
          <div className="sm:col-span-2">
            <span className="text-[10px] text-muted-foreground">{t("marketingCollabDetailBasicsBranches")}</span>
            <p>
              {basics.branches.length > 0 ? basics.branches.join(", ") : allStoresLabel}
            </p>
          </div>
          {(basics.discountValue ?? 0) > 0 && (
            <div>
              <span className="text-[10px] text-muted-foreground">{t("marketingCollabDetailBasicsPlannedDiscount")}</span>
              <p>
                {basics.discountType === "amount" || basics.discountType === "fixed"
                  ? `฿${Number(basics.discountValue).toLocaleString()}`
                  : `${basics.discountValue}%`}
              </p>
            </div>
          )}
          {(basics.discountTargetAudience ?? "").trim() ? (
            <div className="sm:col-span-2">
              <span className="text-[10px] text-muted-foreground">{t("marketingCollabDetailBasicsAudience")}</span>
              <p className="whitespace-pre-wrap text-sm">{basics.discountTargetAudience}</p>
            </div>
          ) : null}
          {(basics.discountPricePromotion ?? "").trim() ? (
            <div className="sm:col-span-2">
              <span className="text-[10px] text-muted-foreground">{t("marketingCollabDetailBasicsSummary")}</span>
              <p className="text-sm">{basics.discountPricePromotion}</p>
            </div>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("loading")}
        </div>
      ) : (
        <>
          <section className="space-y-3 rounded-xl border border-border/60 bg-background px-4 py-3">
            <h3 className="text-sm font-semibold">{t("marketingCollabDetailSectionPartner")}</h3>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailPartnerName")}</Label>
              <Input
                value={draft.partnerName}
                onChange={(e) => set({ partnerName: e.target.value })}
                placeholder={t("marketingCollabDetailPartnerNamePh")}
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailPartnerType")}</Label>
              <select
                value={draft.partnerType}
                onChange={(e) =>
                  set({ partnerType: e.target.value as MarketingCollabDetail["partnerType"] })
                }
                className="flex h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="">{t("marketingCollabDetailPartnerTypeUnset")}</option>
                <option value="enterprise">{t("marketingCollabDetailPartnerTypeEnterprise")}</option>
                <option value="school">{t("marketingCollabDetailPartnerTypeSchool")}</option>
                <option value="public">{t("marketingCollabDetailPartnerTypePublic")}</option>
                <option value="other">{t("marketingCollabDetailPartnerTypeOther")}</option>
              </select>
            </div>
            {draft.partnerType === "other" && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailPartnerTypeOtherLabel")}</Label>
                <Input
                  value={draft.partnerTypeOther}
                  onChange={(e) => set({ partnerTypeOther: e.target.value })}
                  placeholder={t("marketingCollabDetailPartnerTypeOtherPh")}
                  className="h-9"
                />
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-border/60 bg-background px-4 py-3">
            <h3 className="text-sm font-semibold">{t("marketingCollabDetailSectionIdProof")}</h3>
            <p className="text-[11px] text-muted-foreground">{t("marketingCollabDetailIdProofHint")}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {scopeCheckbox(
                "collab-id-emp",
                t("marketingCollabDetailIdProofEmployee"),
                draft.idProofEmployeeCard,
                (v) => set({ idProofEmployeeCard: v })
              )}
              {scopeCheckbox(
                "collab-id-stu",
                t("marketingCollabDetailIdProofStudent"),
                draft.idProofStudentCard,
                (v) => set({ idProofStudentCard: v })
              )}
              {scopeCheckbox(
                "collab-id-mem",
                t("marketingCollabDetailIdProofMembership"),
                draft.idProofMembership,
                (v) => set({ idProofMembership: v })
              )}
              {scopeCheckbox(
                "collab-id-oth",
                t("marketingCollabDetailIdProofOtherCb"),
                draft.idProofOther,
                (v) => set({ idProofOther: v })
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailIdProofNote")}</Label>
              <Textarea
                value={draft.idProofNote}
                onChange={(e) => set({ idProofNote: e.target.value })}
                rows={2}
                className="text-sm"
                placeholder={t("marketingCollabDetailIdProofNotePh")}
              />
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border/60 bg-background px-4 py-3">
            <h3 className="text-sm font-semibold">{t("marketingCollabDetailSectionScope")}</h3>
            <p className="text-[11px] text-muted-foreground">{t("marketingCollabDetailScopeHint")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {scopeCheckbox(
                "collab-sc-chicken",
                t("marketingCollabDetailScopeChicken"),
                draft.scopeChicken,
                (v) => set({ scopeChicken: v })
              )}
              {scopeCheckbox(
                "collab-sc-korean",
                t("marketingCollabDetailScopeKorean"),
                draft.scopeKorean,
                (v) => set({ scopeKorean: v })
              )}
              {scopeCheckbox(
                "collab-sc-side",
                t("marketingCollabDetailScopeSide"),
                draft.scopeSide,
                (v) => set({ scopeSide: v })
              )}
              {scopeCheckbox(
                "collab-sc-drink",
                t("marketingCollabDetailScopeDrinks"),
                draft.scopeDrinksNonAlcohol,
                (v) => set({ scopeDrinksNonAlcohol: v })
              )}
              {scopeCheckbox(
                "collab-sc-alc",
                t("marketingCollabDetailScopeAlcohol"),
                draft.scopeAlcohol,
                (v) => set({ scopeAlcohol: v })
              )}
              {scopeCheckbox(
                "collab-sc-top",
                t("marketingCollabDetailScopeTopping"),
                draft.scopeTopping,
                (v) => set({ scopeTopping: v })
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailScopeNote")}</Label>
              <Textarea
                value={draft.scopeNote}
                onChange={(e) => set({ scopeNote: e.target.value })}
                rows={2}
                className="text-sm"
                placeholder={t("marketingCollabDetailScopeNotePh")}
              />
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border/60 bg-background px-4 py-3">
            <h3 className="text-sm font-semibold">{t("marketingCollabDetailSectionDiscountOps")}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailDiscountPercentStore")}</Label>
                <Input
                  value={draft.discountPercentStore}
                  onChange={(e) => set({ discountPercentStore: e.target.value })}
                  placeholder="10% / 20%"
                  className="h-9"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailDiscountStackingNote")}</Label>
                <Textarea
                  value={draft.discountStackingNote}
                  onChange={(e) => set({ discountStackingNote: e.target.value })}
                  rows={2}
                  className="text-sm"
                  placeholder={t("marketingCollabDetailDiscountStackingPh")}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailRulesNote")}</Label>
              <Textarea
                value={draft.rulesNote}
                onChange={(e) => set({ rulesNote: e.target.value })}
                rows={3}
                className="text-sm"
                placeholder={t("marketingCollabDetailRulesNotePh")}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailOpsFlowNote")}</Label>
              <Textarea
                value={draft.opsFlowNote}
                onChange={(e) => set({ opsFlowNote: e.target.value })}
                rows={3}
                className="text-sm"
                placeholder={t("marketingCollabDetailOpsFlowNotePh")}
              />
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border/60 bg-background px-4 py-3">
            <h3 className="text-sm font-semibold">{t("marketingCollabDetailSectionContract")}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailContractRef")}</Label>
                <Input
                  value={draft.contractReference}
                  onChange={(e) => set({ contractReference: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailContactName")}</Label>
                <Input
                  value={draft.contactName}
                  onChange={(e) => set({ contactName: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailContactInfo")}</Label>
                <Input
                  value={draft.contactInfo}
                  onChange={(e) => set({ contactInfo: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <Button type="button" className="gap-1.5" disabled={saving} onClick={onSave}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("marketingCollabDetailSave")}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
