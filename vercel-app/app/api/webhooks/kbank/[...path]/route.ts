import { NextRequest, NextResponse } from 'next/server'

/**
 * KBank MPP 웹훅 URL 스텁. 온보딩 제출 후 은행·검증용 ping에서 404를 피하기 위함.
 * 실제 서명 검증·비즈니스 처리는 추후 이 핸들러에서 확장.
 */
export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: 'GET, POST, OPTIONS',
    },
  })
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params
  return NextResponse.json({
    ok: true,
    stub: true,
    method: 'GET',
    path: path ?? [],
  })
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params
  try {
    await req.text()
  } catch {
    /* 본문 없음 */
  }
  return NextResponse.json({
    ok: true,
    stub: true,
    method: 'POST',
    path: path ?? [],
  })
}
