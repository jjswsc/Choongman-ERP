'use client'

import * as React from 'react'
import { Search, UserPlus, Users } from 'lucide-react'
import { appAlert } from '@/lib/app-message'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { attachPosOrderMember, getMembers, type Member, type PosOrder } from '@/lib/api-client'
import { useLang } from '@/lib/lang-context'
import { tr as i18nTr, useT } from '@/lib/i18n'
import { addDaysYmd, getPosBusinessDateStr } from '@/lib/pos-business-day'
import { isPosOrderMergedAbsorbRow } from '@/lib/pos-order-merge'
import { resolveAttachMemberAfterPayEligibility } from '@/lib/pos-attach-member-after-pay'
import { formatMemberPointsDisplay } from '@/lib/member-points-math'
import { ADMIN_BTN_XS_CN, ADMIN_DIALOG_SCROLL_CN } from '@/lib/admin-ui-standards'
import { cn } from '@/lib/utils'

function eligibilityForReceiptOrder(order: PosOrder) {
  const createdAt = order.createdAt ? new Date(order.createdAt) : null
  const orderBd =
    createdAt && !Number.isNaN(createdAt.getTime()) ? getPosBusinessDateStr(createdAt) : ''
  const todayBd = getPosBusinessDateStr(new Date())
  return resolveAttachMemberAfterPayEligibility({
    status: order.status,
    total: order.total,
    paymentCash: order.paymentCash,
    paymentCard: order.paymentCard,
    paymentQr: order.paymentQr,
    paymentOther: order.paymentOther,
    paymentDeliveryApp: order.paymentDeliveryApp,
    memberId: order.memberId,
    memberNo: order.memberNo,
    pointEarned: order.pointEarned,
    pointUsed: order.pointUsed,
    mergedAbsorb: isPosOrderMergedAbsorbRow(order),
    orderBusinessDay: orderBd,
    todayBusinessDay: todayBd,
    yesterdayBusinessDay: todayBd ? addDaysYmd(todayBd, -1) : '',
  })
}

function memberLabel(row: Member): string {
  const name = String(row.fullName || row.name || '').trim()
  const no = String(row.memberNo || '').trim()
  const phone = String(row.phone || '').trim()
  return [name || no, no && name ? no : '', phone].filter(Boolean).join(' · ')
}

