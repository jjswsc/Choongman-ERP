import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { isOmniAppHost } from "@/lib/app-brand"

const BRAND_HEADER = "x-app-brand"
const BRAND_COOKIE = "__app_brand"

/** Host 기준으로 판매(OmniFoodTech) vs 내부(충만) 구분 — env 없이도 도메인만으로 브랜드 적용 */
function brandKeyFromHost(host: string): "omnifoodtech" | "choongman" {
  const h = host.trim().toLowerCase()
  if (isOmniAppHost(h)) return "omnifoodtech"
  const isLocal =
    h.startsWith("localhost") ||
    h.startsWith("127.0.0.1") ||
    h.startsWith("[::1]") ||
    h.includes(".localhost")
  if (isLocal) {
    const env = String(process.env.NEXT_PUBLIC_APP_BRAND || process.env.APP_BRAND || "")
      .trim()
      .toLowerCase()
    if (env === "omnifoodtech" || env === "omni" || env === "saas") return "omnifoodtech"
    return "choongman"
  }
  return "choongman"
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || ""
  const brand = brandKeyFromHost(host)
  const pathname = request.nextUrl.pathname

  /**
   * Windows POS: 공유 public/ 에 Omni용 latest.json·cm-pos-windows-latest-* 가 있어도
   * 충만 호스트에서는 충만 피드/설치본으로 rewrite (브랜드 혼선·잘못된 업데이트 방지).
   * Set-Cookie 없이 반환해 CDN 캐시·대용량 exe 전송 비용을 유지한다.
   */
  if (brand === "choongman" && pathname.startsWith("/downloads/windows-pos/")) {
    if (pathname === "/downloads/windows-pos/latest.json") {
      return NextResponse.rewrite(new URL("/downloads/windows-pos/latest-choongman.json", request.url))
    }
    if (pathname === "/downloads/windows-pos/cm-pos-windows-latest-setup.exe") {
      return NextResponse.rewrite(
        new URL("/downloads/windows-pos/cm-pos-windows-choongman-latest-setup.exe", request.url)
      )
    }
    if (pathname === "/downloads/windows-pos/cm-pos-windows-latest-portable.exe") {
      return NextResponse.rewrite(
        new URL("/downloads/windows-pos/cm-pos-windows-choongman-latest-portable.exe", request.url)
      )
    }
    const versioned = pathname.match(
      /^\/downloads\/windows-pos\/cm-pos-windows-(\d+\.\d+\.\d+)-(setup|portable)\.exe$/
    )
    if (versioned) {
      const [, ver, kind] = versioned
      return NextResponse.rewrite(
        new URL(`/downloads/windows-pos/cm-pos-windows-choongman-${ver}-${kind}.exe`, request.url)
      )
    }
  }

  const reqHeaders = new Headers(request.headers)
  reqHeaders.set(BRAND_HEADER, brand)

  // 다운로드는 브랜드 쿠키 불필요 — Set-Cookie 시 CDN 캐시 무효화
  if (pathname.startsWith("/downloads/")) {
    return NextResponse.next({ request: { headers: reqHeaders } })
  }

  const res = NextResponse.next({ request: { headers: reqHeaders } })
  /**
   * 이미 같은 값의 쿠키가 있으면 Set-Cookie 를 다시 붙이지 않는다.
   * (Set-Cookie 가 붙으면 Vercel CDN 이 해당 응답을 캐시하지 못해 매 요청이 원본으로 가고
   *  Edge Requests·Fast Data Transfer 가 늘어난다.)
   */
  if (request.cookies.get(BRAND_COOKIE)?.value !== brand) {
    res.cookies.set(BRAND_COOKIE, brand, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    })
  }
  return res
}

export const config = {
  matcher: [
    /**
     * - API(`api/`)·이미지 프록시·PWA 정적(`sw.js`, manifest)은 미들웨어에서 제외한다.
     * - API 는 host/bearer 로 브랜드·테넌트를 판정하므로 미들웨어 헤더가 불필요하고,
     *   미들웨어가 Set-Cookie 를 붙이면 각 라우트의 `s-maxage`(CDN 캐시)가 무효화된다.
     * - `sw.js` 는 Serwist 정적 파일인데 미들웨어를 타면 Edge 실행·비용만 늘고 SW 갱신에도 이득 없다.
     * - 페이지(HTML)만 브랜드 쿠키/헤더가 필요하므로 매처에 남긴다.
     */
    "/((?!api/|_next/static|_next/image|favicon.ico|sw\\.js(?:\\?|$)|firebase-messaging-sw\\.js(?:\\?|$)|manifest[^/]*\\.json(?:\\?|$)|login(?:/|$)|admin/login(?:/|$)|saas-admin/login(?:/|$)|pos/login(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$).*)",
  ],
}
