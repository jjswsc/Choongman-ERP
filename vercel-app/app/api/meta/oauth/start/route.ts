import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { requireAuth } from "@/lib/verify-auth"
import { META_GRAPH_VERSION, META_OAUTH_SCOPES, metaAppCredentials } from "@/lib/meta-graph"

export const dynamic = "force-dynamic"

function redirectUri(req: NextRequest): string {
  const env = String(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "")
  const origin = env || req.nextUrl.origin
  return `${origin}/api/meta/oauth/callback`
}

function integrationsRedirect(req: NextRequest, code: string) {
  const url = new URL("/admin/marketing/integrations", req.nextUrl.origin)
  url.searchParams.set("meta", code)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return integrationsRedirect(req, "auth")
  const { appId } = metaAppCredentials()
  if (!appId) return integrationsRedirect(req, "config")
  const state = randomBytes(16).toString("hex")
  const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`)
  url.searchParams.set("client_id", appId)
  url.searchParams.set("redirect_uri", redirectUri(req))
  url.searchParams.set("state", state)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", META_OAUTH_SCOPES)

  const res = NextResponse.redirect(url.toString())
  res.cookies.set("cm_meta_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" || process.env.VERCEL === "1",
    path: "/",
    maxAge: 600,
  })
  return res
}
