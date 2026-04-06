import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

function isAllowedUpstream(parsed: URL): boolean {
  const h = parsed.hostname.toLowerCase()
  if (!h.endsWith('.supabase.co') && h !== 'supabase.co') return false
  return parsed.pathname.includes('/storage/v1/object/')
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('u')?.trim()
  if (!raw) {
    return new NextResponse(null, { status: 400 })
  }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return new NextResponse(null, { status: 400 })
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return new NextResponse(null, { status: 400 })
  }
  if (!isAllowedUpstream(parsed)) {
    return new NextResponse(null, { status: 403 })
  }

  const upstream = await fetch(parsed.href, {
    redirect: 'follow',
    cache: 'no-store',
    headers: { Accept: 'image/*,*/*;q=0.8' },
  })
  if (!upstream.ok || !upstream.body) {
    return new NextResponse(null, { status: upstream.status === 200 ? 502 : upstream.status })
  }

  const rawCt = upstream.headers.get('content-type')?.split(';')[0]?.trim() || ''
  const outCt = /^image\//i.test(rawCt) ? rawCt : 'image/jpeg'

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': outCt,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
