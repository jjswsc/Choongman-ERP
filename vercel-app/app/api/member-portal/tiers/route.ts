import { NextRequest, NextResponse } from 'next/server'
import { mapMemberTiersToPublic, type MemberPortalLang } from '@/lib/member-tier-public'
import { listMemberTiers } from '@/lib/members-server'

function resolveLang(raw: string | null): MemberPortalLang {
  const v = String(raw || '').trim().toLowerCase()
  if (v === 'ko' || v === 'th') return v
  return 'en'
}

export async function GET(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  try {
    const lang = resolveLang(req.nextUrl.searchParams.get('lang'))
    const rows = await listMemberTiers()
    const tiers = mapMemberTiersToPublic(rows, lang).sort((a, b) => b.sortOrder - a.sortOrder)
    return NextResponse.json({ success: true, tiers }, { headers })
  } catch (e) {
    console.error('GET /api/member-portal/tiers:', e)
    return NextResponse.json({ success: false, tiers: [] }, { headers })
  }
}
