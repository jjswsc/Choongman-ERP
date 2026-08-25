import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import {
  extractExpenseDocumentFromDataUrl,
  extractPurchaseTaxInvoiceFromImageUrls,
} from '@/lib/expense-document-parse'

export const maxDuration = 60

function collectImageUrls(body: { dataUrl?: string; imageUrls?: unknown }): string[] {
  const extra = Array.isArray(body.imageUrls)
    ? body.imageUrls.filter((u): u is string => typeof u === 'string' && u.startsWith('data:image/'))
    : []
  const dataUrl = String(body.dataUrl || '').trim()
  const urls = [...extra]
  if (dataUrl.startsWith('data:image/') && !urls.includes(dataUrl)) urls.unshift(dataUrl)
  return urls.slice(0, 4)
}

/** 인보이스·영수증 이미지/PDF에서 금액·일자·VAT 등 추출 (휴리스틱 + OpenAI Vision) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    authResult.errorResponse.headers.set('Content-Type', 'application/json')
    return authResult.errorResponse
  }

  try {
    const body = (await request.json()) as {
      dataUrl?: string
      imageUrls?: unknown
      fileName?: string
      schema?: string
      buyerTaxId?: string
      buyerName?: string
      pageText?: string
    }
    const imageUrls = collectImageUrls(body)
    const dataUrl = imageUrls[0] || String(body.dataUrl || '').trim()
    const fileName = String(body.fileName || 'document.jpg').trim()
    const schema = String(body.schema || '').trim().toLowerCase()
    if (!dataUrl.startsWith('data:')) {
      return NextResponse.json({ success: false, message: 'dataUrl이 필요합니다.' }, { status: 400, headers })
    }

    const lower = fileName.toLowerCase()
    const okType =
      lower.endsWith('.pdf') ||
      /\.(png|jpe?g|webp|gif|heic|heif)$/.test(lower) ||
      dataUrl.startsWith('data:image/') ||
      dataUrl.startsWith('data:application/pdf')
    if (!okType) {
      return NextResponse.json(
        { success: false, message: 'PDF 또는 이미지 파일만 인식할 수 있습니다.' },
        { status: 400, headers }
      )
    }

    if (schema === 'purchase_tax_invoice' || schema === 'purchasetaxinvoice') {
      const { invoices, openaiUsed, error } = await extractPurchaseTaxInvoiceFromImageUrls(
        imageUrls.length ? imageUrls : [dataUrl],
        {
          buyerTaxId: String(body.buyerTaxId || '').trim(),
          buyerName: String(body.buyerName || '').trim(),
          pageText: String(body.pageText || '').trim(),
        }
      )
      if (!invoices.length) {
        const noKey = error === 'no_openai_key' || !process.env.OPENAI_API_KEY?.trim()
        return NextResponse.json(
          {
            success: false,
            invoices: [],
            openaiUsed,
            error,
            message: noKey
              ? '문서에서 항목을 찾지 못했습니다. OPENAI_API_KEY 설정 후 다시 시도하거나 직접 입력해 주세요.'
              : '문서에서 항목을 찾지 못했습니다. 직접 입력해 주세요.',
          },
          { headers }
        )
      }
      return NextResponse.json(
        {
          success: true,
          fields: invoices[0],
          invoices,
          openaiUsed,
        },
        { headers }
      )
    }

    const { result, openaiUsed } = await extractExpenseDocumentFromDataUrl(dataUrl, fileName)
    if (!result) {
      const noKey = !process.env.OPENAI_API_KEY?.trim()
      return NextResponse.json(
        {
          success: false,
          message: noKey
            ? '문서에서 항목을 찾지 못했습니다. OPENAI_API_KEY 설정 후 다시 시도하거나 직접 입력해 주세요.'
            : '문서에서 항목을 찾지 못했습니다. 직접 입력해 주세요.',
        },
        { headers }
      )
    }

    return NextResponse.json(
      {
        success: true,
        fields: {
          amount: result.amount,
          vatAmount: result.vatAmount,
          withholdingTaxAmount: result.withholdingTaxAmount,
          expenseDate: result.expenseDate,
          invoiceNo: result.invoiceNo,
          vendorNameHint: result.vendorNameHint,
        },
        confidence: result.confidence,
        method: result.method,
        openaiUsed,
      },
      { headers }
    )
  } catch (e) {
    console.error('extractExpenseDocument:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
