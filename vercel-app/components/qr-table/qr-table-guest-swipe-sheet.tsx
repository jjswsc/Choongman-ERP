'use client'

import * as React from 'react'

type Snap = 'mid' | 'full'

/**
 * QR 게스트용 스와이프 바텀시트.
 * - 핸들·헤더를 위/아래로 드래그하면 mid ↔ full 스냅, 아래로 많이 내리면 닫힘.
 * - 본문 스크롤과 충돌하지 않도록 드래그는 핸들/헤더에서만 시작한다.
 * - 쉬는 동안에는 transform을 두지 않는다. iOS Safari는 translateY(0)만 있어도
 *   그 안의 네이티브 `<select>` 피커를 열지 않는다 (회원 로그인 생년월일).
 */
export function QrTableGuestSwipeSheet(props: {
  open: boolean
  onClose: () => void
  /** 시트 위 z-index (최종확인이 장바구니 위에 올 때) */
  zClass?: string
  header?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  /** 열릴 때 시작 높이 */
  initialSnap?: Snap
  ariaLabel?: string
}) {
  const {
    open,
    onClose,
    zClass = 'z-40',
    header,
    footer,
    children,
    initialSnap = 'mid',
    ariaLabel,
  } = props

  const [snap, setSnap] = React.useState<Snap>(initialSnap)
  const [liftY, setLiftY] = React.useState(0)
  const [transformOn, setTransformOn] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const startYRef = React.useRef(0)
  const startSnapRef = React.useRef<Snap>(initialSnap)
  const liftYRef = React.useRef(0)
  const draggingRef = React.useRef(false)
  const transformOnRef = React.useRef(false)
  const clearTimerRef = React.useRef<number | null>(null)

  const clearTransformTimer = React.useCallback(() => {
    if (clearTimerRef.current != null) {
      window.clearTimeout(clearTimerRef.current)
      clearTimerRef.current = null
    }
  }, [])

  const restTransform = React.useCallback(() => {
    clearTransformTimer()
    liftYRef.current = 0
    transformOnRef.current = false
    setLiftY(0)
    setTransformOn(false)
  }, [clearTransformTimer])

  React.useEffect(() => {
    if (!open) return
    setSnap(initialSnap)
    draggingRef.current = false
    setDragging(false)
    restTransform()
  }, [open, initialSnap, restTransform])

  React.useEffect(() => () => clearTransformTimer(), [clearTransformTimer])

  const heightClass = snap === 'full' ? 'h-[min(94dvh,40rem)]' : 'h-[min(68dvh,32rem)]'

  const finishLift = React.useCallback(() => {
    const y = liftYRef.current
    draggingRef.current = false
    setDragging(false)
    const from = startSnapRef.current
    if (y > 110) {
      restTransform()
      onClose()
      return
    }
    if (y > 48 && from === 'full') setSnap('mid')
    else if (y < -48) setSnap('full')

    if (y > 0.5 && transformOnRef.current) {
      window.requestAnimationFrame(() => {
        liftYRef.current = 0
        setLiftY(0)
        clearTransformTimer()
        clearTimerRef.current = window.setTimeout(() => {
          if (!draggingRef.current) restTransform()
        }, 240)
      })
      return
    }
    restTransform()
  }, [clearTransformTimer, onClose, restTransform])

  const onPanelTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName !== 'transform') return
    if (e.target !== e.currentTarget) return
    if (draggingRef.current) return
    if (liftYRef.current > 0.5) return
    restTransform()
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button != null && e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    startYRef.current = e.clientY
    startSnapRef.current = snap
    draggingRef.current = true
    setDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    const dy = e.clientY - startYRef.current
    if (!transformOnRef.current && Math.abs(dy) < 4) return
    const next = Math.max(-80, dy)
    liftYRef.current = next
    transformOnRef.current = true
    setTransformOn(true)
    setLiftY(next)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
    finishLift()
  }

  if (!open) return null

  return (
    <div
      className={`fixed inset-0 ${zClass} flex items-end justify-center bg-black/45`}
      role="presentation"
      onClick={onClose}
    >
      <div
        className={`flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl ${heightClass} ${
          dragging ? '' : 'transition-[height,transform] duration-200 ease-out'
        }`}
        style={transformOn ? { transform: `translateY(${Math.max(0, liftY)}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        onTransitionEnd={onPanelTransitionEnd}
      >
        <div
          className="shrink-0 touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="flex justify-center pt-2.5 pb-1">
            <span className="h-1.5 w-10 rounded-full bg-stone-300" aria-hidden />
          </div>
          {header}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer ? <div className="shrink-0 border-t border-stone-100">{footer}</div> : null}
      </div>
    </div>
  )
}
