/**
 * e-Tax 인보이스 XML 생성 API
 * POST: 출고 그룹 데이터 → Thai e-Tax XML 생성 (옵션: 디지털 서명)
 * Body: { groups: OutboundGroup[], sign?: boolean }
 * 서명 시 env: ETDA_CERT_BASE64, ETDA_CERT_PASSWORD 필요
 */
import { NextRequest, NextResponse } from 'next/server'
import { generateEtaxXml, type EtaxInvoiceInput } from '@/lib/etax-xml'
import { signEtaxXml } from '@/lib/etax-sign'
import { loadInvoiceSellerAndBillTo } from '@/lib/invoice-vendor-clients'
import { resolveInventoryTenantScope } from '@/lib/inventory-tenant-scope'
import { isOutboundBillableForInvoice } from '@/lib/outbound-billable-delivery'
import { getVerifiedAuth } from '@/lib/verify-auth'

interface OutboundGroup {
  date: string
  target: string
  type: string
  invoiceNo?: string
  deliveryStatus?: string
  items: { name: string; code?: string; spec?: string; qty: number; amount: number }[]
  totalAmt: number
}

interface InvoiceDataClient {
  companyName: string
  address: string
  taxId: string
  phone: string
}

function findClient(clients: Record<string, InvoiceDataClient>, target: string): InvoiceDataClient {
  const t = String(target || '').trim()
  const tLower = t.toLowerCase()
  const withoutCM = t.replace(/^CM\s+/i, '')
  const withCM = t.match(/^CM\s+/i) ? t : 'CM ' + t
  return clients[t] || clients[tLower] || clients[withoutCM] || clients[withoutCM.toLowerCase()] ||
    clients[withCM] || clients[withCM.toLowerCase()] || {
    companyName: t || '-',
    address: '-',
    taxId: '-',
    phone: '-',
  }
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await request.json().catch(() => ({}))) as { groups?: OutboundGroup[]; sign?: boolean }
    const groups = Array.isArray(body.groups) ? body.groups : []
    const wantSign = !!body.sign
    if (groups.length === 0) {
      return NextResponse.json({ error: 'No groups provided', xml: null }, { status: 400, headers })
    }
    const notBillable = groups.filter(
      (g) => !isOutboundBillableForInvoice({ type: g.type, deliveryStatus: g.deliveryStatus })
    )
    if (notBillable.length > 0) {
      return NextResponse.json(
        { error: 'Only delivered outbound can generate e-Tax (จัดส่งแล้ว)', xml: null },
        { status: 400, headers }
      )
    }

    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const scope = await resolveInventoryTenantScope({ auth })
    const { company, clients } = await loadInvoiceSellerAndBillTo(scope)
    const results: { refKey: string; invoiceNo: string; xml: string }[] = []

    for (const g of groups) {
      const dateStr = (g.date || '').slice(0, 10)
      const refKey = `${g.date}_${g.target}_${g.type}_${(g as { orderRowId?: string }).orderRowId || ''}`.trim()
      const invoiceNo = g.invoiceNo || `IV-${dateStr.replace(/\D/g, '')}-${results.length + 1}`
      const client = findClient(clients, g.target)
      const totalAmt = Math.round(Math.abs(g.totalAmt || 0))
      const vat7 = Math.round(totalAmt * 0.07)
      const grandTotal = totalAmt + vat7

      const lineItems = (g.items || []).map((it, idx) => {
        const qty = Math.abs(it.qty || 0)
        const amt = Math.round(Math.abs(it.amount || 0))
        const price = qty ? amt / qty : 0
        return {
          lineId: `Line-${idx + 1}`,
          name: `${it.name || '-'}${it.spec ? ` ${it.spec}` : ''}`,
          quantity: qty,
          unitCode: 'EA' as const,
          unitPrice: price,
          lineTotalAmount: amt,
        }
      })

      const input: EtaxInvoiceInput = {
        documentId: invoiceNo,
        documentType: 'ใบกำกับภาษี',
        issueDate: dateStr,
        invoiceNo,
        seller: {
          id: 'SELLER-001',
          globalId: company.taxId,
          name: company.companyName,
          taxId: company.taxId,
          address: company.address,
          phone: company.phone,
        },
        buyer: {
          id: `BUYER-${g.target}`,
          name: client.companyName,
          taxId: client.taxId || undefined,
          address: client.address,
          phone: client.phone,
        },
        currency: 'THB',
        lineExtensionAmount: totalAmt,
        taxBasisAmount: totalAmt,
        taxAmount: vat7,
        grandTotal,
        lineItems,
        vatPercent: 7,
      }

      let xml = generateEtaxXml(input)
      if (wantSign) {
        const p12Base64 = process.env.ETDA_CERT_BASE64?.trim()
        const p12Password = process.env.ETDA_CERT_PASSWORD ?? ''
        if (p12Base64 && p12Password) {
          try {
            xml = signEtaxXml(xml, { p12Base64, password: p12Password })
          } catch (signErr) {
            console.error('generateEtaxXml sign error:', signErr)
            return NextResponse.json(
              { error: 'ETAX_SIGN: ' + String(signErr instanceof Error ? signErr.message : signErr), xml: null },
              { status: 500, headers }
            )
          }
        }
      }
      results.push({ refKey, invoiceNo, xml })
    }

    return NextResponse.json({
      success: true,
      count: results.length,
      results: results.map((r) => ({ refKey: r.refKey, invoiceNo: r.invoiceNo })),
      xml: results.length === 1 ? results[0].xml : null,
      xmls: results.map((r) => ({ refKey: r.refKey, invoiceNo: r.invoiceNo, xml: r.xml })),
    }, { headers })
  } catch (e) {
    console.error('generateEtaxXml:', e)
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e), xml: null },
      { status: 500, headers }
    )
  }
}
