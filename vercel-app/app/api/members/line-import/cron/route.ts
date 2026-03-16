import { NextRequest, NextResponse } from 'next/server'
import { processLineCrmImport } from '@/lib/line-crm-import'
import { requireAuth } from '@/lib/verify-auth'

function isCronAuthorized(req: NextRequest): boolean {
  const secret = String(process.env.CRON_SECRET || '').trim()
  if (!secret) return false
  const auth = String(req.headers.get('authorization') || '').trim()
  return auth === `Bearer ${secret}`
}

function buildRemoteHeaders(): HeadersInit {
  const token = String(process.env.LINE_CRM_IMPORT_AUTH_TOKEN || '').trim()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

function pickFileNameFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const last = (u.pathname.split('/').pop() || '').trim()
    return last || 'line-crm-import.xlsx'
  } catch {
    return 'line-crm-import.xlsx'
  }
}

export async function GET(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })

  const fromCron = isCronAuthorized(req)
  let createdBy = 'vercel-cron'
  if (!fromCron) {
    const authRes = await requireAuth(req, 'manager')
    if (authRes.errorResponse) return authRes.errorResponse
    createdBy = String(authRes.auth?.name || '').trim() || 'manager-manual'
  }

  try {
    const sourceUrl = String(process.env.LINE_CRM_IMPORT_FILE_URL || '').trim()
    if (!sourceUrl) {
      return NextResponse.json(
        { success: false, message: 'LINE_CRM_IMPORT_FILE_URL 환경변수가 필요합니다.' },
        { headers }
      )
    }

    const remote = await fetch(sourceUrl, {
      method: 'GET',
      headers: buildRemoteHeaders(),
      cache: 'no-store',
    })
    if (!remote.ok) {
      const body = await remote.text().catch(() => '')
      return NextResponse.json(
        { success: false, message: `원격 CRM 파일 다운로드 실패(${remote.status}): ${body}` },
        { headers }
      )
    }

    const result = await processLineCrmImport({
      fileName: pickFileNameFromUrl(sourceUrl),
      fileBuffer: await remote.arrayBuffer(),
      createdBy,
    })
    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('GET /api/members/line-import/cron:', e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : '자동 LINE CRM 반영에 실패했습니다.',
      },
      { headers }
    )
  }
}
