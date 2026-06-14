'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Building2, ChevronDown, ChevronUp, Receipt, User } from 'lucide-react'
import type { TaxInvoiceCustomerType, TaxSearchField, TaxInvoiceValidationError } from '@/lib/cart-panel-tax-invoice-utils'

export type CartPanelTaxInvoiceSectionProps = {
  showTaxInvoiceDetails: boolean
  onShowTaxInvoiceDetailsChange: (open: boolean) => void
  needTaxInvoice: boolean
  onNeedTaxInvoiceChange: (next: boolean) => void
  invoiceCustomerType: TaxInvoiceCustomerType
  onInvoiceCustomerTypeChange: (next: TaxInvoiceCustomerType) => void
  taxSearchField: TaxSearchField
  onTaxSearchFieldChange: (next: TaxSearchField) => void
  taxSearchKeyword: string
  onTaxSearchKeywordChange: (next: string) => void
  onTaxProfileSearch: () => void
  taxSearchMessage: string
  isMemberOrder: boolean
  taxMemberNo: string
  onTaxMemberNoChange: (next: string) => void
  taxName: string
  onTaxNameChange: (next: string) => void
  taxId: string
  onTaxIdChange: (next: string) => void
  taxBranchNo: string
  onTaxBranchNoChange: (next: string) => void
  taxBranchRequired: boolean
  taxPhone: string
  onTaxPhoneChange: (next: string) => void
  taxEmail: string
  onTaxEmailChange: (next: string) => void
  taxAddress: string
  onTaxAddressChange: (next: string) => void
  taxInvoiceInvalid: boolean
  taxInvoiceValidationErrors: TaxInvoiceValidationError[]
  t: (key: string) => string
}

