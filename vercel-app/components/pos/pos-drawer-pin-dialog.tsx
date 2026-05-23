'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'

export type PosDrawerPinDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (pin: string) => void | Promise<void>
  loading?: boolean
  errorMessage?: string | null
}

/** 금전 서랍 열기 — 6자리 PIN 입력 */
export function PosDrawerPinDialog({
  open,
  onOpenChange,
  onSubmit,
  loading = false,
  errorMessage = null,
}: PosDrawerPinDialogProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [pin, setPin] = React.useState('')

  React.useEffect(() => {
    if (!open) setPin('')
  }, [open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pin.trim().length !== 6 || loading) return
    void onSubmit(pin.trim())
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs sm:max-w-sm">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('posDrawerPinEnterTitle') || '금전 서랍 PIN'}</DialogTitle>
            <DialogDescription>
              {t('posDrawerPinEnterBody') || '돈통을 열려면 6자리 PIN을 입력하세요.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="pos-drawer-pin">{t('posDrawerPinLabel') || 'PIN (6자리)'}</Label>
            <Input
              id="pos-drawer-pin"
              type="password"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              className="text-center text-lg tracking-[0.35em]"
              autoFocus
            />
            {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              {t('cancel') || '취소'}
            </Button>
            <Button type="submit" disabled={loading || pin.length !== 6}>
              {loading ? '...' : t('posDrawerPinConfirm') || '확인'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
