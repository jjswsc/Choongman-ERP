'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { getPosPrinterSettings, clearPosMainDevice, useStoreList } from '@/lib/api-client'
import { isOfficeRole } from '@/lib/permissions'
import { Monitor, Smartphone } from 'lucide-react'

export function PosTerminalSettingsContent() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()

  const [storeCode, setStoreCode] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [clearing, setClearing] = React.useState(false)
  const [mainDeviceToken, setMainDeviceToken] = React.useState<string | null>(null)

  const canSearchAll = isOfficeRole(auth?.role || '')
  const effectiveStore = canSearchAll && storeCode ? storeCode : auth?.store || ''

  const loadData = React.useCallback(() => {
    if (!effectiveStore) return
    setLoading(true)
    getPosPrinterSettings({ storeCode: effectiveStore })
      .then((settings) => {
        setMainDeviceToken(settings.mainDeviceToken ?? null)
      })
      .finally(() => setLoading(false))
  }, [effectiveStore])

  React.useEffect(() => {
    if (canSearchAll && stores.length && !storeCode) {
      setStoreCode(auth?.store || stores[0] || '')
    }
  }, [canSearchAll, stores, auth?.store, storeCode])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const handleClearMain = () => {
    if (!effectiveStore) return
    if (!confirm(t('posTerminalClearMainConfirm') || '등록된 메인 포스를 해제하시겠습니까? 해당 기기에서 다시 등록할 수 있습니다.')) return
    setClearing(true)
    clearPosMainDevice({ storeCode: effectiveStore })
      .then((res) => {
        if (res.success) {
          setMainDeviceToken(null)
        } else {
          alert((res as { message?: string }).message || '해제에 실패했습니다.')
        }
      })
      .finally(() => setClearing(false))
  }

  return (
    <div className="space-y-4">
      {canSearchAll && stores.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium">{t('posSwitchUserStore') || '매장'}</label>
            <Select value={storeCode || (auth?.store ?? '')} onValueChange={(v) => setStoreCode(v)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder={t('posCookingStorePlaceholder') || '매장 선택'} />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
        </div>
      )}

      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Monitor className="h-4 w-4" />
          {t('posTerminalMainDeviceTitle') || '메인 포스 지정'}
        </h4>
        <p className="text-xs text-muted-foreground">
          {t('posTerminalMainDeviceHint') || '매장당 1대만 메인 포스로 등록됩니다. 메인 포스에서만 주문 수신 시 주방/영수증 자동 인쇄가 됩니다.'}
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : mainDeviceToken ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-foreground inline-flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5 text-primary" />
              {t('posTerminalMainDeviceRegistered') || '메인 포스가 등록되어 있습니다.'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearMain}
              disabled={clearing}
            >
              {t('posTerminalClearMain') || '메인 포스 해제'}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('posTerminalMainDeviceNone') || '등록된 메인 포스 없음. 포스 터미널 화면에서 "메인" 버튼으로 지정할 수 있습니다.'}
          </p>
        )}
      </div>
    </div>
  )
}
