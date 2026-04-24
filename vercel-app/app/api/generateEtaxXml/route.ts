/**
 * e-Tax 인보이스 XML 생성 API
 * POST: 출고 그룹 데이터 → Thai e-Tax XML 생성 (옵션: 디지털 서명)
 * Body: { groups: OutboundGroup[], sign?: boolean }
 * 서명 시 env: ETDA_CERT_BASE64, ETDA_CERT_PASSWORD 필요
 */
import { NextRequest, NextResponse } from 'next/server'
import { generateEtaxXml, type EtaxInvoiceInput } from '@/lib/etax-xml'
import { signEtaxXml } from '@/lib/etax-sign'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { fetchSalesTypesVendorsForInvoice } from '@/lib/invoice-vendor-clients'

interface OutboundGroup {
  date: string
  target: string
  type: string
  invoiceNo?: string
  items: { name: string; code?: string; spec?: string; qty: number; amount: number }[]
  totalAmt: number
}

interface InvoiceDataClient {
  companyName: string
  address: string
  taxId: string
  phone: string
}

async function getInvoiceData(): Promise<{
  company: { companyName: string; address: string; taxId: string; phone: string }
  clients: Record<string, InvoiceDataClient>
}> {
  let companyRows = (await supabaseSelectFilter('vendors', 'type=eq.본사', { limit: 1 })) as {
    name?: string
    addr?: string
    tax_id?: string
    phone?: string
    memo?: string
  }[] | null
  if (!companyRows?.length) {
    companyRows = (await supabaseSelectFilter('vendors', 'type=eq.Head Office', { limit: 1 })) as typeof companyRows
  }
  const company = companyRows?.[0]
    ? {
        companyName: String(companyRows[0].name || '').trim() || 'บริษัท เอสแอนด์เจ โกลบอล จำกัด',
        address: String(companyRows[0].addr || '').trim() || '-',
        taxId: String((companyRows[0] as { tax_id?: string }).tax_id || '0105566137147').trim(),
        phone: String(companyRows[0].phone || '').trim() || '-',
      }
    : {
        companyName: 'บริษัท เอสแอนด์เจ โกลบอล จำกัด',
        address: '-',
        taxId: '0105566137147',
        phone: '-',
      }

  const clients: Record<string, InvoiceDataClient> = {}
  const clientRows = await fetchSalesTypesVendorsForInvoice()
  for (const r of clientRows) {
    const companyName = String(r.name || '').trim()
    const gpsName = String((r as { gps_name?: string }).gps_name || '').trim()
    const salesOutlet = String((r as { sales_outlet?: string }).sales_outlet || '').trim()
    const displayName = salesOutlet || gpsName || companyName
    if (!companyName && !gpsName && !salesOutlet) continue
    const entry: InvoiceDataClient = {
      companyName: companyName || displayName,
      address: String(r.addr || '').trim() || '-',
      taxId: String((r as { tax_id?: string }).tax_id || '').trim() || '-',
      phone: String(r.phone || '').trim() || '-',
    }
    const keysToAdd = [companyName, gpsName, salesOutlet].filter(Boolean)
    if (gpsName && gpsName.match(/^CM\s+/i)) keysToAdd.push(gpsName.replace(/^CM\s+/i, ''))
    for (const k of keysToAdd) {
      if (k) {
        clients[k] = entry
        clients[k.toLowerCase()] = entry
      }
    }
  }
  return { company, clients }
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

    const { company, clients } = await getInvoiceData()
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
