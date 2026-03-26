import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { registerLineMember } from '@/lib/members-server'
import { getLineFollowerIds, getLineUserProfile } from '@/lib/line-messaging-server'

export async function POST(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse

  try {
    const body = (await req.json().catch(() => ({}))) as { limit?: number }
    const totalLimit = Math.max(1, Math.min(Number(body?.limit || 2000), 10000))
    let cursor = ''
    let done = false

    const collectedIds: string[] = []
    while (!done && collectedIds.length < totalLimit) {
      const pageLimit = Math.min(300, totalLimit - collectedIds.length)
      const page = await getLineFollowerIds({ limit: pageLimit, cursor })
      for (const id of page.userIds) {
        if (!id) continue
        collectedIds.push(id)
        if (collectedIds.length >= totalLimit) break
      }
      cursor = page.next
      if (!cursor || page.userIds.length === 0) done = true
    }

    let synced = 0
    let syncedWithProfile = 0
    let syncedStubOnly = 0
    let failed = 0
    const errors: string[] = []
    for (const userId of collectedIds) {
      try {
        const profile = await getLineUserProfile(userId).catch(() => ({ displayName: '', pictureUrl: '' }))
        const displayName = String(profile.displayName || '').trim()
        const pictureUrl = String(profile.pictureUrl || '').trim()
        await registerLineMember({
          lineUserId: userId,
          displayName: displayName || undefined,
          pictureUrl: pictureUrl || undefined,
          name: displayName || undefined,
        })
        synced += 1
        if (displayName) syncedWithProfile += 1
        else syncedStubOnly += 1
      } catch (e) {
        failed += 1
        if (errors.length < 20) errors.push(e instanceof Error ? e.message : 'unknown error')
      }
    }

    return NextResponse.json(
      {
        success: true,
        scanned: collectedIds.length,
        synced,
        syncedWithProfile,
        syncedStubOnly,
        failed,
        hasNextCursor: Boolean(cursor),
        nextCursor: cursor || undefined,
        errors,
      },
      { headers }
    )
  } catch (e) {
    console.error('POST /api/members/line-sync:', e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : 'LINE 회원 전체 동기화에 실패했습니다.',
      },
      { headers }
    )
  }
}