/** POS 결제 모달 — 세금계산서(전자세금) 입력 블록 */
export function CartPanelTaxInvoiceSection({
  showTaxInvoiceDetails,
  onShowTaxInvoiceDetailsChange,
  needTaxInvoice,
  onNeedTaxInvoiceChange,
  invoiceCustomerType,
  onInvoiceCustomerTypeChange,
  taxSearchField,
  onTaxSearchFieldChange,
  taxSearchKeyword,
  onTaxSearchKeywordChange,
  onTaxProfileSearch,
  taxSearchMessage,
  isMemberOrder,
  taxMemberNo,
  onTaxMemberNoChange,
  taxName,
  onTaxNameChange,
  taxId,
  onTaxIdChange,
  taxBranchNo,
  onTaxBranchNoChange,
  taxBranchRequired,
  taxPhone,
  onTaxPhoneChange,
  taxEmail,
  onTaxEmailChange,
  taxAddress,
  onTaxAddressChange,
  taxInvoiceInvalid,
  taxInvoiceValidationErrors,
  t,
}: CartPanelTaxInvoiceSectionProps) {
  return (
    <Collapsible open={showTaxInvoiceDetails} onOpenChange={onShowTaxInvoiceDetailsChange}>
      <div className="min-h-[72px] space-y-2 rounded-2xl border border-border/70 bg-gradient-to-br from-slate-50/80 to-card p-4 shadow-sm dark:from-slate-950/40 dark:to-card">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <Label className="text-sm font-semibold">{t('posReceiptTaxInvoice')}</Label>
            <Button
              type="button"
              size="sm"
              variant={needTaxInvoice ? 'default' : 'outline'}
              className="h-8"
              data-tour="pos-tour-tax-invoice-toggle"
              onClick={() => onNeedTaxInvoiceChange(!needTaxInvoice)}
            >
              {needTaxInvoice ? t('posTaxInvoiceOn') : t('posTaxInvoiceOff')}
            </Button>
          </div>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 rounded-xl">
              {showTaxInvoiceDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          {needTaxInvoice && (
            <div className="grid gap-2 pt-1" data-tour="pos-tour-tax-invoice-fields">
              <div className="grid gap-2 lg:grid-cols-[auto_auto_1fr_auto] items-center">
                <Button
                  type="button"
                  size="default"
                  variant={invoiceCustomerType === 'person' ? 'default' : 'outline'}
                  className="h-12 rounded-xl"
                  onClick={() => onInvoiceCustomerTypeChange('person')}
                >
                  <User className="h-4 w-4 mr-1.5" />
                  {t('posTaxCustomerIndividual')}
                </Button>
                <Button
                  type="button"
                  size="default"
                  variant={invoiceCustomerType === 'company' ? 'default' : 'outline'}
                  className="h-12 rounded-xl"
                  onClick={() => onInvoiceCustomerTypeChange('company')}
                >
                  <Building2 className="h-4 w-4 mr-1.5" />
                  {t('posTaxCustomerCorporate')}
                </Button>
                <div className="grid grid-cols-[7.5rem_1fr_auto] gap-2 min-w-0">
                  <Select value={taxSearchField} onValueChange={(v) => onTaxSearchFieldChange(v as TaxSearchField)}>
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="memberNo">{t('posMemberNo') || '회원번호'}</SelectItem>
                      <SelectItem value="phone">{t('posPhone') || '전화번호'}</SelectItem>
                      <SelectItem value="name">{t('posName') || '이름'}</SelectItem>
                      <SelectItem value="taxId">{t('posTaxIdLabel') || 'Tax ID'}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder={
                      taxSearchField === 'memberNo'
                        ? (t('posMemberNoInputPh') || '회원번호 입력')
                        : taxSearchField === 'phone'
                          ? (t('posPhoneInputPh') || '전화번호 입력')
                          : taxSearchField === 'taxId'
                            ? (t('posTaxIdThirteenPlaceholder') || 'Tax ID 13자리')
                            : (t('posNameInputPh') || '이름 입력')
                    }
                    value={taxSearchKeyword}
                    onChange={(e) => onTaxSearchKeywordChange(e.target.value)}
                    className="h-12 rounded-xl"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        onTaxProfileSearch()
                      }
                    }}
                  />
                  <Button type="button" size="default" variant="secondary" className="h-12 rounded-xl" onClick={onTaxProfileSearch}>
                    {t('posSearch') || '검색'}
                  </Button>
                </div>
                {isMemberOrder && (
                  <span className="text-xs text-muted-foreground self-center">
                    {t('posTaxMemberLinkedHint')}
                  </span>
                )}
              </div>
              {!!taxSearchMessage && (
                <p className="text-xs text-muted-foreground">{taxSearchMessage}</p>
              )}
              <Input
                placeholder={t('posMemberNo') || '회원번호'}
                value={taxMemberNo}
                onChange={(e) => onTaxMemberNoChange(e.target.value.trim())}
                className="h-12 rounded-xl max-w-[10rem]"
              />
              <div className="grid sm:grid-cols-2 gap-2">
                <Input
                  className="h-12 rounded-xl"
                  placeholder={t('posTaxRecipientNamePlaceholder')}
                  value={taxName}
                  onChange={(e) => onTaxNameChange(e.target.value)}
                />
                <Input
                  className="h-12 rounded-xl"
                  placeholder={t('posTaxIdThirteenPlaceholder')}
                  value={taxId}
                  onChange={(e) => onTaxIdChange(e.target.value.replace(/\D/g, '').slice(0, 13))}
                  inputMode="numeric"
                  data-tour="pos-tour-tax-id-input"
                />
                <Input
                  className="h-12 rounded-xl"
                  placeholder={taxBranchRequired ? t('posTaxBranchFiveCompany') : t('posTaxBranchFivePerson')}
                  value={taxBranchNo}
                  onChange={(e) => onTaxBranchNoChange(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  inputMode="numeric"
                  data-tour="pos-tour-tax-branch-input"
                />
                <Input
                  className="h-12 rounded-xl"
                  placeholder={t('posTaxPhonePlaceholder')}
                  value={taxPhone}
                  onChange={(e) => onTaxPhoneChange(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  inputMode="numeric"
                  data-tour="pos-tour-tax-phone-input"
                />
                <Input
                  className="h-12 rounded-xl"
                  placeholder={t('posTaxEmailOptionalPlaceholder')}
                  value={taxEmail}
                  onChange={(e) => onTaxEmailChange(e.target.value)}
                />
                <Input
                  className="h-12 rounded-xl"
                  placeholder={t('posTaxAddressPlaceholder')}
                  value={taxAddress}
                  onChange={(e) => onTaxAddressChange(e.target.value)}
                  data-tour="pos-tour-tax-address-input"
                />
              </div>
              {taxInvoiceInvalid && (
                <div className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700 space-y-0.5">
                  <p>{t('posTaxValidationTitle')}</p>
                  {taxInvoiceValidationErrors.includes('name') && <p>- {t('posTaxErrName')}</p>}
                  {taxInvoiceValidationErrors.includes('taxId') && <p>- {t('posTaxErrTaxId')}</p>}
                  {taxInvoiceValidationErrors.includes('branch') && <p>- {t('posTaxErrBranch')}</p>}
                  {taxInvoiceValidationErrors.includes('phone') && <p>- {t('posTaxErrPhone')}</p>}
                  {taxInvoiceValidationErrors.includes('address') && <p>- {t('posTaxErrAddress')}</p>}
                  {taxInvoiceValidationErrors.includes('email') && <p>- {t('posTaxErrEmail')}</p>}
                </div>
              )}
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
