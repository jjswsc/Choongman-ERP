'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { navigatePosOfflineAware } from '@/lib/pos-offline-nav'
import { POS_DEMO_ROUTES } from './demo-routes'
import { PosDemoLanguageGate } from './pos-demo-language-gate'
import { usePosTour } from './pos-tour-context'
import { useT } from '@/lib/i18n'
import { useLang } from '@/lib/lang-context'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const OVERLAY_Z = 100
/** `overlayDim: false`일 때 결제 다이얼로그(보통 z-50) 위에 툴팁 */
const TOOLTIP_ABOVE_DIALOG_Z = 130

function useTargetRect(
  dataTour: string | null,
  stepIndex: number,
  opts?: { fallbackDataTour?: string | null; resyncKey?: number }
) {
  const [rect, setRect] = React.useState<DOMRect | null>(null)
  const fallback = opts?.fallbackDataTour ?? null
  const resyncKey = opts?.resyncKey ?? 0

  React.useLayoutEffect(() => {
    let alive = true
    if (typeof document === 'undefined' || !dataTour) {
      setRect(null)
      return
    }
    if (dataTour === 'pos-tour-nospot') {
      setRect(null)
      return
    }
    const safe = dataTour.replace(/["\\]/g, '')
    let el = document.querySelector<HTMLElement>(`[data-tour="${safe}"]`)
    if (!el && fallback && fallback !== 'pos-tour-nospot') {
      const fb = fallback.replace(/["\\]/g, '')
      el = document.querySelector<HTMLElement>(`[data-tour="${fb}"]`)
    }
    if (!el) {
      setRect(null)
      return
    }
    /** 스텝 전환 직후 메뉴·카트 등이 뷰포트 밖에 있으면 스팟라이트가 어긋나므로 먼저 스크롤 */
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    const update = () => {
      if (!alive) return
      setRect(el.getBoundingClientRect())
    }
    update()
    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    const onScroll = () => update()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', update)
    return () => {
      alive = false
      ro.disconnect()
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', update)
    }
  }, [dataTour, stepIndex, fallback, resyncKey])

  return rect
}

export function PosTourOverlay() {
  const router = useRouter()
  const { lang } = useLang()
  const t = useT(lang)
  const {
    isDemo,
    showOverlay,
    preTourLanguageDone,
    currentStep,
    goNext,
    goPrev,
    endTour,
    scenario,
    stepIndex,
    setStepIndex,
    manualNextAllowed,
  } = usePosTour()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  /** 조기 return 앞에서 항상 호출 — Rules of Hooks (언어 게이트 전후 순서 고정) */
  const spotlightTarget =
    mounted && showOverlay && preTourLanguageDone && currentStep?.target
      ? currentStep.target
      : null
  const seq = currentStep?.spotlightSequence
  const seqLen = seq?.length ?? 0
  const [spotlightSeqIndex, setSpotlightSeqIndex] = React.useState(0)
  React.useEffect(() => {
    setSpotlightSeqIndex(0)
  }, [stepIndex, seqLen])
  const seqManual = Boolean(currentStep?.spotlightSequenceManualAdvance)
  React.useEffect(() => {
    if (!seqLen || !seq || seqManual) return
    let alive = true
    const ms = Math.max(800, currentStep?.spotlightSequenceIntervalMs ?? 2600)
    const id = window.setInterval(() => {
      if (!alive) return
      setSpotlightSeqIndex((i) => (i + 1) % seq.length)
    }, ms)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [stepIndex, seq, seqLen, seqManual, currentStep?.spotlightSequenceIntervalMs])

  const activeSpotlight =
    seqLen && seq && spotlightTarget && spotlightTarget !== 'pos-tour-nospot'
      ? seq[spotlightSeqIndex] ?? spotlightTarget
      : spotlightTarget
  const rect = useTargetRect(activeSpotlight, stepIndex, {
    fallbackDataTour: seqLen ? spotlightTarget : null,
    resyncKey: seqLen ? spotlightSeqIndex : 0,
  })
  type QuickCategory = 'start' | 'order' | 'payment' | 'business' | 'cash'
  type QuickSection = { value: QuickCategory; label: string; navigateTo: string }
  const quickSections = React.useMemo<QuickSection[]>(() => {
    if (!isDemo) return []
    return [
      { value: 'start', label: t('posTourQuickStartScreen'), navigateTo: POS_DEMO_ROUTES.homeMain },
      { value: 'order', label: t('posTourQuickOrderScreen'), navigateTo: POS_DEMO_ROUTES.terminalFullDineIn },
      { value: 'payment', label: t('posTourQuickPaymentScreen'), navigateTo: POS_DEMO_ROUTES.terminalFullDineIn },
      { value: 'business', label: t('posTourQuickBusinessMgmt'), navigateTo: POS_DEMO_ROUTES.businessOpen },
      { value: 'cash', label: t('posTourQuickCashMgmt'), navigateTo: POS_DEMO_ROUTES.cashManagement },
    ]
  }, [isDemo, t])
  const quickSectionValue = React.useMemo(() => {
    if (quickSections.length === 0) return ''
    if (scenario.id === 'terminal-full-walkthrough') {
      const paymentIdx = scenario.steps.findIndex((s) => s.id === 'w18_pay')
      return stepIndex >= Math.max(0, paymentIdx) ? 'payment' : 'order'
    }
    if (scenario.id === 'pos-business-open-tour' || scenario.id === 'pos-business-close-tour' || scenario.id === 'pos-business-cash-home') {
      return 'business'
    }
    if (scenario.id === 'pos-cash-management-tour') {
      return 'cash'
    }
    return 'start'
  }, [quickSections, scenario, stepIndex])

  if (!mounted || !showOverlay) {
    return null
  }
  if (!preTourLanguageDone) {
    return <PosDemoLanguageGate />
  }

  if (!currentStep) {
    return null
  }

  const dimBackground = currentStep.overlayDim !== false
  const pad = 8
  /** `overlayDim: false`일 때도 대상 영역이 보이도록 고정 테두리(메뉴·다른 영역은 그대로 클릭 가능) */
  const ringPad = 6
  const hole = dimBackground && rect
    ? {
        top: Math.max(0, rect.top - pad),
        left: Math.max(0, rect.left - pad),
        w: Math.min(window.innerWidth, rect.width + pad * 2),
        h: Math.min(window.innerHeight, rect.height + pad * 2),
      }
    : null

  const seqCopy = currentStep.spotlightSequenceCopy
  const copyPair =
    seqLen && seqCopy?.length
      ? seqCopy[Math.min(spotlightSeqIndex, seqCopy.length - 1)] ?? null
      : null
  const title = t(copyPair?.titleKey ?? currentStep.titleKey)
  const body = t(copyPair?.bodyKey ?? currentStep.bodyKey)
  const isFirst = stepIndex <= 0
  const isLast = stepIndex >= scenario.steps.length - 1
  const advance = currentStep.advance
  /**
   * 「다음」은 수동 스텝만. 조건형(`cart_has_line_*` 등)은 건너뛰기 방지로 버튼 숨김 —
   * 조건이 맞으면 PosTerminalTourController가 자동으로 스텝을 넘김(화면과 동기).
   */
  const showNext = advance === 'manual' && manualNextAllowed
  const floatingZ = dimBackground ? OVERLAY_Z + 1 : TOOLTIP_ABOVE_DIALOG_Z
  const navOnNext = currentStep?.navigateOnNext
  const nextNavLabel = t('posTourNextNavigate')
  const resolvedNextNavLabel =
    nextNavLabel === 'posTourNextNavigate' ? t('posTourNextToTerminal') : nextNavLabel

  const content = (
    <div
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: dimBackground ? OVERLAY_Z : TOOLTIP_ABOVE_DIALOG_Z }}
      role="dialog"
      aria-modal="true"
      aria-label={t('posTourOverlayAria')}
    >
      {dimBackground && hole && (
        <>
          <div
            className="pointer-events-auto absolute left-0 top-0 w-full bg-black/55"
            style={{ height: `${hole.top}px` }}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="pointer-events-auto absolute left-0 bg-black/55"
            style={{ top: `${hole.top}px`, width: `${hole.left}px`, height: `${hole.h}px` }}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="pointer-events-auto absolute right-0 bg-black/55"
            style={{ top: `${hole.top}px`, left: `${hole.left + hole.w}px`, right: 0, height: `${hole.h}px` }}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="pointer-events-auto absolute left-0 bg-black/55"
            style={{ top: `${hole.top + hole.h}px`, width: '100%', bottom: 0 }}
            onClick={(e) => e.stopPropagation()}
          />
        </>
      )}
      {dimBackground && !hole && (
        <div
          className="pointer-events-auto absolute inset-0 bg-black/55"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {!dimBackground &&
      rect &&
      spotlightTarget &&
      spotlightTarget !== 'pos-tour-nospot' ? (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-md border-2 border-primary bg-primary/10 shadow-md"
          style={{
            zIndex: floatingZ - 1,
            top: Math.max(0, rect.top - ringPad),
            left: Math.max(0, rect.left - ringPad),
            width: Math.min(window.innerWidth, rect.width + ringPad * 2),
            height: Math.min(window.innerHeight, rect.height + ringPad * 2),
          }}
        />
      ) : null}

      <div
        className={cn(
          'pointer-events-auto absolute left-1/2 top-[72px] w-[min(100vw-1.5rem,22rem)] -translate-x-1/2',
          'sm:bottom-8 sm:left-auto sm:right-8 sm:top-auto sm:translate-x-0',
          'flex flex-col gap-2'
        )}
        style={{ zIndex: floatingZ }}
      >
        {quickSections.length > 0 && (
          <div className="rounded-lg border border-border bg-card/95 p-2 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/85">
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 px-2" onClick={() => setStepIndex(0)}>
                {t('posTourQuickRestart')}
              </Button>
              <Select
                value={quickSectionValue}
                onValueChange={(v) => {
                  const target = quickSections.find((s) => s.value === (v as QuickCategory))
                  if (!target) return
                  if (target.value === 'payment' && scenario.id === 'terminal-full-walkthrough') {
                    const paymentIdx = scenario.steps.findIndex((s) => s.id === 'w18_pay')
                    if (paymentIdx >= 0) {
                      setStepIndex(paymentIdx)
                      return
                    }
                  }
                  if (target.value === 'order' && scenario.id === 'terminal-full-walkthrough') {
                    const orderIdx = scenario.steps.findIndex((s) => s.id === 'w11_menu')
                    if (orderIdx >= 0) {
                      setStepIndex(orderIdx)
                      return
                    }
                  }
                  navigatePosOfflineAware(target.navigateTo, (p) => router.push(p))
                }}
              >
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue placeholder={t('posTourQuickJumpPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {quickSections.map((s) => (
                    <SelectItem key={`tour-quick-${s.value}`} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <div className="rounded-lg border border-border bg-card p-4 shadow-xl">
        <p className="text-xs text-muted-foreground">
          {t('posTourStepCounter')
            .replace('{{n}}', String(stepIndex + 1))
            .replace('{{total}}', String(scenario.steps.length))}
        </p>
        <p className="mt-1 text-base font-semibold leading-tight">
          {title}
        </p>
        <p className="mt-2 text-sm text-muted-foreground leading-snug">
          {body}
        </p>
        {advance && advance !== 'manual' ? (
          <p className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground leading-snug">
            {t('posTourAdvanceAutoHint')}
          </p>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mr-auto"
            onClick={endTour}
          >
            {t('posTourEnd')}
          </Button>
          {!isFirst && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (seqLen && seqManual && spotlightSeqIndex > 0) {
                  setSpotlightSeqIndex((i) => Math.max(0, i - 1))
                  return
                }
                goPrev()
              }}
            >
              {t('posTourPrev')}
            </Button>
          )}
          {showNext && !isLast && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (seqLen && seqManual && spotlightSeqIndex < seqLen - 1) {
                  setSpotlightSeqIndex((i) => i + 1)
                  return
                }
                goNext()
              }}
            >
              {t('posTourNext')}
            </Button>
          )}
          {showNext && isLast && navOnNext && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                navigatePosOfflineAware(navOnNext, (p) => router.push(p))
              }}
            >
              {resolvedNextNavLabel}
            </Button>
          )}
          {showNext && isLast && !navOnNext && (
            <Button type="button" size="sm" onClick={endTour}>
              {t('posTourDone')}
            </Button>
          )}
        </div>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}
