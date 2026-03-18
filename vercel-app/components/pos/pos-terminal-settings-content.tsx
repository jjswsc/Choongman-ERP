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
import {
  getPosPrinterSettings,
  clearPosMainDevice,
  getPosDevices,
  revokePosDevice,
  setPosMainDevice,
  useStoreList,
  type PosDeviceItem,
} from '@/lib/api-client'
import { isOfficeRole } from '@/lib/permissions'
import { Monitor, Smartphone, RefreshCw, UserX } from 'lucide-react'

export function PosTerminalSettingsContent() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()

  const [storeCode, setStoreCode] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [clearing, setClearing] = React.useState(false)
  const [mainDeviceToken, setMainDeviceToken] = React.useState<string | null>(null)
  const [devices, setDevices] = React.useState<PosDeviceItem[]>([])
  const [actionToken, setActionToken] = React.useState<string | null>(null)

  const canSearchAll = isOfficeRole(auth?.role || '')
  const effectiveStore = canSearchAll && storeCode ? storeCode : auth?.store || ''

  const loadData = React.useCallback(() => {
    if (!effectiveStore) return
    setLoading(true)
    Promise.all([
      getPosPrinterSettings({ storeCode: effectiveStore }),
      getPosDevices({ storeCode: effectiveStore }),
    ])
      .then(([settings, devRes]) => {
        setMainDeviceToken(settings.mainDeviceToken ?? null)
        setDevices(devRes.devices ?? [])
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
          loadData()
        } else {
          alert((res as { message?: string }).message || '해제에 실패했습니다.')
        }
      })
      .finally(() => setClearing(false))
  }

  const maskToken = (token: string) =>
    token.length > 10 ? `${token.slice(0, 6)}…${token.slice(-4)}` : '****'

  const formatLastSeen = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' })
    } catch {
      return iso
    }
  }

  const handleSetMain = (deviceToken: string) => {
    if (!effectiveStore) return
    if (!confirm(t('posTerminalSetMainConfirm') || '이 기기를 메인 포스로 지정하시겠습니까?')) return
    setActionToken(deviceToken)
    setPosMainDevice({ storeCode: effectiveStore, deviceToken })
      .then((res) => {
        if (res.success) {
          setMainDeviceToken(deviceToken)
          loadData()
        } else {
          alert((res as { message?: string }).message || '지정에 실패했습니다.')
        }
      })
      .finally(() => setActionToken(null))
  }

  const handleRevoke = (deviceToken: string) => {
    if (!effectiveStore) return
    if (!confirm(t('posTerminalRevokeConfirm') || '이 기기의 접속을 해제하시겠습니까? 해당 기기는 목록에서 제거되며, 다시 터미널에 접속하면 목록에 나타납니다.')) return
    setActionToken(deviceToken)
    revokePosDevice({ storeCode: effectiveStore, deviceToken })
      .then((res) => {
        if (res.success) {
          if (mainDeviceToken === deviceToken) setMainDeviceToken(null)
          loadData()
        } else {
          alert((res as { message?: string }).message || '해제에 실패했습니다.')
        }
      })
      .finally(() => setActionToken(null))
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

      {/* 현재 등록 현황: 메인 / 주문 단말 */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <h4 className="text-sm font-semibold">
          {t('posTerminalStatusTitle') || '현재 등록 현황'}
        </h4>
        {loading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : (
          <dl className="grid gap-2 text-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <dt className="font-medium text-muted-foreground min-w-[6rem]">
                {t('posTerminalStatusMainLabel') || '메인 포스'}
              </dt>
              <dd className="flex flex-wrap items-center gap-2">
                {mainDeviceToken ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 text-foreground">
                      <Smartphone className="h-3.5 w-3.5 text-primary" />
                      {t('posTerminalStatusMainRegistered') || '등록됨'}
                    </span>
                    <span className="text-muted-foreground font-mono text-xs">
                      ({t('posTerminalStatusMainDeviceId') || '등록된 기기 ID'}: {mainDeviceToken.length > 10 ? `${mainDeviceToken.slice(0, 6)}…${mainDeviceToken.slice(-4)}` : '****'})
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearMain}
                      disabled={clearing}
                    >
                      {t('posTerminalClearMain') || '메인 포스 해제'}
                    </Button>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    {t('posTerminalStatusMainNone') || '미등록'}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-2">
              <dt className="font-medium text-muted-foreground min-w-[6rem]">
                {t('posTerminalStatusOrderLabel') || '주문 단말'}
              </dt>
              <dd className="text-muted-foreground">
                {t('posTerminalStatusOrderDesc') || '별도 등록 없음. 메인으로 등록되지 않은 기기는 모두 주문 단말로 동작합니다.'}
              </dd>
            </div>
          </dl>
        )}
      </div>

      {/* 접속 기기 목록: 조회·메인 지정·접속 해제 */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">
            {t('posTerminalDeviceListTitle') || '접속 기기 목록'}
          </h4>
          <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t('posTerminalRefresh') || '새로고침'}
          </Button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">…</p>
        ) : devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('posTerminalDeviceListEmpty') || '접속한 기기가 없습니다. 포스 터미널(/pos/terminal)을 연 기기가 목록에 표시됩니다.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-muted-foreground">
                    {t('posTerminalStatusMainDeviceId') || '기기 ID'}
                  </th>
                  <th className="text-left py-2 font-medium text-muted-foreground">
                    {t('posTerminalDeviceListRole') || '구분'}
                  </th>
                  <th className="text-left py-2 font-medium text-muted-foreground">
                    {t('posTerminalDeviceListLastSeen') || '마지막 접속'}
                  </th>
                  <th className="text-right py-2 font-medium text-muted-foreground">
                    {t('posTerminalDeviceListActions') || '작업'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.deviceToken} className="border-b border-border/50">
                    <td className="py-2 font-mono text-xs">{maskToken(d.deviceToken)}</td>
                    <td className="py-2">
                      {d.isMain ? (
                        <span className="inline-flex items-center gap-1 text-primary">
                          <Smartphone className="h-3.5 w-3.5" />
                          {t('posTerminalRoleMain') || '메인'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {t('posTerminalRoleOrder') || '주문'}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-muted-foreground">{formatLastSeen(d.lastSeenAt)}</td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-1">
                        {!d.isMain && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!!actionToken}
                            onClick={() => handleSetMain(d.deviceToken)}
                          >
                            {t('posTerminalSetMain') || '메인으로 지정'}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!!actionToken}
                          onClick={() => handleRevoke(d.deviceToken)}
                          className="text-destructive hover:text-destructive"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          {t('posTerminalRevoke') || '접속 해제'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Monitor className="h-4 w-4" />
          {t('posTerminalMainDeviceTitle') || '메인 포스 지정'}
        </h4>
        <p className="text-xs text-muted-foreground">
          {t('posTerminalMainDeviceHint') || '매장당 1대만 메인 포스로 등록됩니다. 메인 포스에서만 주문 수신 시 주방/영수증 자동 인쇄가 됩니다.'}
        </p>
        {!loading && (
          <p className="text-sm text-muted-foreground">
            {mainDeviceToken
              ? (t('posTerminalMainDeviceRegistered') || '메인 포스가 등록되어 있습니다.')
              : (t('posTerminalMainDeviceNone') || '등록된 메인 포스 없음. 포스 터미널 화면에서 "메인" 버튼으로 지정할 수 있습니다.')}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-dashed bg-muted/20 p-4 space-y-3">
        <h4 className="text-sm font-semibold">
          {t('posTerminalHowToTitle') || '사용 방법'}
        </h4>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
          <li>
            {t('posTerminalHowToMain') || '메인 포스(프린터 연결된 1대): 포스 터미널 화면(/pos/terminal)을 해당 기기에서 열고, 상단 오른쪽 "메인" 버튼을 누르면 이 기기가 메인 포스로 등록됩니다. 주문 단말에서 들어온 주문이 이 기기에서 자동 인쇄됩니다.'}
          </li>
          <li>
            {t('posTerminalHowToOthers') || '나머지 단말(주문 전용): 별도 설정 없이 같은 포스 터미널 화면을 열어 사용하면 됩니다. 기본이 "주문" 모드이며, 주문만 입력하고 인쇄는 메인 포스에서만 나갑니다. 메인 포스를 바꾸려면 관리자에서 "메인 포스 해제" 후 다른 기기에서 "메인" 버튼을 누르세요.'}
          </li>
        </ul>
      </div>
    </div>
  )
}
