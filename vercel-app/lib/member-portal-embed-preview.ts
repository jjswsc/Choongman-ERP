'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'

export type MemberPortalEmbedPreviewState = {
  isEmbedPreview: boolean
  previewLoginBackgroundUrl: string
  previewAppBackgroundUrl: string
}

/** CRM 관리자 iframe 미리보기 (`/m?preview=1&loginBg=...&appBg=...`) */
export function useMemberPortalEmbedPreview(): MemberPortalEmbedPreviewState {
  const searchParams = useSearchParams()
  const isEmbedPreview = searchParams.get('preview') === '1'
  const previewLoginBackgroundUrl = isEmbedPreview ? String(searchParams.get('loginBg') || '').trim() : ''
  const previewAppBackgroundUrl = isEmbedPreview ? String(searchParams.get('appBg') || '').trim() : ''

  React.useEffect(() => {
    if (!isEmbedPreview || typeof document === 'undefined') return
    const { documentElement: html, body } = document
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
    }
  }, [isEmbedPreview])

  return { isEmbedPreview, previewLoginBackgroundUrl, previewAppBackgroundUrl }
}
