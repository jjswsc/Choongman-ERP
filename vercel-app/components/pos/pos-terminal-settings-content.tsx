'use client'
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  updatePosDeviceDisplayLabel,
  useStoreList,
  type PosDeviceItem,
} from '@/lib/api-client'
import { isOfficeRole } from '@/lib/permissions'
import { formatPosDateTimeShort } from '@/lib/pos-datetime-locale'
import { ClipboardCopy, Monitor, Smartphone, RefreshCw, UserX } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/** 마지막 접속 시각이 이 이내면 "최근 접속" 탭 (나머지는 과거 이력) */
const DEVICE_RECENT_LAST_SEEN_MS = 7 * 24 * 60 * 60 * 1000

export function PosTerminalSettingsContent() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()

  const [storeCode, setStoreCode] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [clearing, setClearing] = React.useState(false)
  const [mainDeviceTokens, setMainDeviceTokens] = React.useState<string[]>([])
  const [devices, setDevices] = React.useState<PosDeviceItem[]>([])
  const [actionToken, setActionToken] = React.useState<string | null>(null)
  const [savingLabelToken, setSavingLabelToken] = React.useState<string | null>(null)
  const [labelDrafts, setLabelDrafts] = React.useState<Record<string, string>>({})
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [deviceListTab, setDeviceListTab] = React.useState<'recent' | 'history'>('recent')

  const canSearchAll = isOfficeRole(auth?.role || '')
  const effectiveStore = canSearchAll && storeCode ? storeCode : auth?.store || ''

  const loadData = React.useCallback(() => {
    if (!effectiveStore) {
      setMainDeviceTokens([])
      setDevices([])
      setLoadError(null)
      return
    }
    setLoading(true)
    setLoadError(null)
    Promise.all([
      getPosPrinterSettings({ storeCode: effectiveStore }),
      getPosDevices({ storeCode: effectiveStore }),
    ])
      .then(([settings, devRes]) => {
        const fromApi = Array.isArray(settings.mainDeviceTokens)
          ? settings.mainDeviceTokens.map((x) => String(x || '').trim()).filter(Boolean)
          : []
        const legacy =
          settings.mainDeviceToken != null && String(settings.mainDeviceToken).trim()
            ? [String(settings.mainDeviceToken).trim()]
            : []
        setMainDeviceTokens(fromApi.length > 0 ? fromApi : legacy)
        setDevices(devRes.devices ?? [])
        if (devRes.success === false && devRes.message) {
          setLoadError(devRes.message)
        }
      })
      .catch((e) => {
        setDevices([])
        setMainDeviceTokens([])
        setLoadError(String(e))
      })
      .finally(() => setLoading(false))
  }, [effectiveStore])

  React.useEffect(() => {
    const next: Record<string, string> = {}
    for (const d of devices) {
      next[d.deviceToken] = d.displayLabel ?? ''
    }
    setLabelDrafts(next)
  }, [devices])

  React.useEffect(() => {
    if (canSearchAll && stores.length && !storeCode) {
      setStoreCode(auth?.store || stores[0] || '')
    }
  }, [canSearchAll, stores, auth?.store, storeCode])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  const handleClearMain = async () => {
    if (!effectiveStore) return
    if (
      !(await appConfirm(
        t('posTerminalClearAllMainsConfirm') ||
          '등록된 모든 카운터(메인) 포스를 해제하시겠습니까? 각 기기에서 다시 메인으로 등록할 수 있습니다.'
      ))
    )
      return
    setClearing(true)
    clearPosMainDevice({ storeCode: effectiveStore })
      .then(async (res) => {
        if (res.success) {
          setMainDeviceTokens([])
          loadData()
        } else {
          await appAlert((res as { message?: string }).message || '해제에 실패했습니다.')
        }
      })
      .finally(() => setClearing(false))
  }

  const handleClearOneMain = async (deviceToken: string) => {
    if (!effectiveStore) return
    if (
      !(await appConfirm(
        t('posTerminalClearOneMainConfirm') || '이 기기만 메인(카운터)에서 해제할까요? 다른 메인 포스는 그대로 둡니다.'
      ))
    )
      return
    setActionToken(deviceToken)
    clearPosMainDevice({ storeCode: effectiveStore, deviceToken })
      .then(async (res) => {
        if (res.success) {
          setMainDeviceTokens((prev) => prev.filter((x) => x !== deviceToken))
          loadData()
        } else {
          await appAlert((res as { message?: string }).message || '해제에 실패했습니다.')
        }
      })
      .finally(() => setActionToken(null))
  }

  const maskToken = (token: string) =>
    token.length > 10 ? `${token.slice(0, 6)}…${token.slice(-4)}` : '****'

  const formatLastSeen = (iso: string) => {
    try {
      return formatPosDateTimeShort(new Date(iso), lang)
    } catch {
      return iso
    }
  }

  const { recentDevices, historyDevices } = React.useMemo(() => {
    const cutoff = Date.now() - DEVICE_RECENT_LAST_SEEN_MS
    const recent: PosDeviceItem[] = []
    const history: PosDeviceItem[] = []
    for (const d of devices) {
      const ts = new Date(d.lastSeenAt).getTime()
      if (Number.isNaN(ts)) {
        history.push(d)
        continue
      }
      if (ts >= cutoff) recent.push(d)
      else history.push(d)
    }
    return { recentDevices: recent, historyDevices: history }
  }, [devices])

  const recentDays = Math.round(DEVICE_RECENT_LAST_SEEN_MS / (24 * 60 * 60 * 1000))

  const handleSetMain = async (deviceToken: string) => {
    if (!effectiveStore) return
    if (!(await appConfirm(t('posTerminalSetMainConfirm') || '이 기기를 메인 포스로 지정하시겠습니까?'))) return
    setActionToken(deviceToken)
    setPosMainDevice({ storeCode: effectiveStore, deviceToken })
      .then(async (res) => {
        if (res.success) {
          setMainDeviceTokens((prev) => (prev.includes(deviceToken) ? prev : [...prev, deviceToken]))
          loadData()
        } else {
          await appAlert((res as { message?: string }).message || '지정에 실패했습니다.')
        }
      })
      .finally(() => setActionToken(null))
  }

  const handleSaveDeviceLabel = async (deviceToken: string) => {
    if (!effectiveStore) return
    const raw = labelDrafts[deviceToken] ?? ''
    setSavingLabelToken(deviceToken)
    try {
      const res = await updatePosDeviceDisplayLabel({
        storeCode: effectiveStore,
        deviceToken,
        displayLabel: raw,
      })
      if (res.success) {
        loadData()
      } else {
        await appAlert((res as { message?: string }).message || t('posTerminalLabelSaveFail') || '저장에 실패했습니다.')
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSavingLabelToken(null)
    }
  }

  const handleCopyDeviceId = async (fullToken: string) => {
    try {
      await navigator.clipboard.writeText(fullToken)
      await appAlert(t('posTerminalDeviceIdCopied') || '기기 ID를 복사했습니다.')
    } catch {
      await appAlert(t('posTerminalDeviceIdCopyFail') || '복사에 실패했습니다.')
    }
  }

  const handleRevoke = async (deviceToken: string) => {
    if (!effectiveStore) return
    if (!(await appConfirm(t('posTerminalRevokeConfirm') || '이 기기의 접속을 해제하시겠습니까? 해당 기기는 목록에서 제거되며, 다시 터미널에 접속하면 목록에 나타납니다.'))) return
    setActionToken(deviceToken)
    revokePosDevice({ storeCode: effectiveStore, deviceToken })
      .then(async (res) => {
        if (res.success) {
          setMainDeviceTokens((prev) => prev.filter((x) => x !== deviceToken))
          loadData()
        } else {
          await appAlert((res as { message?: string }).message || '해제에 실패했습니다.')
        }
      })
      .finally(() => setActionToken(null))
  }

  function renderDeviceRows(list: PosDeviceItem[]) {
    return list.map((d) => (
      <tr key={d.deviceToken} className="border-b border-border/50 align-top">
        <td className="py-2 pr-2">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center">
            <Input
              className="h-8 max-w-[11rem] text-xs"
              value={labelDrafts[d.deviceToken] ?? ''}
              onChange={(e) =>
                setLabelDrafts((prev) => ({ ...prev, [d.deviceToken]: e.target.value }))
              }
              placeholder={t('posTerminalDeviceDisplayNamePh') || '예: 카운터 1'}
              maxLength={80}
              disabled={!!savingLabelToken || !!actionToken}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-8 shrink-0"
              disabled={
                !!actionToken ||
                !!savingLabelToken ||
                (labelDrafts[d.deviceToken] ?? '') === (d.displayLabel ?? '')
              }
              onClick={() => handleSaveDeviceLabel(d.deviceToken)}
            >
              {savingLabelToken === d.deviceToken ? '…' : t('posTerminalSaveDeviceLabel') || '이름 저장'}
            </Button>
          </div>
        </td>
        <td className="py-2 pr-2 text-xs text-muted-foreground max-w-[220px]">
          {d.clientHint ? (
            <span className="line-clamp-3 break-words" title={d.clientHint}>
              {d.clientHint}
            </span>
          ) : (
            <span className="opacity-60">—</span>
          )}
        </td>
        <td className="py-2 pr-2">
          <div className="flex flex-wrap items-center gap-1">
            <span className="font-mono text-xs" title={d.deviceToken}>
              {maskToken(d.deviceToken)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-1.5"
              onClick={() => handleCopyDeviceId(d.deviceToken)}
              title={t('posTerminalCopyDeviceId') || '전체 ID 복사'}
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
        <td className="py-2 pr-2">
          {d.isMain ? (
            <span className="inline-flex items-center gap-1 text-primary">
              <Smartphone className="h-3.5 w-3.5" />
              {t('posTerminalRoleMain') || '메인'}
            </span>
          ) : (
            <span className="text-muted-foreground">{t('posTerminalRoleOrder') || '주문'}</span>
          )}
        </td>
        <td className="py-2 pr-2 text-muted-foreground whitespace-nowrap">
          {formatLastSeen(d.lastSeenAt)}
        </td>
        <td className="py-2 text-right">
          <div className="flex justify-end gap-1 flex-wrap">
            {d.isMain ? (
              <Button
                variant="outline"
                size="sm"
                disabled={!!actionToken}
                onClick={() => handleClearOneMain(d.deviceToken)}
              >
                {t('posTerminalUnsetMain') || '메인 해제'}
              </Button>
            ) : (
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
    ))
  }

  function renderDeviceTable(list: PosDeviceItem[]) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[720px]">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-2 font-medium text-muted-foreground w-[200px]">
                {t('posTerminalDeviceDisplayName') || '표시 이름'}
              </th>
              <th className="text-left py-2 pr-2 font-medium text-muted-foreground min-w-[160px]">
                {t('posTerminalDeviceClientHint') || '단말 정보'}
              </th>
              <th className="text-left py-2 pr-2 font-medium text-muted-foreground">
                {t('posTerminalStatusMainDeviceId') || '기기 ID'}
              </th>
              <th className="text-left py-2 pr-2 font-medium text-muted-foreground whitespace-nowrap">
                {t('posTerminalDeviceListRole') || '구분'}
              </th>
              <th className="text-left py-2 pr-2 font-medium text-muted-foreground whitespace-nowrap">
                {t('posTerminalDeviceListLastSeen') || '마지막 접속'}
              </th>
              <th className="text-right py-2 font-medium text-muted-foreground">
                {t('posTerminalDeviceListActions') || '작업'}
              </th>
            </tr>
          </thead>
          <tbody>{renderDeviceRows(list)}</tbody>
        </table>
      </div>
    )
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

      {!effectiveStore && (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
        >
          {t('posTerminalNoStoreHint')}
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <p className="font-medium">{t('posTerminalLoadErrorTitle')}</p>
          <p className="mt-1 font-mono text-xs break-words opacity-90">{loadError}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t('posTerminalDbTableHint')}</p>
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
                {t('posTerminalStatusMainLabel') || '카운터(메인) 포스'}
              </dt>
              <dd className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                {mainDeviceTokens.length > 0 ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 text-foreground">
                      <Smartphone className="h-3.5 w-3.5 text-primary" />
                      {(t('posTerminalStatusMainRegisteredN') || '등록됨 · {{n}}대').replace(
                        '{{n}}',
                        String(mainDeviceTokens.length)
                      )}
                    </span>
                    <ul className="text-muted-foreground font-mono text-xs list-disc list-inside max-w-full">
                      {mainDeviceTokens.map((tok) => (
                        <li key={tok}>{maskToken(tok)}</li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={handleClearMain} disabled={clearing}>
                        {t('posTerminalClearAllMains') || '전체 메인 해제'}
                      </Button>
                    </div>
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
                {t('posTerminalStatusOrderDescMulti') ||
                  '메인으로 등록되지 않은 기기는 주문 단말입니다. 카운터 PC를 여러 대 쓰면 각각 메인으로 등록하면 모두 자동 인쇄를 받습니다.'}
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
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              {t('posTerminalDeviceListEmpty') || '접속한 기기가 없습니다. 포스 터미널(/pos/terminal)을 연 기기가 목록에 표시됩니다.'}
            </p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>{t('posTerminalDeviceListHintStore')}</li>
              <li>{t('posTerminalDeviceListHintPages')}</li>
            </ul>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {t('posTerminalDeviceListNameHint') ||
                '표시 이름은 매장에서만 저장되며, 단말 정보는 기기가 터미널에 접속할 때 자동으로 갱신됩니다.'}
            </p>
            <Tabs
              value={deviceListTab}
              onValueChange={(v) => {
                if (v === 'recent' || v === 'history') setDeviceListTab(v)
              }}
              className="w-full"
            >
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="recent" className="text-xs sm:text-sm">
                  {t('posTerminalDeviceTabRecent') || '최근 접속'}{' '}
                  <span className="text-muted-foreground">({recentDevices.length})</span>
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs sm:text-sm">
                  {t('posTerminalDeviceTabHistory') || '과거 이력'}{' '}
                  <span className="text-muted-foreground">({historyDevices.length})</span>
                </TabsTrigger>
              </TabsList>
              <TabsContent value="recent" className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {(t('posTerminalDeviceRecentHint') || '마지막 접속이 {{days}}일 이내인 기기(하트비트 기준)입니다.').replace(
                    '{{days}}',
                    String(recentDays)
                  )}
                </p>
                {recentDevices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('posTerminalDeviceRecentEmpty') ||
                      '최근 기간에 접속 기록이 있는 기기가 없습니다. 과거 이력 탭을 확인하거나 터미널을 연 기기가 있는지 확인하세요.'}
                  </p>
                ) : (
                  renderDeviceTable(recentDevices)
                )}
              </TabsContent>
              <TabsContent value="history" className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {(t('posTerminalDeviceHistoryHint') || '{{days}}일보다 오래 전에 마지막 접속이 있었던 기기입니다.').replace(
                    '{{days}}',
                    String(recentDays)
                  )}
                </p>
                {historyDevices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t('posTerminalDeviceHistoryEmpty') || '과거 이력에 해당하는 기기가 없습니다.'}
                  </p>
                ) : (
                  renderDeviceTable(historyDevices)
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Monitor className="h-4 w-4" />
          {t('posTerminalMainDeviceTitle') || '메인 포스 지정'}
        </h4>
        <p className="text-xs text-muted-foreground">
          {t('posTerminalMainDeviceHintMulti') ||
            '카운터(프린터 연결) PC를 여러 대 쓰면 각각 메인으로 등록할 수 있습니다. 등록된 모든 메인 기기에서 주문 수신 시 자동 인쇄가 실행됩니다.'}
        </p>
        {!loading && (
          <p className="text-sm text-muted-foreground">
            {mainDeviceTokens.length > 0
              ? (t('posTerminalMainDeviceRegisteredN') || '카운터(메인) 포스 {{n}}대 등록됨.').replace(
                  '{{n}}',
                  String(mainDeviceTokens.length)
                )
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
            {t('posTerminalHowToMainMulti') ||
              '카운터(메인) 포스: /pos/terminal 에서 상단 "메인"을 켭니다. 카운터를 여러 대 쓰면 각 PC에서 같은 방식으로 등록합니다. 등록된 모든 메인에서 주문 알림·자동 인쇄가 실행됩니다.'}
          </li>
          <li>
            {t('posTerminalHowToOthersMulti') ||
              '주문 전용 단말: 메인을 끈 상태로 터미널을 쓰면 됩니다. 특정 카운터만 빼려면 기기 목록에서 "메인 해제"를 누르세요. 전부 해제하려면 "전체 메인 해제"를 사용하세요.'}
          </li>
        </ul>
      </div>
    </div>
  )
}
