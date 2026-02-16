import { NextRequest, NextResponse } from 'next/server'

/** 허용 도메인 (SSRF 방지) - localhost/내부IP만 차단 */
function isBlockedHost(host: string): boolean {
  if (!host || host === 'localhost') return true
  if (host.startsWith('127.') || host === '0.0.0.0') return true
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return true
  return false
}

function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    return !isBlockedHost(host)
  } catch {
    return false
  }
}

/** Google Drive URL을 썸네일 형식으로 변환 (직접 로드 실패 시 대체) */
function toDriveThumbnailUrl(url: string): string {
  const m = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1200`
  const m2 = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/)
  if (m2) return `https://drive.google.com/thumbnail?id=${m2[1]}&sz=w1200`
  const m3 = url.match(/drive\.google\.com\/uc\?.*id=([a-zA-Z0-9_-]+)/)
  if (m3) return `https://drive.google.com/thumbnail?id=${m3[1]}&sz=w1200`
  const m4 = url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/)
  if (m4) return `https://drive.google.com/thumbnail?id=${m4[1]}&sz=w1200`
  return url
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rawUrl = searchParams.get('url')
  if (!rawUrl) {
    return new NextResponse('url required', { status: 400 })
  }

  let targetUrl: string
  try {
    targetUrl = decodeURIComponent(rawUrl)
  } catch {
    return new NextResponse('Invalid url', { status: 400 })
  }

  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    return new NextResponse('Invalid url', { status: 400 })
  }

  if (!isAllowedUrl(targetUrl)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  try {
    const urlToFetch = targetUrl.includes('drive.google.com')
      ? toDriveThumbnailUrl(targetUrl)
      : targetUrl

    const res = await fetch(urlToFetch, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CM-ERP-ImageProxy/1.0)',
      },
      next: { revalidate: 3600 },
    })

    if (!res.ok) {
      return new NextResponse(`Upstream error: ${res.status}`, { status: 502 })
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg'
    const buffer = await res.arrayBuffer()

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (e) {
    console.error('imageProxy error:', e)
    return new NextResponse('Proxy error', { status: 502 })
  }
}
