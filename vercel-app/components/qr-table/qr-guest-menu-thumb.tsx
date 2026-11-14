'use client'

import * as React from 'react'
import {
  QR_GUEST_CATEGORY_THUMB_WIDTH,
  QR_GUEST_MENU_THUMB_WIDTH,
  toQrGuestMenuThumbHref,
} from '@/lib/pos-menu-image-url'

/** 손님 QR 리스트·장바구니 썸네일 — 원본 대신 축소 URL + lazy */
export function QrGuestMenuThumb(props: {
  src: string
  className?: string
  width?: number
  alt?: string
}) {
  const { src, className, width = QR_GUEST_MENU_THUMB_WIDTH, alt = '' } = props
  const href = React.useMemo(() => toQrGuestMenuThumbHref(src, { width }), [src, width])
  if (!href) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={href}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
    />
  )
}

export function QrGuestCategoryThumb(props: { src: string; className?: string; alt?: string }) {
  return (
    <QrGuestMenuThumb
      src={props.src}
      className={props.className}
      width={QR_GUEST_CATEGORY_THUMB_WIDTH}
      alt={props.alt}
    />
  )
}
