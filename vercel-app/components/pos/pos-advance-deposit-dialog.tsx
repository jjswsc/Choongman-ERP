'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getMembers, type Member } from '@/lib/api-client'
import {
  coercePosDepositTender,
  type PosDepositTender,
} from '@/lib/pos-deposit-domain'

export type PosAdvanceDepositSubmit = {
  depositAmt: number
  guestPhone: string
  guestName: string
  depositTender: PosDepositTender
  memberId?: number
}

export function PosAdvanceDepositDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  t: (k: string) => string
  busy?: boolean
  initialMemberId?: number
  initialMemberName?: string
  initialMemberPhone?: string
  onSubmit: (payload: PosAdvanceDepositSubmit) => void | Promise<void>
}) {
  const { open, onOpenChange, t, busy, onSubmit } = props
  const [amount, setAmount] = useState('')
  const [phone, setPhone] = useState(props.initialMemberPhone ?? '')
  const [name, setName] = useState(props.initialMemberName ?? '')
  const [memberId, setMemberId] = useState<number | undefined>(
    props.initialMemberId && props.initialMemberId > 0 ? props.initialMemberId : undefined
  )
  const [memberLabel, setMemberLabel] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [hits, setHits] = useState<Member[]>([])
  const [searching, setSearching] = useState(false)
  const [tender, setTender] = useState<PosDepositTender>('cash')

  const depositAmt = Math.max(0, Number(amount) || 0)
  const canSave =
    depositAmt > 0.02 &&
    (Boolean(memberId) || (phone.replace(/\D/g, '').length >= 8 && name.trim().length > 0)) &&
    !busy

  const selectedHint = useMemo(() => {
    if (memberId) return memberLabel || name || t('posDepositMemberSelected') || '회원'
    return ''
  }, [memberId, memberLabel, name, t])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setHits([])
          setSearchQ('')
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-md gap-4">
        <DialogHeader>
          <DialogTitle>{t('posDepositButton') || 'มัดจำ'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {t('posDepositHint') ||
              '메뉴와 상관없이 예약금만 걸어 둡니다. 방문 결제 때 회원 또는 같은 전화로 차감합니다.'}
          </p>
          <div className="grid gap-1">
            <Label>{t('posDepositMemberSearch') || '회원 검색'}</Label>
            <div className="flex gap-2">
              <Input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder={t('posDepositMemberSearchPh') || '이름·전화·회원번호'}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  const q = searchQ.trim()
                  if (q.length < 2) return
                  setSearching(true)
                  void getMembers({ q, limit: 8 })
                    .then((rows) => setHits(rows))
                    .finally(() => setSearching(false))
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={searching || searchQ.trim().length < 2}
                onClick={() => {
                  const q = searchQ.trim()
                  if (q.length < 2) return
                  setSearching(true)
                  void getMembers({ q, limit: 8 })
                    .then((rows) => setHits(rows))
                    .finally(() => setSearching(false))
                }}
              >
                {t('posDepositHistorySearch') || '조회'}
              </Button>
            </div>
            {hits.length > 0 && (
              <div className="max-h-28 overflow-auto rounded-md border bg-background text-xs">
                {hits.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="flex w-full justify-between gap-2 px-2 py-1.5 text-left hover:bg-muted"
                    onClick={() => {
                      setMemberId(m.id)
                      setMemberLabel(`${m.name || m.fullName || ''} ${m.memberNo || ''}`.trim())
                      setName(String(m.name || m.fullName || '').trim())
                      setPhone(String(m.phone || '').trim())
                      setHits([])
                    }}
                  >
                    <span>{m.name || m.fullName || m.memberNo}</span>
                    <span className="text-muted-foreground">{m.phone}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedHint ? (
              <div className="flex items-center justify-between gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                <span>{selectedHint}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7"
                  onClick={() => {
                    setMemberId(undefined)
                    setMemberLabel('')
                  }}
                >
                  {t('posDepositClearMember') || '비회원으로'}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t('posDepositGuestHint') || '비회원은 이름과 전화를 직접 입력합니다.'}
              </p>
            )}
          </div>
          <div className="grid gap-1">
            <Label>{t('posDepositAmount') || '예약금'}</Label>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="grid gap-1">
            <Label>{t('posDepositPhone') || '전화'}</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              disabled={Boolean(memberId)}
            />
          </div>
          <div className="grid gap-1">
            <Label>{t('posDepositGuestName') || '이름'}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={Boolean(memberId)}
            />
          </div>
          <div className="grid gap-1">
            <Label>{t('posDepositTender') || '수령 수단'}</Label>
            <div className="flex flex-wrap gap-2">
              {(['cash', 'qr', 'transfer'] as const).map((key) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={tender === key ? 'default' : 'outline'}
                  onClick={() => setTender(key)}
                >
                  {key === 'cash'
                    ? t('posPaymentCash') || '현금'
                    : key === 'qr'
                      ? t('posPaymentQrCode') || 'QR'
                      : t('posDepositTenderTransfer') || '이체'}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('cancel') || '취소'}
          </Button>
          <Button
            type="button"
            disabled={!canSave}
            onClick={() => {
              void onSubmit({
                depositAmt,
                guestPhone: phone,
                guestName: name.trim(),
                depositTender: coercePosDepositTender(tender),
                ...(memberId ? { memberId } : {}),
              })
            }}
          >
            {busy ? t('posPaymentProcessing') || '처리 중…' : t('posDepositSave') || '예약금 저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
