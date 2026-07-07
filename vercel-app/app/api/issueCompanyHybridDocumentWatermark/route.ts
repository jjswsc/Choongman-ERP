import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { companyHybridDocVisibilityFromDocType } from '@/lib/company-hybrid-documents'
import { canViewCompanyHybridDocument } from '@/lib/company-hybrid-documents-access'
import { logCompanyHybridDocumentEvent } from '@/lib/company-hybrid-documents-audit'
import {
  applyCompanyHybridDocumentWatermark,
  buildCompanyHybridWatermarkLines,
  buildWatermarkedDownloadName,
  fetchCompanyHybridDocumentBytes,
  formatBangkokDateForWatermark,
  isCompanyHybridWatermarkSupportedDoc,
} from '@/lib/company-hybrid-documents-watermark'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_WATERMARK_BYTES = 40 * 1024 * 1024

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth

    const body = (await request.json()) as {
      id?: number
      issuedTo?: string
      purpose?: string
    }
    const id = body.id != null ? Number(body.id) : 0
    const issuedTo = String(body.issuedTo || '').trim()
    const purpose = String(body.purpose || '').trim()

    if (!id) {
      return NextResponse.json({ success: false, message: 'id가 필요합니다.' }, { status: 400, headers })
    }
    if (!issuedTo) {
      return NextResponse.json(
        { success: false, message: 'Issued to (employee name) is required.' },
        { status: 400, headers }
      )
    }
    if (!purpose) {
      return NextResponse.json({ success: false, message: 'Purpose is required.' }, { status: 400, headers })
    }
    if (issuedTo.length > 120 || purpose.length > 300) {
      return NextResponse.json({ success: false, message: 'Input is too long.' }, { status: 400, headers })
    }

    const existing = (await supabaseSelectFilter('company_hybrid_documents', `id=eq.${id}`, {
      limit: 1,
    })) as
      | {
          id?: number
          store?: string
          deleted_at?: string | null
          title?: string
          doc_type?: string | null
          source?: string
          mime?: string | null
          storage_path?: string | null
          file_name?: string | null
          file_size?: number | null
        }[]
      | null
    const row = existing?.[0]
    if (!row || row.deleted_at) {
      return NextResponse.json({ success: false, message: '문서를 찾을 수 없습니다.' }, { status: 404, headers })
    }

    const store = String(row.store || '').trim()
    const visibility = companyHybridDocVisibilityFromDocType(row.doc_type)
    if (!canViewCompanyHybridDocument(auth, store, visibility)) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
    }
    if (!isCompanyHybridWatermarkSupportedDoc(row)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Watermark is available for uploaded PDF or image files only.',
        },
        { status: 400, headers }
      )
    }

    const fileSize = Number(row.file_size)
    if (Number.isFinite(fileSize) && fileSize > MAX_WATERMARK_BYTES) {
      return NextResponse.json({ success: false, message: 'File is too large for watermark.' }, { status: 400, headers })
    }

    const storagePath = String(row.storage_path || '').trim()
    const mime = String(row.mime || 'application/octet-stream').trim()
    const rawBytes = await fetchCompanyHybridDocumentBytes(storagePath)
    if (rawBytes.length > MAX_WATERMARK_BYTES) {
      return NextResponse.json({ success: false, message: 'File is too large for watermark.' }, { status: 400, headers })
    }

    const issuedOn = formatBangkokDateForWatermark()
    const lines = buildCompanyHybridWatermarkLines({
      documentId: id,
      issuedTo,
      purpose,
      issuedOn,
    })
    const watermarked = await applyCompanyHybridDocumentWatermark(rawBytes, mime, lines)
    const downloadName = buildWatermarkedDownloadName(row.file_name, watermarked.extension)

    await logCompanyHybridDocumentEvent(id, 'view', store, { name: auth.name, store: auth.store }, {
      kind: 'watermark_issue',
      issuedTo,
      purpose,
      issuedOn,
      documentRef: `CHD-${id}`,
      fileName: downloadName,
    })

    const outHeaders = new Headers(headers)
    outHeaders.set('Content-Type', watermarked.contentType)
    outHeaders.set('Content-Disposition', `attachment; filename="${downloadName.replace(/"/g, '')}"`)
    outHeaders.set('Cache-Control', 'no-store')
    return new NextResponse(new Uint8Array(watermarked.bytes), { status: 200, headers: outHeaders })
  } catch (e) {
    console.error('issueCompanyHybridDocumentWatermark:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
