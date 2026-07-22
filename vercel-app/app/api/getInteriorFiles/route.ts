import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  assertInteriorProjectAccess,
  interiorForbiddenResponse,
  requireInteriorTenantRead,
} from '@/lib/interior-tenant-guard'
import { isSaasTenantQueryBlocked } from '@/lib/saas-tenant-scope'

type InteriorFileRow = {
  id?: number
  project_id?: number
  file_type?: string
  file_name?: string
  file_path?: string
  file_size?: number
  uploaded_at?: string
  quote_amount?: number | null
  linked_expense_id?: number | null
}

function mapInteriorFileRows(rows: InteriorFileRow[]) {
  return (rows || []).map((r) => ({
    id: r.id,
    projectId: r.project_id,
    fileType: String(r.file_type || '').trim(),
    fileName: String(r.file_name || '').trim(),
    filePath: String(r.file_path || '').trim(),
    fileSize: r.file_size ?? 0,
    uploadedAt: r.uploaded_at ? String(r.uploaded_at) : null,
    quoteAmount: Number(r.quote_amount) || 0,
    linkedExpenseId: r.linked_expense_id ?? null,
  }))
}

/** 프로젝트 파일 목록 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const guard = await requireInteriorTenantRead(request)
  if (!guard.ok) {
    guard.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return guard.errorResponse
  }

  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json([], { headers })
  if (isSaasTenantQueryBlocked(guard.scope, 'interior_projects')) return NextResponse.json([], { headers })

  const access = await assertInteriorProjectAccess(projectId, guard.scope)
  if (access === 'forbidden') return interiorForbiddenResponse(headers)
  if (access === 'not_found') return NextResponse.json([], { headers })

  const filter = `project_id=eq.${encodeURIComponent(projectId)}`
  const baseOpts = {
    order: 'uploaded_at.desc',
    limit: 100,
  } as const

  try {
    const rows = (await supabaseSelectFilter('interior_project_files', filter, {
      ...baseOpts,
      select: 'id,project_id,file_type,file_name,file_path,file_size,uploaded_at,quote_amount,linked_expense_id',
    })) as InteriorFileRow[]

    return NextResponse.json(mapInteriorFileRows(rows), { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const missingQuoteCols =
      /quote_amount|linked_expense_id|column|does not exist|42703|PGRST204/i.test(msg)
    if (!missingQuoteCols) {
      console.error('getInteriorFiles:', e)
      return NextResponse.json([], { headers })
    }

    try {
      const rows = (await supabaseSelectFilter('interior_project_files', filter, {
        ...baseOpts,
        select: 'id,project_id,file_type,file_name,file_path,file_size,uploaded_at',
      })) as InteriorFileRow[]

      return NextResponse.json(mapInteriorFileRows(rows), { headers })
    } catch (fallbackErr) {
      console.error('getInteriorFiles fallback:', fallbackErr)
      return NextResponse.json([], { headers })
    }
  }
}
