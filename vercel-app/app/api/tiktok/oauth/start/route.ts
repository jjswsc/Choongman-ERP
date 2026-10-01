import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { requireAuth } from "@/lib/verify-auth"
import { TIKTOK_AUTH_URL, tiktokAppCredentials } from "@/lib/tiktok-ads"

export const dynamic = "force-dynamic"

function redirectUri(req: NextRequest): string {
  const env = String(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")
  const origin = env || req.nextUrl.origin
  return `${origin}/api/tiktok/oauth/callback`
}

function integrationsRedirect(req: NextRequest, code: string) {
  const url = new URL("/admin/marketing/integrations", req.nextUrl.origin)
  url.searchParams.set("tiktok", code)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return integrationsRedirect(req, "auth")
  const { appId } = tiktokAppCredentials()
  if (!appId) return integrationsRedirect(req, "config")

  const state = randomBytes(16).toString("hex")
  const url = new URL(TIKTOK_AUTH_URL)
  url.searchParams.set("app_id", appId)
  url.searchParams.set("redirect_uri", redirectUri(req))
  url.searchParams.set("state", state)

  const res = NextResponse.redirect(url.toString())
  res.cookies.set("cm_tiktok_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
    path: "/",
    maxAge: 600,
  })
  return res
}
