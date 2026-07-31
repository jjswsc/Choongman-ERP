'use client'

import * as React from 'react'
import { Hash, Phone, UserX, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TierFacetedGemIcon } from '@/components/member-portal/member-portal-tier-gem-icon'
import {
  posTierBadgeClass,
  posTierCardClass,
  resolveTierFamily,
} from '@/lib/member-portal-tier-visual'
import { normalizeMemberTierCodeForDiscount } from '@/lib/member-tier-discount'
import { posScanFieldFlashClass, type PosScanFieldFlash } from '@/lib/pos-scan-feedback'
import { cn, formatBahtNum } from '@/lib/utils'

export type PosPaymentMemberDetail = {
  name: string
  memberNo: string
  phone: string
  tierCode: string
}

export type PosPaymentMemberOption = { value: string; label: string }

type PosMemberResultsSectionProps = {
  selectedMemberId: string
  selectedMemberDetail: PosPaymentMemberDetail | null | undefined
  selectedMemberTierLabel: string
  memberOptions: PosPaymentMemberOption[]
  onSelectMember: (memberId: string) => void
  onClearMember: () => void
  tierDiscountAmt: number
  selectedMemberTierDiscountRate: number
  memberSearchEmpty: boolean
  /** delivery면 등급 할인 대신 포인트만 안내 */
  orderType?: string | null
  compact?: boolean
  t: (key: string) => string
  tr: (key: string, fallback: string) => string
}

