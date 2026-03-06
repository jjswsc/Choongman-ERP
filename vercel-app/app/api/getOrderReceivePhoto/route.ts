import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

function parseImageUrls(imageUrl: unknown): string[] {
  if (!imageUrl || typeof imageUrl !== 'string') return []
  const s = String(imageUrl).trim()
  if (!s) return []
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s) as unknown[]
      return (Array.isArray(arr) ? arr : [])
        .filter((u): u is string => typeof u === 'string' && (u.startsWith('http') || u.startsWith('data:image')))
    } catch {
      return []
    }
  }
  if (s.indexOf('http') === 0 || s.indexOf('data:image') === 0) return [s]
  return []
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
