"use client"

import { isStoreRepairVideoUrl } from "@/lib/store-repair-media"

type Props = {
  url: string
  className?: string
}

/** 수리 첨부 썸네일 — 동영상은 첫 프레임(메타데이터) 프리뷰 */
export function StoreRepairMediaThumb({ url, className }: Props) {
  if (isStoreRepairVideoUrl(url)) {
    return <video src={url} className={className} muted playsInline preload="metadata" />
  }
   
  return <img src={url} alt="" className={className} />
}
