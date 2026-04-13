import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const BRAND_HEADER = "x-app-brand"
const BRAND_COOKIE = "__app_brand"

/** Host 기준으로 판매(OmniFoodTech) vs 내부(충만) 구분 — env 없이도 도메인만으로 브랜드 적용 */
function brandKeyFromHost(host: string): "omnifoodtech" | "choongman" {
  const h = host.trim().toLowerCase()
  if (h.includes("omnifoodtech")) return "omnifoodtech"
  return "choongman"
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || ""
  const brand = brandKeyFromHost(host)
  const reqHeaders = new Headers(request.headers)
  reqHeaders.set(BRAND_HEADER, brand)
  const res = NextResponse.next({ request: { headers: reqHeaders } })
  res.cookies.set(BRAND_COOKIE, brand, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  })
  return res
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot)$).*)",
  ],
}
