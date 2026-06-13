"use client"

import { Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CompanyHybridDocDateTextField } from "@/components/erp/company-hybrid-documents/document-date-field"
import { LIST_CORR_SELECT_NONE } from "@/components/erp/company-hybrid-documents/shared"

export type CorrespondenceFormState = {
  direction: "" | "outbound" | "inbound"
  counterparty: string
  officialRef: string
  status: "" | "draft" | "sent" | "filed" | "replied"
  replyDue: string
  channel: "" | "mail" | "email" | "visit" | "other"
}

type Props = {
  show: boolean
  onShowChange: (show: boolean) => void
  state: CorrespondenceFormState
  onChange: (patch: Partial<CorrespondenceFormState>) => void
  t: (key: string) => string
}

export function CompanyHybridDocumentCorrespondenceFields({
  show,
  onShowChange,
  state,
  onChange,
  t,
}: Props) {
  if (!show) {
    return (
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onShowChange(true)}>
        <Mail className="h-3.5 w-3.5" aria-hidden />
        {t("companyHybridCorrAddFieldsBtn")}
      </Button>
    )
  }

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{t("companyHybridCorrRegisterSectionTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("companyHybridCorrRegisterSectionSub")}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 text-muted-foreground"
          onClick={() => {
            onShowChange(false)
            onChange({
              direction: "",
              counterparty: "",
              officialRef: "",
              status: "",
              replyDue: "",
              channel: "",
            })
          }}
        >
          {t("companyHybridCorrHideFieldsBtn")}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("companyHybridCorrDirection")}</Label>
          <Select
            value={state.direction || LIST_CORR_SELECT_NONE}
            onValueChange={(v) =>
              onChange({ direction: v === LIST_CORR_SELECT_NONE ? "" : (v as "outbound" | "inbound") })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t("companyHybridCorrDirectionPh")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LIST_CORR_SELECT_NONE}>{t("companyHybridCorrDirectionPh")}</SelectItem>
              <SelectItem value="outbound">{t("companyHybridCorrDirectionOutbound")}</SelectItem>
              <SelectItem value="inbound">{t("companyHybridCorrDirectionInbound")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("companyHybridCorrStatus")}</Label>
          <Select
            value={state.status || LIST_CORR_SELECT_NONE}
            onValueChange={(v) =>
              onChange({
                status: v === LIST_CORR_SELECT_NONE ? "" : (v as "draft" | "sent" | "filed" | "replied"),
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t("companyHybridCorrStatusPh")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LIST_CORR_SELECT_NONE}>{t("companyHybridCorrStatusPh")}</SelectItem>
              <SelectItem value="draft">{t("companyHybridCorrStatusDraft")}</SelectItem>
              <SelectItem value="sent">{t("companyHybridCorrStatusSent")}</SelectItem>
              <SelectItem value="filed">{t("companyHybridCorrStatusFiled")}</SelectItem>
              <SelectItem value="replied">{t("companyHybridCorrStatusReplied")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">{t("companyHybridCorrColCounterparty")}</Label>
          <Input value={state.counterparty} onChange={(e) => onChange({ counterparty: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("companyHybridCorrOfficialRef")}</Label>
          <Input value={state.officialRef} onChange={(e) => onChange({ officialRef: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t("companyHybridCorrReplyDue")}</Label>
          <CompanyHybridDocDateTextField
            value={state.replyDue}
            onChange={(v) => onChange({ replyDue: v })}
            placeholder={t("companyHybridDocDatePlaceholder")}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className="text-xs">{t("companyHybridCorrChannel")}</Label>
          <Select
            value={state.channel || LIST_CORR_SELECT_NONE}
            onValueChange={(v) =>
              onChange({
                channel: v === LIST_CORR_SELECT_NONE ? "" : (v as "mail" | "email" | "visit" | "other"),
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t("companyHybridCorrChannelPh")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LIST_CORR_SELECT_NONE}>{t("companyHybridCorrChannelPh")}</SelectItem>
              <SelectItem value="mail">{t("companyHybridCorrChannelMail")}</SelectItem>
              <SelectItem value="email">{t("companyHybridCorrChannelEmail")}</SelectItem>
              <SelectItem value="visit">{t("companyHybridCorrChannelVisit")}</SelectItem>
              <SelectItem value="other">{t("companyHybridCorrChannelOther")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