export function PosMemberResultsSection({
  selectedMemberId,
  selectedMemberDetail,
  selectedMemberTierLabel,
  memberOptions,
  onSelectMember,
  onClearMember,
  tierDiscountAmt,
  selectedMemberTierDiscountRate,
  memberSearchEmpty,
  orderType,
  compact = false,
  t,
  tr,
}: PosMemberResultsSectionProps) {
  const tierCode = normalizeMemberTierCodeForDiscount(selectedMemberDetail?.tierCode || 'BRONZE')
  const tierFamily = resolveTierFamily(tierCode)
  const alternateOptions = memberOptions.filter((m) => m.value !== selectedMemberId)
  const gemSize = compact ? 24 : 34
  const cardPad = compact ? 'p-2' : 'p-3'
  const gemBox = compact ? 'h-9 w-9 rounded-lg' : 'h-12 w-12 rounded-xl'
  const nameClass = compact ? 'text-sm font-semibold' : 'text-base font-semibold'
  const isDeliveryOrder =
    String(orderType || '')
      .trim()
      .toLowerCase()
      .replace(/-/g, '_') === 'delivery'

  if (!selectedMemberId && memberOptions.length === 0 && !memberSearchEmpty) {
    return null
  }

  return (
    <>
      {selectedMemberId && selectedMemberDetail ? (
        <div
          className={cn(
            'overflow-hidden rounded-xl border shadow-sm transition-colors',
            compact ? 'mt-1' : 'mt-3',
            posTierCardClass(tierCode)
          )}
        >
          <div className={cn('flex items-start gap-2.5', cardPad)}>
            <div
              className={cn(
                'flex shrink-0 items-center justify-center border border-border/40 bg-background/70 shadow-inner',
                gemBox
              )}
            >
              <TierFacetedGemIcon family={tierFamily} size={gemSize} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 pr-0.5">
                <p className={cn('leading-tight text-foreground', nameClass)}>
                  {selectedMemberDetail.name}
                </p>
                {selectedMemberTierLabel ? (
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1 ring-inset sm:text-[10px]',
                      posTierBadgeClass(tierCode)
                    )}
                  >
                    {selectedMemberTierLabel}
                  </span>
                ) : null}
              </div>
              {(selectedMemberDetail.memberNo || selectedMemberDetail.phone) && (
                <div
                  className={cn(
                    'mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-muted-foreground',
                    compact ? 'text-[10px]' : 'text-xs'
                  )}
                >
                  {selectedMemberDetail.memberNo ? (
                    <span className="inline-flex items-center gap-0.5 font-mono tabular-nums">
                      <Hash className="h-2.5 w-2.5 shrink-0 opacity-55" aria-hidden />
                      {selectedMemberDetail.memberNo}
                    </span>
                  ) : null}
                  {selectedMemberDetail.phone ? (
                    <span className="inline-flex items-center gap-0.5 tabular-nums">
                      <Phone className="h-2.5 w-2.5 shrink-0 opacity-55" aria-hidden />
                      {selectedMemberDetail.phone}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div
            className={cn(
              'flex items-center justify-between gap-2 border-t border-border/45 bg-background/35 px-2 py-1.5',
              compact ? 'sm:px-2.5' : 'px-3 py-2'
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                'rounded-lg px-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
                compact ? 'h-7 text-[10px]' : 'h-8 text-xs'
              )}
              onClick={onClearMember}
            >
              <UserX className={cn('shrink-0', compact ? 'mr-1 h-3 w-3' : 'mr-1.5 h-3.5 w-3.5')} aria-hidden />
              {t('posMemberNone') || '비회원'}
            </Button>
            {tierDiscountAmt > 0 ? (
              <p
                className={cn(
                  'text-right font-medium leading-tight text-violet-800 dark:text-violet-200',
                  compact ? 'text-[10px]' : 'text-[11px]'
                )}
              >
                {tr('posTierDiscountExpected', '등급 할인 예상')}: -{formatBahtNum(tierDiscountAmt)} ฿ (
                {(selectedMemberTierDiscountRate * 100).toFixed(1)}%)
              </p>
            ) : isDeliveryOrder && selectedMemberId ? (
              <p
                className={cn(
                  'text-right font-medium leading-tight text-muted-foreground',
                  compact ? 'text-[10px]' : 'text-[11px]'
                )}
              >
                {tr(
                  'posTierDiscountDeliveryBlocked',
                  '배달 주문: 포인트만 적립 (등급 할인 없음)'
                )}
              </p>
            ) : null}
          </div>
        </div>
      ) : memberOptions.length > 0 ? (
        <div className={cn('flex flex-wrap items-center gap-1', compact ? 'mt-1' : 'mt-2 gap-1.5')}>
          {memberOptions.map((m) => (
            <Button
              key={m.value}
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                'max-w-full rounded-lg px-2 text-xs',
                compact ? 'h-7' : 'h-8 px-2.5'
              )}
              onClick={() => onSelectMember(m.value)}
            >
              <span className="truncate">{m.label}</span>
            </Button>
          ))}
        </div>
      ) : null}

      {alternateOptions.length > 0 ? (
        <div className={compact ? 'mt-1' : 'mt-2'}>
          <p
            className={cn(
              'mb-1 font-medium uppercase tracking-wide text-muted-foreground',
              compact ? 'text-[9px]' : 'mb-1.5 text-[10px]'
            )}
          >
            {tr('posMemberOtherMatches', '다른 검색 결과')}
          </p>
          <div className={cn('flex flex-wrap items-center', compact ? 'gap-1' : 'gap-1.5')}>
            {alternateOptions.map((m) => (
              <Button
                key={m.value}
                type="button"
                size="sm"
                variant="outline"
                className={cn(
                  'max-w-full rounded-lg px-2 text-xs',
                  compact ? 'h-7' : 'h-8 px-2.5'
                )}
                onClick={() => onSelectMember(m.value)}
              >
                <span className="truncate">{m.label}</span>
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {memberSearchEmpty ? (
        <p className={cn('text-amber-600', compact ? 'mt-1 text-[10px]' : 'mt-2 text-xs')}>
          {t('posMemberSearchEmpty') ||
            '검색 결과가 없습니다. ERP 회원관리에서 회원을 먼저 등록해 주세요.'}
        </p>
      ) : null}
    </>
  )
}

type PosPaymentMemberBlockProps = {
  memberKeyword: string
  onMemberKeywordChange: (value: string) => void
  onMemberKeywordKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onSearch: () => void
  membersLoading: boolean
  memberScanFlash: PosScanFieldFlash
  memberScanInputRef: React.RefObject<HTMLInputElement | null>
  selectedMemberId: string
  selectedMemberDetail: PosPaymentMemberDetail | null | undefined
  selectedMemberTierLabel: string
  memberOptions: PosPaymentMemberOption[]
  onSelectMember: (memberId: string) => void
  onClearMember: () => void
  tierDiscountAmt: number
  selectedMemberTierDiscountRate: number
  memberSearchEmpty: boolean
  orderType?: string | null
  t: (key: string) => string
  tr: (key: string, fallback: string) => string
}

export function PosPaymentMemberBlock({
  memberKeyword,
  onMemberKeywordChange,
  onMemberKeywordKeyDown,
  onSearch,
  membersLoading,
  memberScanFlash,
  memberScanInputRef,
  selectedMemberId,
  selectedMemberDetail,
  selectedMemberTierLabel,
  memberOptions,
  onSelectMember,
  onClearMember,
  tierDiscountAmt,
  selectedMemberTierDiscountRate,
  memberSearchEmpty,
  orderType,
  t,
  tr,
}: PosPaymentMemberBlockProps) {
  return (
    <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-50/80 via-card to-card p-3 shadow-sm dark:from-amber-950/20 dark:via-card dark:to-card">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex shrink-0 items-center gap-2 sm:min-w-[7.5rem]">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-200">
            <Users className="h-4 w-4" />
          </div>
          <p className="text-sm font-semibold leading-tight">
            {t('posPaymentSectionMember') || t('posMember') || '회원 검색'}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Input
            ref={memberScanInputRef}
            lang="en"
            data-pos-member-scan="1"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            placeholder={t('posMemberSearchPh') || '회원번호/이름/번호'}
            value={memberKeyword}
            onChange={(e) => onMemberKeywordChange(e.target.value)}
            onKeyDown={onMemberKeywordKeyDown}
            className={cn(
              'h-10 min-w-0 flex-1 rounded-xl text-sm [ime-mode:disabled]',
              posScanFieldFlashClass(memberScanFlash)
            )}
            style={{ imeMode: 'disabled' }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-10 shrink-0 rounded-xl px-4"
            onClick={onSearch}
            disabled={membersLoading}
          >
            {membersLoading ? '...' : t('posSearch') || '검색'}
          </Button>
        </div>
      </div>

      <PosMemberResultsSection
        selectedMemberId={selectedMemberId}
        selectedMemberDetail={selectedMemberDetail}
        selectedMemberTierLabel={selectedMemberTierLabel}
        memberOptions={memberOptions}
        onSelectMember={onSelectMember}
        onClearMember={onClearMember}
        tierDiscountAmt={tierDiscountAmt}
        selectedMemberTierDiscountRate={selectedMemberTierDiscountRate}
        memberSearchEmpty={memberSearchEmpty}
        orderType={orderType}
        t={t}
        tr={tr}
      />
    </div>
  )
}
