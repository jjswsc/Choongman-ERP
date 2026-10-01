'use client'

import * as React from 'react'
import Link from 'next/link'
import { appAlert, appConfirm } from '@/lib/app-message'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { useLang } from '@/lib/lang-context'
import { tOr, useT } from '@/lib/i18n'
import { localizeApiMessage } from '@/lib/translate-api-message'
import {
  getAttendanceQrDevices,
  getAttendanceQrMode,
  revokePosDevice,
  saveAttendanceQrMode,
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
  const [qrMode, setQrMode] = React.useState<'rotating' | 'fixed'>('rotating')
  const [schemaMissing, setSchemaMissing] = React.useState(false)
  const [savingMode, setSavingMode] = React.useState(false)

  const loadData = React.useCallback(() => {
    if (!storeCode || !canManage) {
      setDevices([])
      setQrMode('rotating')
      setSchemaMissing(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    Promise.all([
      getAttendanceQrDevices({ storeCode }),
      getAttendanceQrMode({ storeCode }),
    ])
      .then(([res, modeRes]) => {
        setDevices(res.devices ?? [])
        if (!res.success && res.message) setLoadError(res.message)
        if (modeRes.success) {
          setQrMode(modeRes.mode === 'fixed' ? 'fixed' : 'rotating')
          setSchemaMissing(modeRes.schemaMissing === true)
        }
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

  async function handleMode(next: 'rotating' | 'fixed') {
    if (!storeCode || savingMode || next === qrMode) return
    if (next === 'fixed') {
      const ok = await appConfirm(
        tOr(
          t,
          'attendanceQrModeFixedConfirm',
          '고정 QR은 화면을 캡처해 매장 밖에서도 출퇴근에 쓸 수 있습니다.\n이 매장을 고정으로 바꿀까요?'
        )
      )
      if (!ok) return
    }
    const prev = qrMode
    setQrMode(next)
    setSavingMode(true)
    try {
      const res = await saveAttendanceQrMode({ storeCode, mode: next })
      if (!res.success) {
        setQrMode(prev)
        const schema = res.message === 'attendance_qr_mode_schema_missing'
        if (schema) setSchemaMissing(true)
        await appAlert(
          schema
            ? tOr(
                t,
                'attendanceQrModeSchemaMissing',
                '출퇴근 QR 설정 테이블이 아직 없습니다. Supabase에 SQL을 적용한 뒤 다시 저장해 주세요.'
              )
            : localizeApiMessage(res.message, t, tOr(t, 'msg_save_fail_detail', '저장에 실패했습니다.'), lang)
        )
      } else {
        setSchemaMissing(false)
      }
    } catch (e) {
      setQrMode(prev)
      await appAlert(String(e))
    } finally {
      setSavingMode(false)
    }
  }

  const modeHint =
    qrMode === 'fixed'
      ? tOr(
          t,
          'attendanceQrModeFixedHint',
          'QR이 바뀌지 않습니다. 화면을 캡처하면 매장 밖에서도 출퇴근할 수 있습니다.'
        )
      : tOr(
          t,
          'attendanceQrModeRotatingHint',
          '방콕시간 기준 2시간마다 QR이 바뀝니다(0시, 2시, …). 기본값입니다.'
        )

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
              '매장 고정 태블릿에서 /kiosk/attendance-qr 을 켜 두세요. 최초 1회 Officer·본사 또는 매장 Manager 등록.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/kiosk/attendance-qr">
              {t('attendanceQrDevicesOpenKiosk') || 'QR 키오스크 열기'}
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">
            {tOr(t, 'attendanceQrModeLabel', '출퇴근 QR')}
          </p>
          <div className="flex shrink-0 gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={qrMode === 'rotating' ? 'default' : 'outline'}
              disabled={savingMode || loading || schemaMissing}
              onClick={() => void handleMode('rotating')}
            >
              {tOr(t, 'attendanceQrModeRotating', '2시간마다 변경')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={qrMode === 'fixed' ? 'default' : 'outline'}
              disabled={savingMode || loading || schemaMissing}
              onClick={() => void handleMode('fixed')}
            >
              {tOr(t, 'attendanceQrModeFixed', '고정')}
            </Button>
          </div>
        </div>
        <p
          className={
            qrMode === 'fixed'
              ? 'mt-2 text-xs text-amber-700 dark:text-amber-300'
              : 'mt-2 text-xs text-muted-foreground'
          }
        >
          {modeHint}
        </p>
        {schemaMissing ? (
          <p className="mt-1 text-xs text-destructive">
            {tOr(
              t,
              'attendanceQrModeSchemaMissing',
              '출퇴근 QR 설정 테이블이 아직 없습니다. Supabase에 SQL을 적용한 뒤 다시 저장해 주세요.'
            )}
          </p>
        ) : null}
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
