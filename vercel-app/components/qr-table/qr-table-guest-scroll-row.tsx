'use client'

import * as React from 'react'

const EDGE_EPSILON_PX = 2
const PAGE_RATIO = 0.7
const NUDGE_PX = 56
const NUDGE_RETURN_MS = 650
const NUDGE_START_MS = 700

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function Chevron({ dir }: { dir: 'prev' | 'next' }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={dir === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * 가로 스크롤 행 + 양 끝 흐림·화살표. 넘칠 때만, 더 갈 방향에만 화살표가 보인다.
 * `nudgeHintKey`가 있으면 세션당 1회 살짝 밀었다 돌아와 스크롤 가능함을 알린다.
 */
export function QrTableGuestScrollRow(props: {
  children: React.ReactNode
  className?: string
  scrollerClassName: string
  prevLabel: string
  nextLabel: string
  /** 흐림 시작색 (행 배경과 같아야 자연스러움) */
  fadeFromClass?: string
  nudgeHintKey?: string
}) {
  const { children, className, scrollerClassName, prevLabel, nextLabel, nudgeHintKey } = props
  const fadeFrom = props.fadeFromClass || 'from-white'
  const scrollerRef = React.useRef<HTMLDivElement | null>(null)
  const interactedRef = React.useRef(false)
  const [canPrev, setCanPrev] = React.useState(false)
  const [canNext, setCanNext] = React.useState(false)

  const updateEdges = React.useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const maxLeft = el.scrollWidth - el.clientWidth
    setCanPrev(el.scrollLeft > EDGE_EPSILON_PX)
    setCanNext(maxLeft - el.scrollLeft > EDGE_EPSILON_PX)
  }, [])

  React.useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    updateEdges()
    el.addEventListener('scroll', updateEdges, { passive: true })
    const markInteracted = () => {
      interactedRef.current = true
    }
    el.addEventListener('pointerdown', markInteracted, { passive: true })
    el.addEventListener('touchstart', markInteracted, { passive: true })

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateEdges) : null
    const observeAll = () => {
      if (!ro) return
      ro.disconnect()
      ro.observe(el)
      for (const child of Array.from(el.children)) ro.observe(child)
    }
    observeAll()
    const mo =
      typeof MutationObserver !== 'undefined'
        ? new MutationObserver(() => {
            observeAll()
            updateEdges()
          })
        : null
    mo?.observe(el, { childList: true })
    window.addEventListener('resize', updateEdges)

    return () => {
      el.removeEventListener('scroll', updateEdges)
      el.removeEventListener('pointerdown', markInteracted)
      el.removeEventListener('touchstart', markInteracted)
      ro?.disconnect()
      mo?.disconnect()
      window.removeEventListener('resize', updateEdges)
    }
  }, [updateEdges])

  const nudgeTimersRef = React.useRef<number[]>([])
  const nudgeScheduledRef = React.useRef(false)

  React.useEffect(() => {
    return () => {
      for (const t of nudgeTimersRef.current) window.clearTimeout(t)
      nudgeTimersRef.current = []
    }
  }, [])

  React.useEffect(() => {
    if (!nudgeHintKey || !canNext || nudgeScheduledRef.current) return
    if (prefersReducedMotion()) return
    const storageKey = `qrGuestScrollHint:${nudgeHintKey}`
    try {
      if (window.sessionStorage.getItem(storageKey)) return
    } catch {
      return
    }
    nudgeScheduledRef.current = true
    const timers = nudgeTimersRef.current
    timers.push(
      window.setTimeout(() => {
        const el = scrollerRef.current
        if (!el || interactedRef.current || el.scrollLeft > EDGE_EPSILON_PX) return
        try {
          window.sessionStorage.setItem(storageKey, '1')
        } catch {
          /* private mode */
        }
        el.scrollTo({ left: NUDGE_PX, behavior: 'smooth' })
        timers.push(
          window.setTimeout(() => {
            if (interactedRef.current) return
            scrollerRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
          }, NUDGE_RETURN_MS),
        )
      }, NUDGE_START_MS),
    )
  }, [nudgeHintKey, canNext])

  const scrollPage = (dir: -1 | 1) => {
    const el = scrollerRef.current
    if (!el) return
    interactedRef.current = true
    el.scrollBy({
      left: dir * Math.max(80, el.clientWidth * PAGE_RATIO),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }

  const arrowBtn =
    'pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-stone-700 shadow-md ring-1 ring-stone-200 touch-manipulation active:scale-95'

  return (
    <div className={`relative ${className || ''}`}>
      <div ref={scrollerRef} className={scrollerClassName}>
        {children}
      </div>
      <div
        className={`pointer-events-none absolute inset-y-0 left-0 flex w-12 items-center bg-gradient-to-r ${fadeFrom} via-white/80 to-transparent pl-0.5 transition-opacity duration-200 ${
          canPrev ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {canPrev ? (
          <button type="button" className={arrowBtn} aria-label={prevLabel} onClick={() => scrollPage(-1)}>
            <Chevron dir="prev" />
          </button>
        ) : null}
      </div>
      <div
        className={`pointer-events-none absolute inset-y-0 right-0 flex w-12 items-center justify-end bg-gradient-to-l ${fadeFrom} via-white/80 to-transparent pr-0.5 transition-opacity duration-200 ${
          canNext ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {canNext ? (
          <button type="button" className={arrowBtn} aria-label={nextLabel} onClick={() => scrollPage(1)}>
            <Chevron dir="next" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
