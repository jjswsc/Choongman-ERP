'use client'

import * as React from 'react'
import Link from 'next/link'
import { appAlert, appConfirm } from '@/lib/app-message'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { localizeApiMessage } from '@/lib/translate-api-message'
import {
  getAttendanceQrDevices,
  revokePosDevice,
  type AttendanceQrDeviceItem,
} from '@/lib/api-client'
import { canManageAttendanceQrDevices } from '@/lib/permissions'
import { formatPosDateTimeShort } from '@/lib/pos-datetime-locale'
import { RefreshCw, UserX, QrCode } from 'lucide-react'

function maskToken(token: string): string {
  const t = String(token || '').trim()
  if (t.length <= 12) return t
  return `${t.slice(0, 6)}…${t.slice(-4)}`
}

export function AttendanceQrDevicesPanel(props: { storeCode: string }) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const storeCode = String(props.storeCode || '').trim()
  const canManage = canManageAttendanceQrDevices(auth?.role || '')

  const [loading, setLoading] = React.useState(false)
  const [devices, setDevices] = React.useState<AttendanceQrDeviceItem[]>([])
  const [actionToken, setActionToken] = React.useState<string | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const loadData = React.useCallback(() => {
    if (!storeCode || !canManage) {
      setDevices([])
      return
    }
    setLoading(true)
    setLoadError(null)
    getAttendanceQrDevices({ storeCode })
      .then((res) => {
        setDevices(res.devices ?? [])
        if (!res.success && res.message) setLoadError(res.message)
      })
      .catch((e) => setLoadError(String(e)))
      .finally(() => setLoading(false))
  }, [storeCode, canManage])

  React.useEffect(() => {
    loadData()
  }, [loadData])

  if (!canManage) return null

  async function handleRevoke(deviceToken: string) {
    if (!storeCode) return
    if (
      !(await appConfirm(
        t('attendanceQrRevokeConfirm') ||
          '이 QR 단말 등록을 해제하시겠습니까? 해당 기기의 QR 표시가 중단됩니다.'
      ))
    ) {
      return
    }
    setActionToken(deviceToken)
    revokePosDevice({ storeCode, deviceToken })
      .then(async (res) => {
        if (res.success) loadData()
        else {
          await appAlert(
            localizeApiMessage(res.message, t, t('posTerminalUnassignFailed'), lang)
          )
        }
      })
      .finally(() => setActionToken(null))
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold inline-flex items-center gap-1.5">
            <QrCode className="h-4 w-4" />
            {t('attendanceQrDevicesTitle') || '출퇴근 QR 단말'}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
            {t('attendanceQrDevicesDesc') ||
              '매장 고정 태블릿에서 /kiosk/attendance-qr 을 켜 두세요. 최초 1회 매니저·본사 등록.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/kiosk/attendance-qr" target="_blank" rel="noopener noreferrer">
              {t('attendanceQrDevicesOpenKiosk') || 'QR 키오스크 열기'}
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {loadError ? (
        <p className="text-sm text-destructive font-mono text-xs break-words">{loadError}</p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">…</p>
      ) : devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('attendanceQrDevicesEmpty') || '등록된 QR 단말이 없습니다.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[520px]">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-2 font-medium text-muted-foreground">
                  {t('posTerminalDeviceDisplayName') || '표시 이름'}
                </th>
                <th className="text-left py-2 pr-2 font-medium text-muted-foreground">
                  {t('posTerminalDeviceClientHint') || '단말 정보'}
                </th>
                <th className="text-left py-2 pr-2 font-medium text-muted-foreground">
                  {t('posTerminalStatusMainDeviceId') || '기기 ID'}
                </th>
                <th className="text-left py-2 pr-2 font-medium text-muted-foreground whitespace-nowrap">
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
                  <td className="py-2 pr-2">{d.displayLabel || '—'}</td>
                  <td className="py-2 pr-2 text-xs text-muted-foreground max-w-[200px]">
                    <span className="line-clamp-2 break-words" title={d.clientHint || ''}>
                      {d.clientHint || '—'}
                    </span>
                  </td>
                  <td className="py-2 pr-2 font-mono text-xs">{maskToken(d.deviceToken)}</td>
                  <td className="py-2 pr-2 text-muted-foreground whitespace-nowrap">
                    {formatPosDateTimeShort(new Date(d.lastSeenAt), lang)}
                  </td>
                  <td className="py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!!actionToken}
                      onClick={() => void handleRevoke(d.deviceToken)}
                      className="text-destructive hover:text-destructive"
                    >
                      <UserX className="h-3.5 w-3.5" />
                      {t('posTerminalRevoke') || '접속 해제'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
