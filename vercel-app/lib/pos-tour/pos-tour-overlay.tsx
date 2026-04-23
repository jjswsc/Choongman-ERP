'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { navigatePosOfflineAware } from '@/lib/pos-offline-nav'
import { PosDemoLanguageGate } from './pos-demo-language-gate'
import { usePosTour } from './pos-tour-context'
import { useT } from '@/lib/i18n'
import { useLang } from '@/lib/lang-context'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const OVERLAY_Z = 100
/** `overlayDim: false`일 때 결제 다이얼로그(보통 z-50) 위에 툴팁 */
const TOOLTIP_ABOVE_DIALOG_Z = 130

function useTargetRect(dataTour: string | null, stepIndex: number) {
  const [rect, setRect] = React.useState<DOMRect | null>(null)

  React.useLayoutEffect(() => {
    if (typeof document === 'undefined' || !dataTour) {
      setRect(null)
      return
    }
    if (dataTour === 'pos-tour-nospot') {
      setRect(null)
      return
    }
    const safe = dataTour.replace(/["\\]/g, '')
    const el = document.querySelector<HTMLElement>(`[data-tour="${safe}"]`)
    if (!el) {
      setRect(null)
      return
    }
    /** 스텝 전환 직후 메뉴·카트 등이 뷰포트 밖에 있으면 스팟라이트가 어긋나므로 먼저 스크롤 */
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
    const update = () => {
      setRect(el.getBoundingClientRect())
    }
    update()
    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    const onScroll = () => update()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', update)
    }
  }, [dataTour, stepIndex])

  return rect
}

export function PosTourOverlay() {
  const router = useRouter()
  const { lang } = useLang()
  const t = useT(lang)
  const { showOverlay, preTourLanguageDone, currentStep, goNext, goPrev, endTour, scenario, stepIndex } =
    usePosTour()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  /** 조기 return 앞에서 항상 호출 — Rules of Hooks (언어 게이트 전후 순서 고정) */
  const spotlightTarget =
    mounted && showOverlay && preTourLanguageDone && currentStep?.target
      ? currentStep.target
      : null
  const rect = useTargetRect(spotlightTarget, stepIndex)

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

  const title = t(currentStep.titleKey)
  const body = t(currentStep.bodyKey)
  const isFirst = stepIndex <= 0
  const isLast = stepIndex >= scenario.steps.length - 1
  const advance = currentStep.advance
  /**
   * 「다음」은 수동 스텝만. 조건형(`cart_has_line_*` 등)은 건너뛰기 방지로 버튼 숨김 —
   * 조건이 맞으면 PosTerminalTourController가 자동으로 스텝을 넘김(화면과 동기).
   */
  const showNext = advance === 'manual'
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
          'pointer-events-auto absolute max-w-sm rounded-lg border border-border bg-card p-4 shadow-xl',
          'left-1/2 top-[72px] w-[min(100vw-1.5rem,22rem)] -translate-x-1/2',
          'sm:bottom-8 sm:left-auto sm:right-8 sm:top-auto sm:translate-x-0'
        )}
        style={{ zIndex: floatingZ }}
      >
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
            <Button type="button" variant="outline" size="sm" onClick={goPrev}>
              {t('posTourPrev')}
            </Button>
          )}
          {showNext && !isLast && (
            <Button type="button" size="sm" onClick={goNext}>
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
  )

  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}
