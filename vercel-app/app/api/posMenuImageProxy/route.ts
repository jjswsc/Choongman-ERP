import { NextRequest, NextResponse } from 'next/server'
import { supabaseFetch } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

function isAllowedUpstream(parsed: URL): boolean {
  const h = parsed.hostname.toLowerCase()
  if (!h.endsWith('.supabase.co') && h !== 'supabase.co') return false
  return parsed.pathname.includes('/storage/v1/object/')
}

/** `/storage/v1/object/public/{bucket}/{path}` → bucket + object path */
function parsePublicStorageObject(parsed: URL): { bucket: string; path: string } | null {
  const m = parsed.pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/i)
  if (!m) return null
  const bucket = decodeURIComponent(m[1] || '').trim()
  const path = decodeURIComponent(m[2] || '').trim()
  if (!bucket || !path) return null
  return { bucket, path }
}

async function fetchStorageWithServiceRole(bucket: string, objectPath: string): Promise<Response | null> {
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '')
    .trim()
    .replace(/\/$/, '')
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!base || !key) return null

  const encodedPath = objectPath
    .split('/')
    .filter(Boolean)
    .map((p) => encodeURIComponent(p))
    .join('/')
  const apiPath = `${base}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`

  return supabaseFetch(apiPath, {
    method: 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'image/*,*/*;q=0.8',
    },
    cache: 'no-store',
  })
}

async function readImageResponse(upstream: Response): Promise<NextResponse | null> {
  if (!upstream.ok || !upstream.body) return null
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

  let upstream = await fetch(parsed.href, {
    redirect: 'follow',
    cache: 'no-store',
    headers: { Accept: 'image/*,*/*;q=0.8' },
  })

  let body = await readImageResponse(upstream)
  if (body) return body

  const storageObj = parsePublicStorageObject(parsed)
  if (storageObj) {
    const authed = await fetchStorageWithServiceRole(storageObj.bucket, storageObj.path)
    if (authed) {
      body = await readImageResponse(authed)
      if (body) return body
    }
  }

  return new NextResponse(null, {
    status: upstream.status === 200 ? 502 : upstream.status,
  })
}
