'use client'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type TranslateFn = (key: string, fallback?: string) => string

export function PosTaxInvoiceFieldLabel({
  children,
  required = false,
  optional = false,
  optionalText,
  className,
}: {
  children: React.ReactNode
  required?: boolean
  optional?: boolean
  optionalText?: string
  className?: string
}) {
  return (
    <Label className={cn('text-xs', className)}>
      {children}
      {required ? <span className="font-medium text-destructive"> *</span> : null}
      {optional && optionalText ? (
        <span className="font-normal text-muted-foreground"> ({optionalText})</span>
      ) : null}
    </Label>
  )
}

export function PosTaxInvoiceRequiredLegend({ t }: { t: TranslateFn }) {
  return (
    <p className="text-xs text-muted-foreground">
      <span className="font-medium text-destructive">*</span> {t('posRequired', '필수')}
    </p>
  )
}

export function PosTaxInvoiceValidationAlert({
  errors,
  t,
  className,
}: {
  errors: string[]
  t: TranslateFn
  className?: string
}) {
  if (errors.length === 0) return null
  return (
    <div
      className={cn(
        'space-y-0.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200',
        className
      )}
    >
      <p>{t('posTaxValidationTitle', '세금계산서(Tax Invoice) 필수 항목 또는 형식을 확인해 주세요.')}</p>
      {errors.includes('name') && <p>- {t('posTaxErrName', '이름/회사명을 입력해 주세요.')}</p>}
      {errors.includes('taxId') && <p>- {t('posTaxErrTaxId', 'Tax ID는 숫자 13자리여야 합니다.')}</p>}
      {errors.includes('branch') && <p>- {t('posTaxErrBranch', '지점번호는 숫자 5자리여야 합니다.')}</p>}
      {errors.includes('phone') && <p>- {t('posTaxErrPhone', '전화번호는 숫자 9~10자리여야 합니다.')}</p>}
      {errors.includes('address') && <p>- {t('posTaxErrAddress', '주소를 입력해 주세요.')}</p>}
      {errors.includes('email') && <p>- {t('posTaxErrEmail', '이메일 형식이 올바르지 않습니다.')}</p>}
    </div>
  )
}
