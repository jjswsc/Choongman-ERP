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
import { appAlert } from '@/lib/app-message'
import { savePosDrawerPin, getPosPrinterSettings } from '@/lib/api-client'
import { isValidPosDrawerPin } from '@/lib/pos-drawer-pin'
import { translateApiMessage } from '@/lib/translate-api-message'

export type PosDrawerPinSettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeCode: string
  canManage: boolean
  onSaved?: () => void
}

function PinField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        inputMode="numeric"
        maxLength={6}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="••••••"
        className="text-center tracking-[0.35em]"
        disabled={disabled}
      />
    </div>
  )
}

/** 운영관리 — 금전 서랍 6자리 PIN 등록·변경 */
export function PosDrawerPinSettingsDialog({
  open,
  onOpenChange,
  storeCode,
  canManage,
  onSaved,
}: PosDrawerPinSettingsDialogProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [loading, setLoading] = React.useState(false)
  const [configured, setConfigured] = React.useState(false)
  const [currentPin, setCurrentPin] = React.useState('')
  const [newPin, setNewPin] = React.useState('')
  const [confirmPin, setConfirmPin] = React.useState('')

  React.useEffect(() => {
    if (!open || !storeCode.trim()) return
    let cancel = false
    void getPosPrinterSettings({ storeCode: storeCode.trim() }).then((s) => {
      if (cancel) return
      setConfigured(Boolean(s.drawerPinConfigured))
    })
    return () => {
      cancel = true
    }
  }, [open, storeCode])

  React.useEffect(() => {
    if (!open) {
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
    }
  }, [open])

  const handleSave = async () => {
    if (!canManage || !storeCode.trim()) return
    if (!isValidPosDrawerPin(newPin)) {
      await appAlert(t('posDrawerPinInvalidFormat') || 'PIN은 6자리 숫자여야 합니다.')
      return
    }
    if (newPin !== confirmPin) {
      await appAlert(t('posDrawerPinMismatch') || '새 PIN과 확인 PIN이 일치하지 않습니다.')
      return
    }
    if (configured && !isValidPosDrawerPin(currentPin)) {
      await appAlert(t('posDrawerPinCurrentRequired') || '현재 PIN을 입력하세요.')
      return
    }
    setLoading(true)
    try {
      const res = await savePosDrawerPin({
        storeCode: storeCode.trim(),
        newPin,
        ...(configured ? { currentPin } : {}),
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || t('msg_save_failed') || '저장에 실패했습니다.')
        return
      }
      await appAlert(t('posDrawerPinSaved') || '금전 서랍 PIN이 저장되었습니다.')
      onSaved?.()
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  const handleClear = async () => {
    if (!canManage || !storeCode.trim() || !configured) return
    if (!isValidPosDrawerPin(currentPin)) {
      await appAlert(t('posDrawerPinCurrentRequired') || '현재 PIN을 입력하세요.')
      return
    }
    setLoading(true)
    try {
      const res = await savePosDrawerPin({
        storeCode: storeCode.trim(),
        clearPin: true,
        currentPin,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || t('msg_save_failed') || '저장에 실패했습니다.')
        return
      }
      await appAlert(t('posDrawerPinCleared') || '금전 서랍 PIN이 해제되었습니다.')
      onSaved?.()
      onOpenChange(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('posDrawerPinManageTitle') || '금전 서랍 PIN 관리'}</DialogTitle>
          <DialogDescription>
            {t('posDrawerPinManageBody') ||
              '6자리 PIN을 설정하면 현금 결제 자동 오픈을 제외한 돈통 열기 시 PIN이 필요합니다.'}
          </DialogDescription>
        </DialogHeader>
        {!canManage ? (
          <p className="py-2 text-sm text-muted-foreground">
            {t('posDrawerPinManageNoPermission') || 'PIN 변경은 매장 관리자만 할 수 있습니다.'}
          </p>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <p className="text-xs text-muted-foreground">
              {configured
                ? t('posDrawerPinConfiguredHint') || 'PIN이 설정되어 있습니다. 변경하려면 현재 PIN을 입력하세요.'
                : t('posDrawerPinNotConfiguredHint') || '아직 PIN이 없습니다. 새 PIN을 등록하세요.'}
            </p>
            {configured ? (
              <PinField
                id="drawer-current-pin"
                label={t('posDrawerPinCurrentLabel') || '현재 PIN'}
                value={currentPin}
                onChange={setCurrentPin}
                disabled={loading}
              />
            ) : null}
            <PinField
              id="drawer-new-pin"
              label={t('posDrawerPinNewLabel') || '새 PIN'}
              value={newPin}
              onChange={setNewPin}
              disabled={loading}
            />
            <PinField
              id="drawer-confirm-pin"
              label={t('posDrawerPinConfirmLabel') || '새 PIN 확인'}
              value={confirmPin}
              onChange={setConfirmPin}
              disabled={loading}
            />
          </div>
        )}
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {canManage && configured ? (
            <Button type="button" variant="destructive" onClick={() => void handleClear()} disabled={loading}>
              {t('posDrawerPinClear') || 'PIN 해제'}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              {t('cancel') || '취소'}
            </Button>
            {canManage ? (
              <Button type="button" onClick={() => void handleSave()} disabled={loading}>
                {loading ? '...' : t('save') || '저장'}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
