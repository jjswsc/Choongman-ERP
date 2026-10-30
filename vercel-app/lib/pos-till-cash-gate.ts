import { NextResponse } from 'next/server'
import { canManagePosTillCash } from '@/lib/permissions'

/** 시재(입·출금) API — Staff 포함, Manager 전용 아님 */
export function forbidUnlessPosTillCash(
  role: string | undefined | null,
  headers?: Headers
): NextResponse | null {
  if (canManagePosTillCash(String(role || ''))) return null
  return NextResponse.json(
    {
      success: false,
      msg: '시재 입출금 권한이 없습니다.',
      message: '시재 입출금 권한이 없습니다.',
    },
    { status: 403, headers }
  )
}
