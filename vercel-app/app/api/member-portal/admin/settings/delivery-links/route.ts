import { NextRequest, NextResponse } from 'next/server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import { requireMemberPortalAdminAuth } from '@/lib/verify-auth'

const KEY_GRAB = 'member_portal_delivery_grab_url'
const KEY_LINEMAN = 'member_portal_delivery_lineman_url'
const KEY_SHOPEE = 'member_portal_delivery_shopee_url'

function asHttpUrl(raw: unknown): string {
  const v = String(raw || '').trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  return `https://${v}`
}

export async function GET(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const filter = `or=(key.eq.${KEY_GRAB},key.eq.${KEY_LINEMAN},key.eq.${KEY_SHOPEE})`
    const rows = (await supabaseSelectFilter('system_settings', filter, {
      limit: 10,
      select: 'key,value_json',
    })) as { key?: string; value_json?: unknown }[]

    const map = new Map<string, string>()
    for (const row of rows || []) {
      const key = String(row.key || '').trim()
      const value = String(row.value_json || '').trim()
      if (!key) continue
      map.set(key, value)
    }

    return NextResponse.json({
      success: true,
      grabUrl: map.get(KEY_GRAB) || '',
      linemanUrl: map.get(KEY_LINEMAN) || '',
      shopeeUrl: map.get(KEY_SHOPEE) || '',
    })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '설정을 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const authResult = await requireMemberPortalAdminAuth(req)
  if (authResult.errorResponse) return authResult.errorResponse
  try {
    const body = (await req.json()) as { grabUrl?: string; linemanUrl?: string; shopeeUrl?: string }
    const rows: Record<string, unknown>[] = [
      {
        key: KEY_GRAB,
        value_json: asHttpUrl(body.grabUrl),
        updated_at: getBangkokDateTimeString(),
      },
      {
        key: KEY_LINEMAN,
        value_json: asHttpUrl(body.linemanUrl),
        updated_at: getBangkokDateTimeString(),
      },
      {
        key: KEY_SHOPEE,
        value_json: asHttpUrl(body.shopeeUrl),
        updated_at: getBangkokDateTimeString(),
      },
    ]
    await supabaseUpsert('system_settings', rows, 'key')
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '설정을 저장하지 못했습니다.' },
      { status: 500 }
    )
  }
}
