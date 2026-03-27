import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 수령 사진 URL 허용: http(s), data URL(모든 data:), 프로토콜 상대 // */
function normalizeReceivePhotoUrl(raw: string): string {
  const s = raw.trim()
  if (!s) return s
  if (s.startsWith('//')) return `https:${s}`
  return s
}

function isDisplayableImageRef(s: string): boolean {
  const t = s.trim()
  if (!t) return false
  if (t.toLowerCase().startsWith('data:')) return true
  if (/^https?:\/\//i.test(t)) return true
  if (t.startsWith('//')) return true
  return false
}

function parseImageUrls(imageUrl: unknown): string[] {
  const fromArray = (arr: unknown[]): string[] =>
    arr
      .filter((u): u is string => typeof u === 'string')
      .map(normalizeReceivePhotoUrl)
      .filter(isDisplayableImageRef)

  if (imageUrl == null) return []

  if (Array.isArray(imageUrl)) {
    return fromArray(imageUrl)
  }

  if (typeof imageUrl === 'object' && !Array.isArray(imageUrl)) {
    return fromArray(Object.values(imageUrl as Record<string, unknown>))
  }

  if (typeof imageUrl !== 'string') return []

  const s = imageUrl.trim()
  if (!s) return []

  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s) as unknown
      if (Array.isArray(parsed)) return fromArray(parsed)
    } catch {
      return []
    }
  }

  const one = normalizeReceivePhotoUrl(s)
  return isDisplayableImageRef(one) ? [one] : []
}

/** 주문 수령 사진 온디맨드 조회 (출고 내역에서 클릭 시 사용) */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const orderId = String(searchParams.get('orderId') || '').trim()
  if (!orderId) {
    return NextResponse.json({ urls: [] }, { status: 400 })
  }

  try {
    const rows = (await supabaseSelectFilter('orders', `id=eq.${orderId}`, {
      select: 'image_url',
      limit: 1,
    })) as { image_url?: string }[]
    const imageUrl = rows?.[0]?.image_url
    const urls = parseImageUrls(imageUrl)
    return NextResponse.json({ urls })
  } catch (e) {
    console.error('getOrderReceivePhoto:', e)
    return NextResponse.json({ urls: [] }, { status: 500 })
  }
}
