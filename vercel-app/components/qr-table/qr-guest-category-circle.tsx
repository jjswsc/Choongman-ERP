'use client'

import * as React from 'react'

/** 관리자 사진·메뉴 사진이 없을 때. 원 안이 비지 않게 두는 기본 그림. */
function FallbackMark({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8.2 6.4c.5-.75.5-1.35 0-2.1M12 6c.5-.75.5-1.35 0-2.1M15.8 6.4c.5-.75.5-1.35 0-2.1"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
      <path
        fill="currentColor"
        d="M7.2 11.4c.25-2 1.9-3.5 4.8-3.5s4.55 1.5 4.8 3.5H7.2Z"
        opacity="0.9"
      />
      <path fill="currentColor" d="M4.6 12h14.8c-.5 4.7-3.3 7.3-7.4 7.3S5.1 16.7 4.6 12Z" />
    </svg>
  )
}

export function QrGuestCategoryCircle(props: { src?: string; className: string }) {
  const { src, className } = props
  const [failed, setFailed] = React.useState(false)
  React.useEffect(() => {
    setFailed(false)
  }, [src])
  const url = String(src || '').trim()
  if (!url || failed) {
    return (
      <span
        className={`flex items-center justify-center rounded-full bg-amber-50 text-amber-700 ${className}`}
      >
        <FallbackMark className="h-1/2 w-1/2" />
      </span>
    )
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`rounded-full object-cover bg-stone-100 ${className}`}
    />
  )
}
