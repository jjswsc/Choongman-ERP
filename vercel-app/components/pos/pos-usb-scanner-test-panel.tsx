'use client'

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'
import { normalizeCouponScanDelimiters } from '@/lib/member-coupon-qr'
import { previewPosScanPayload } from '@/lib/pos-scan-parse-preview'
import {
  playPosScanBeep,
  POS_SCAN_FIELD_FLASH_MS,
  posScanFieldFlashClass,
  type PosScanFieldFlash,
} from '@/lib/pos-scan-feedback'

type ScanEvent = {
  id: number
  raw: string
  receivedEnter: boolean
  preview: ReturnType<typeof previewPosScanPayload>
  at: string
}

export function PosUsbScannerTestPanel() {
  const { lang } = useLang()
  const t = useT(lang)
  const tr = (key: string, fallback: string) => t(key) || fallback

  const inputRef = React.useRef<HTMLInputElement>(null)
  const bufferRef = React.useRef('')
  const lastKeyAtRef = React.useRef(0)
  const [flash, setFlash] = React.useState<PosScanFieldFlash>(null)
  const [events, setEvents] = React.useState<ScanEvent[]>([])
  const nextIdRef = React.useRef(1)

  const flashOutcome = React.useCallback((outcome: PosScanFieldFlash) => {
    if (!outcome) return
    setFlash(outcome)
    window.setTimeout(() => setFlash(null), POS_SCAN_FIELD_FLASH_MS)
  }, [])

  const commitScan = React.useCallback(
    (raw: string, receivedEnter: boolean) => {
      const normalized = normalizeCouponScanDelimiters(raw.trim())
      if (!normalized) return
      const preview = previewPosScanPayload(normalized)
      const outcome = preview.kind === 'unknown' ? 'error' : 'success'
      playPosScanBeep(outcome)
      flashOutcome(outcome)
      setEvents((prev) => [
        {
          id: nextIdRef.current++,
          raw: normalized,
          receivedEnter,
          preview,
          at: new Date().toLocaleTimeString(lang === 'ko' ? 'ko-KR' : 'en-US', { hour12: false }),
        },
        ...prev.slice(0, 9),
      ])
      bufferRef.current = ''
      lastKeyAtRef.current = 0
    },
    [flashOutcome, lang]
  )

  React.useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 120)
    return () => window.clearTimeout(id)
  }, [])

  const kindLabel = (kind: ScanEvent['preview']['kind']) => {
    if (kind === 'member') return tr('posUsbScannerTestKindMember', '회원 QR')
    if (kind === 'coupon') return tr('posUsbScannerTestKindCoupon', '쿠폰 QR')
    return tr('posUsbScannerTestKindUnknown', '인식 불가')
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div>
        <h4 className="text-sm font-semibold">{tr('posUsbScannerTestTitle', 'USB 스캐너 테스트')}</h4>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {tr(
            'posUsbScannerTestHint',
            '아래 입력칸을 클릭한 뒤 스캔하세요. 원문·파싱 결과·Enter 수신 여부를 확인할 수 있습니다.'
          )}
        </p>
      </div>

      <Input
        ref={inputRef}
        lang="en"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={tr('posUsbScannerTestPlaceholder', '여기에 스캔…')}
        className={`font-mono text-sm ${posScanFieldFlashClass(flash)}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitScan(bufferRef.current || e.currentTarget.value, true)
            e.currentTarget.value = ''
            return
          }
          if (e.key.length !== 1) return
          const now = Date.now()
          if (lastKeyAtRef.current > 0 && now - lastKeyAtRef.current > 120) {
            bufferRef.current = e.key
          } else {
            bufferRef.current += e.key
          }
          lastKeyAtRef.current = now
          e.currentTarget.value = bufferRef.current
        }}
        onChange={() => {
          /* controlled by keydown buffer for wedge scanners */
        }}
      />

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setEvents([])
            bufferRef.current = ''
            if (inputRef.current) inputRef.current.value = ''
            inputRef.current?.focus()
          }}
        >
          {tr('posUsbScannerTestClear', '지우기')}
        </Button>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground">{tr('posUsbScannerTestEmpty', '아직 스캔 기록이 없습니다.')}</p>
      ) : (
        <ul className="space-y-2">
          {events.map((ev) => (
            <li key={ev.id} className="rounded-md border bg-background/80 p-2 text-xs space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{kindLabel(ev.preview.kind)}</span>
                <span className="text-muted-foreground">{ev.at}</span>
                <span className="text-muted-foreground">
                  {tr('posUsbScannerTestEnter', 'Enter')}:{' '}
                  {ev.receivedEnter
                    ? tr('posUsbScannerTestYes', '예')
                    : tr('posUsbScannerTestNo', '아니오')}
                </span>
              </div>
              <p>
                <span className="text-muted-foreground">{tr('posUsbScannerTestRaw', '원문')}: </span>
                <span className="font-mono break-all">{ev.raw}</span>
              </p>
              <p>
                <span className="text-muted-foreground">{tr('posUsbScannerTestParsed', '파싱')}: </span>
                <span className="font-mono break-all">{ev.preview.summary || '—'}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