export function PosReceiptAttachMemberBlock({
  order,
  online,
  onApplied,
}: {
  order: PosOrder
  online: boolean
  onApplied: () => void
}) {
  const t = useT(useLang().lang)
  const eligibility = eligibilityForReceiptOrder(order)
  const linkedNo = String(order.memberNo || '').trim()
  const earned = Number(order.pointEarned || 0)
  const showLinked = Number(order.memberId || 0) > 0 || Boolean(linkedNo) || earned > 0
  const showAction = eligibility.canAttach || eligibility.canRetry
  const [open, setOpen] = React.useState(false)
  const [keyword, setKeyword] = React.useState('')
  const [searching, setSearching] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [empty, setEmpty] = React.useState(false)
  const [results, setResults] = React.useState<Member[]>([])
  const [picked, setPicked] = React.useState<Member | null>(null)

  const resetDialog = React.useCallback(() => {
    setKeyword('')
    setSearching(false)
    setSaving(false)
    setEmpty(false)
    setResults([])
    setPicked(null)
  }, [])

  const openDialog = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!online) {
      void appAlert(t('posReceiptPayCorrectOffline'))
      return
    }
    resetDialog()
    setOpen(true)
  }

  const searchMembers = async () => {
    const q = keyword.trim()
    if (!q) {
      setResults([])
      setEmpty(false)
      setPicked(null)
      return
    }
    setSearching(true)
    try {
      const rows = await getMembers({ q, limit: 12 })
      const list = Array.isArray(rows) ? rows : []
      setResults(list)
      setEmpty(list.length === 0)
      setPicked(list.length === 1 ? list[0] : null)
    } catch (err) {
      setResults([])
      setEmpty(true)
      setPicked(null)
      await appAlert(i18nTr(t, 'posUnexpectedErrorDetail', { detail: String(err) }))
    } finally {
      setSearching(false)
    }
  }

  const resolveErrorMessage = (code: string) => {
    if (code === 'today_only' || code === 'outside_window') return t('posReceiptAttachMemberTodayOnly')
    if (code === 'status' || code === 'status_not_correctable' || code === 'not_paid') {
      return t('posReceiptAttachMemberStatus')
    }
    if (code === 'already_earned') return t('posReceiptAttachMemberAlready')
    if (code === 'already_member') return t('posReceiptAttachMemberAlreadyLinked')
    if (code === 'member_inactive') return t('posReceiptAttachMemberInactive')
    if (code === 'member_not_found') return t('posReceiptAttachMemberNotFound')
    if (code === 'member_required' || code === 'id_required') return t('posReceiptAttachMemberNeedPick')
    if (code === 'forbidden_store') return t('posReceiptPayCorrectForbidden')
    if (code === 'Unauthorized' || code.includes('인증이 필요합니다')) {
      return t('posReceiptPayCorrectUnauthorized')
    }
    if (code === 'merged') return t('posOrderStatusMergedAbsorb')
    return code
  }

  const confirmEarn = async () => {
    const memberId = Number(picked?.id || (eligibility.canRetry ? order.memberId : 0) || 0)
    if (memberId <= 0) {
      await appAlert(t('posReceiptAttachMemberNeedPick'))
      return
    }
    setSaving(true)
    try {
      const res = await attachPosOrderMember({ id: order.id, memberId })
      if (!res.success) {
        await appAlert(resolveErrorMessage(String(res.message || '')))
        return
      }
      const points = formatMemberPointsDisplay(res.pointEarned || 0)
      const name = String(res.memberName || picked?.fullName || picked?.name || '').trim()
      await appAlert(
        Number(res.pointEarned || 0) > 0
          ? i18nTr(t, 'posReceiptAttachMemberSaved', { name: name || res.memberNo || '', points })
          : i18nTr(t, 'posReceiptAttachMemberSavedZero', { name: name || res.memberNo || '' })
      )
      setOpen(false)
      resetDialog()
      onApplied()
    } catch (err) {
      await appAlert(i18nTr(t, 'posUnexpectedErrorDetail', { detail: String(err) }))
    } finally {
      setSaving(false)
    }
  }

  if (!showAction && !showLinked) return null

  const retryMemberLabel = [linkedNo, earned > 0 ? `+${formatMemberPointsDisplay(earned)} P` : '']
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-2',
          showAction
            ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/25'
            : 'border-transparent bg-muted/30'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <Users className="h-3.5 w-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" />
          <span className="min-w-0 truncate font-medium text-foreground">
            {t('posMember') || '회원'}
            {showLinked ? ` · ${retryMemberLabel || t('posReceiptAttachMemberLinkedUnknown')}` : ''}
            {!showLinked && showAction ? ` · ${t('posReceiptAttachMemberNone')}` : ''}
          </span>
        </div>
        {showAction ? (
          <Button
            type="button"
            size="sm"
            className={cn(ADMIN_BTN_XS_CN, 'bg-emerald-600 text-white hover:bg-emerald-700')}
            onClick={openDialog}
          >
            <UserPlus className="h-3 w-3" />
            {t('posReceiptAttachMember')}
          </Button>
        ) : null}
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setOpen(false)
            resetDialog()
          }
        }}
      >
        <DialogContent
          className={cn(ADMIN_DIALOG_SCROLL_CN, 'max-w-md')}
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>{t('posReceiptAttachMember')}</DialogTitle>
            <DialogDescription>{t('posReceiptAttachMemberHint')}</DialogDescription>
          </DialogHeader>

          {eligibility.canRetry && Number(order.memberId || 0) > 0 ? (
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <div className="font-medium">
                {t('posMemberNo')}: {linkedNo}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {t('posReceiptAttachMemberRetryHint')}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void searchMembers()
                    }
                  }}
                  placeholder={t('posMemberSearchPh')}
                  className="h-10"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 shrink-0 px-3"
                  onClick={() => void searchMembers()}
                  disabled={searching}
                >
                  <Search className="h-4 w-4" />
                  {searching ? '...' : t('posSearch')}
                </Button>
              </div>
              {empty ? (
                <p className="text-xs text-muted-foreground">{t('posMemberSearchEmpty')}</p>
              ) : null}
              {results.length > 0 ? (
                <div className="max-h-52 space-y-1 overflow-y-auto">
                  {results.map((row) => {
                    const selected = Number(picked?.id || 0) === Number(row.id)
                    return (
                      <button
                        key={row.id}
                        type="button"
                        className={cn(
                          'w-full rounded-lg border px-3 py-2 text-left text-sm',
                          selected
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
                            : 'hover:bg-muted/50'
                        )}
                        onClick={() => setPicked(row)}
                      >
                        <div className="font-medium">{memberLabel(row)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatMemberPointsDisplay(row.pointBalance || 0)} P
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false)
                resetDialog()
              }}
              disabled={saving}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => void confirmEarn()}
              disabled={saving || Number(picked?.id || (eligibility.canRetry ? order.memberId : 0) || 0) <= 0}
            >
              {saving ? '...' : t('posReceiptAttachMemberConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
