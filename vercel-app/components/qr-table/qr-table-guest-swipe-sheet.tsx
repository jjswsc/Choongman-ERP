'use client'

import * as React from 'react'

type Snap = 'mid' | 'full'

/**
 * QR 게스트용 스와이프 바텀시트.
 * - 핸들·헤더를 위/아래로 드래그하면 mid ↔ full 스냅, 아래로 많이 내리면 닫힘.
 * - 본문 스크롤과 충돌하지 않도록 드래그는 핸들/헤더에서만 시작한다.
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
  const [dragY, setDragY] = React.useState(0)
  const [dragging, setDragging] = React.useState(false)
  const startYRef = React.useRef(0)
  const startSnapRef = React.useRef<Snap>(initialSnap)
  const dragYRef = React.useRef(0)

  React.useEffect(() => {
    if (!open) return
    setSnap(initialSnap)
    setDragY(0)
    dragYRef.current = 0
    setDragging(false)
  }, [open, initialSnap])

  const heightClass = snap === 'full' ? 'h-[min(94dvh,40rem)]' : 'h-[min(68dvh,32rem)]'

  const endDrag = React.useCallback(() => {
    const y = dragYRef.current
    setDragging(false)
    const from = startSnapRef.current
    if (y > 110) {
      setDragY(0)
      dragYRef.current = 0
      onClose()
      return
    }
    if (y > 48 && from === 'full') {
      setSnap('mid')
    } else if (y < -48) {
      setSnap('full')
    }
    setDragY(0)
    dragYRef.current = 0
  }, [onClose])

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button != null && e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    startYRef.current = e.clientY
    startSnapRef.current = snap
    dragYRef.current = 0
    setDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    const dy = e.clientY - startYRef.current
    // 위로(음수)는 full 확장용, 아래로(양수)는 축소·닫기
    const next = Math.max(-80, dy)
    dragYRef.current = next
    setDragY(next)
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging) return
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      /* ignore */
    }
    endDrag()
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
        style={{ transform: `translateY(${Math.max(0, dragY)}px)` }}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
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
