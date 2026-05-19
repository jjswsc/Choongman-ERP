'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { appAlert } from '@/lib/app-message'
import { getPosBusinessDaySettings, savePosBusinessDaySettings } from '@/lib/api-client'
import {
  getBangkokDateStr,
  getPosBusinessDateStrFromConfig,
  posBusinessDateYmdToUtcRange,
  setPosBusinessHoursClient,
  type PosBusinessHoursConfig,
} from '@/lib/pos-business-day'

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const MINUTES = Array.from({ length: 60 }, (_, m) => m)

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

type Target = { kind: 'global' } | { kind: 'store'; code: string }

export function SalesPosBusinessDaySettings({
  tr,
  canEditGlobal,
  canEditStore,
  storeChoices,
}: {
  tr: (key: string, fallback: string) => string
  canEditGlobal: boolean
  canEditStore: boolean
  storeChoices: string[]
}) {
  const initialTarget = React.useMemo((): Target => {
    if (canEditGlobal) return { kind: 'global' }
    if (storeChoices.length === 1) return { kind: 'store', code: storeChoices[0] }
    return { kind: 'store', code: storeChoices[0] || '' }
  }, [canEditGlobal, storeChoices])

  const [target, setTarget] = React.useState<Target>(initialTarget)
  const [hour, setHour] = React.useState(8)
  const [minute, setMinute] = React.useState(0)
  const [endHour, setEndHour] = React.useState(8)
  const [endMinute, setEndMinute] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [hasStoreOverride, setHasStoreOverride] = React.useState(false)
  const [globalHour, setGlobalHour] = React.useState(8)
  const [globalMinute, setGlobalMinute] = React.useState(0)
  const [globalEndHour, setGlobalEndHour] = React.useState(8)
  const [globalEndMinute, setGlobalEndMinute] = React.useState(0)

  React.useEffect(() => {
    setTarget(initialTarget)
  }, [initialTarget])

  React.useEffect(() => {
    if (canEditGlobal) return
    if (!canEditStore) return
    if (storeChoices.length === 0) return
    setTarget((prev) => {
      if (prev.kind === 'store' && prev.code.trim()) return prev
      return { kind: 'store', code: storeChoices[0] }
    })
  }, [canEditGlobal, canEditStore, storeChoices])

  const storeQuery = target.kind === 'store' && target.code.trim() ? target.code.trim() : null

  const hoursConfig = React.useMemo(
    (): PosBusinessHoursConfig => ({
      start: { hour, minute },
      end: { hour: endHour, minute: endMinute },
    }),
    [hour, minute, endHour, endMinute]
  )

  React.useEffect(() => {
    let cancel = false
    setLoading(true)
    void getPosBusinessDaySettings(storeQuery)
      .then((c) => {
        if (cancel) return
        setHour(c.hour)
        setMinute(c.minute)
        setEndHour(c.endHour)
        setEndMinute(c.endMinute)
        setHasStoreOverride(Boolean(c.hasStoreOverride))
        setGlobalHour(Number.isFinite(Number(c.globalHour)) ? Math.trunc(Number(c.globalHour)) : 8)
        setGlobalMinute(
          Number.isFinite(Number(c.globalMinute)) ? Math.min(59, Math.max(0, Math.trunc(Number(c.globalMinute)))) : 0
        )
        setGlobalEndHour(Number.isFinite(Number(c.globalEndHour)) ? Math.trunc(Number(c.globalEndHour)) : c.hour)
        setGlobalEndMinute(
          Number.isFinite(Number(c.globalEndMinute))
            ? Math.min(59, Math.max(0, Math.trunc(Number(c.globalEndMinute))))
            : c.minute
        )
      })
      .catch(() => {})
      .finally(() => {
        if (!cancel) setLoading(false)
      })
    return () => {
      cancel = true
    }
  }, [storeQuery, target.kind])

  const preview = React.useMemo(() => {
    const now = new Date()
    const cal = getBangkokDateStr(now)
    const biz = getPosBusinessDateStrFromConfig(now, hoursConfig)
    const { startISO, endISOExclusive } = posBusinessDateYmdToUtcRange(biz, hoursConfig)
    return { cal, biz, startISO, endISOExclusive }
  }, [hoursConfig])

  const canSave =
    target.kind === 'global' ? canEditGlobal : canEditStore && Boolean(target.code?.trim())

  const handleSave = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      const res = await savePosBusinessDaySettings(
        target.kind === 'global'
          ? { hour, minute, endHour, endMinute }
          : { hour, minute, endHour, endMinute, storeCode: target.code.trim() }
      )
      if (!res.success) {
        await appAlert(res.message || tr('salesPosBizDaySaveFail', '저장에 실패했습니다.'))
        return
      }
      setPosBusinessHoursClient(hoursConfig)
      await appAlert(tr('salesPosBizDaySaved', '저장되었습니다. POS 단말은 잠시 후·새로고침 시 반영됩니다.'))
      const again = await getPosBusinessDaySettings(storeQuery)
      setHasStoreOverride(Boolean(again.hasStoreOverride))
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleResetOverride = async () => {
    if (target.kind !== 'store' || !canSave || !hasStoreOverride) return
    setSaving(true)
    try {
      const res = await savePosBusinessDaySettings({
        hour: 0,
        minute: 0,
        storeCode: target.code.trim(),
        resetStoreOverride: true,
      })
      if (!res.success) {
        await appAlert(res.message || tr('salesPosBizDaySaveFail', '저장에 실패했습니다.'))
        return
      }
      const again = await getPosBusinessDaySettings(storeQuery)
      setHour(again.hour)
      setMinute(again.minute)
      setEndHour(again.endHour)
      setEndMinute(again.endMinute)
      setHasStoreOverride(Boolean(again.hasStoreOverride))
      setGlobalHour(again.globalHour ?? 8)
      setGlobalMinute(again.globalMinute ?? 0)
      setGlobalEndHour(again.globalEndHour ?? again.hour)
      setGlobalEndMinute(again.globalEndMinute ?? again.minute)
      setPosBusinessHoursClient({
        start: { hour: again.hour, minute: again.minute },
        end: { hour: again.endHour, minute: again.endMinute },
      })
      await appAlert(tr('salesPosBizDayResetDone', '매장 덮어쓰기를 제거했습니다. 전사 기본값이 적용됩니다.'))
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 py-4">
      <div>
        <h2 className="text-lg font-semibold">
          {tr('salesPosBizDayTitle', '영업시간 설정')}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {tr(
            'salesPosBizDayHint',
            '방콕(Asia/Bangkok) 기준입니다. 영업 시작·종료 시각으로「하루 매출」이 묶이는 UTC 구간이 정해집니다. 시작과 종료가 같으면 전통적인 24시간 창(다음날 시작 시각까지)으로 동작합니다. 자정을 넘기는 매장은 종료를 익일 시각으로 두면 같은 규칙으로 집계됩니다.'
          )}
        </p>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {tr(
            'salesPosBizDayPerStoreHint',
            '매장별로 다르게 쓰려면 매장을 선택해 저장하세요. 덮어쓰기가 없는 매장은 전사 기본값이 POS·당일 매출·집계에 적용됩니다.'
          )}
        </p>
      </div>

      {canEditGlobal || (canEditStore && storeChoices.length > 1) ? (
        <div className="space-y-2">
          <Label>{tr('salesPosBizDayTarget', '적용 대상')}</Label>
          <select
            className="flex h-9 w-full max-w-md rounded-md border border-input bg-background px-2 text-sm"
            value={target.kind === 'global' ? '__global__' : target.code}
            onChange={(e) => {
              const v = e.target.value
              if (v === '__global__') setTarget({ kind: 'global' })
              else setTarget({ kind: 'store', code: v })
            }}
            disabled={!canEditGlobal && !canEditStore}
          >
            {canEditGlobal ? (
              <option value="__global__">{tr('salesPosBizDayOrgDefault', '전사 기본값 (매장 미설정 시)')}</option>
            ) : null}
            {storeChoices.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">{tr('loading', '불러오는 중…')}</p>
      ) : (
        <>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">{tr('salesPosBizDayStartBlock', '영업 시작')}</p>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pos-biz-hour">{tr('salesPosBizDayHour', '시 (0–23)')}</Label>
                  <select
                    id="pos-biz-hour"
                    className="flex h-9 w-[100px] rounded-md border border-input bg-background px-2 text-sm"
                    value={hour}
                    onChange={(e) => setHour(parseInt(e.target.value, 10) || 0)}
                    disabled={!canSave}
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {pad2(h)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pos-biz-minute">{tr('salesPosBizDayMinute', '분 (0–59)')}</Label>
                  <select
                    id="pos-biz-minute"
                    className="flex h-9 w-[100px] rounded-md border border-input bg-background px-2 text-sm"
                    value={minute}
                    onChange={(e) => setMinute(parseInt(e.target.value, 10) || 0)}
                    disabled={!canSave}
                  >
                    {MINUTES.map((m) => (
                      <option key={m} value={m}>
                        {pad2(m)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">{tr('salesPosBizDayEndBlock', '영업 종료')}</p>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pos-biz-end-hour">{tr('salesPosBizDayEndHour', '시 (0–23)')}</Label>
                  <select
                    id="pos-biz-end-hour"
                    className="flex h-9 w-[100px] rounded-md border border-input bg-background px-2 text-sm"
                    value={endHour}
                    onChange={(e) => setEndHour(parseInt(e.target.value, 10) || 0)}
                    disabled={!canSave}
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {pad2(h)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pos-biz-end-minute">{tr('salesPosBizDayEndMinute', '분 (0–59)')}</Label>
                  <select
                    id="pos-biz-end-minute"
                    className="flex h-9 w-[100px] rounded-md border border-input bg-background px-2 text-sm"
                    value={endMinute}
                    onChange={(e) => setEndMinute(parseInt(e.target.value, 10) || 0)}
                    disabled={!canSave}
                  >
                    {MINUTES.map((m) => (
                      <option key={m} value={m}>
                        {pad2(m)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void handleSave()} disabled={!canSave || saving}>
                {tr('salesPosBizDaySave', '저장')}
              </Button>
              {target.kind === 'store' && hasStoreOverride && canSave ? (
                <Button type="button" variant="outline" onClick={() => void handleResetOverride()} disabled={saving}>
                  {tr('salesPosBizDayResetOverride', '이 매장 덮어쓰기 제거 (전사 기본으로)')}
                </Button>
              ) : null}
            </div>
          </div>

          {target.kind === 'store' && !hasStoreOverride ? (
            <p className="text-xs text-muted-foreground">
              {tr(
                'salesPosBizDayUsingGlobalRange',
                '이 매장은 전사 기본값({sh}:{sm} ~ {eh}:{em})을 쓰는 중입니다.'
              )
                .replace('{sh}', pad2(globalHour))
                .replace('{sm}', pad2(globalMinute))
                .replace('{eh}', pad2(globalEndHour))
                .replace('{em}', pad2(globalEndMinute))}
            </p>
          ) : null}

          <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
            <p className="font-medium">{tr('salesPosBizDayPreviewTitle', '미리보기 (현재 시각 기준)')}</p>
            <p className="text-muted-foreground">
              {tr('salesPosBizDayPreviewCal', '방콕 달력일')}: <span className="font-erp-numeric text-foreground">{preview.cal}</span>
            </p>
            <p className="text-muted-foreground">
              {tr('salesPosBizDayPreviewBiz', 'POS 영업일 라벨')}:{' '}
              <span className="font-erp-numeric text-foreground">{preview.biz}</span>
            </p>
            <p className="text-xs text-muted-foreground break-all pt-1">
              {tr('salesPosBizDayUtcRange', '집계 UTC 구간')}: {preview.startISO} ~ {preview.endISOExclusive}{' '}
              ({tr('salesPosBizDayEndExclusive', '끝 시각 미포함')})
            </p>
          </div>

          {!canEditGlobal && !canEditStore ? (
            <p className="text-sm text-amber-800 dark:text-amber-200">
              {tr('salesPosBizDayReadOnly', '설정 변경 권한이 없습니다.')}
            </p>
          ) : null}
          {canEditStore && !canEditGlobal && storeChoices.length === 0 ? (
            <p className="text-sm text-amber-800 dark:text-amber-200">
              {tr('salesPosBizDayNoStoreScope', '소속 매장이 없어 저장할 수 없습니다.')}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
