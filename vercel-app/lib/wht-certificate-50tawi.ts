import type { WhtCertificateData, WhtCertificateIncomeLine } from '@/lib/wht-certificate-data'
import { thaiBahtInWords } from '@/lib/thai-baht-text'
import { resolveWhtPndFormHint } from '@/lib/wht-pnd-form-hint'

export type Wht50TawiIncomeRowKey = 'r1' | 'r2' | 'r3' | 'r4a' | 'r4b' | 'r5' | 'r6'
export type Wht50TawiCopyNo = 1 | 2

export type Wht50TawiPlacedLine = {
  date: string
  gross: number
  wht: number
}

export type Wht50TawiResolved = {
  bookNo: string
  certNo: string
  agentName: string
  agentAddress: string
  agentTaxId: string
  recipientName: string
  recipientAddress: string
  recipientTaxId: string
  paymentDateDisplay: string
  incomeRow: Wht50TawiIncomeRowKey
  incomeOtherText: string
  grossAmount: number
  whtAmount: number
  whtAmountText: string
  pndChecks: Record<string, boolean>
  payerMode: 'withhold' | 'forever' | 'once' | 'other'
  sequenceNo: string
  /** 공식 표 행별 금액 (여러 건이면 r5·r6에 나눠 넣음) */
  amountsByRow: Partial<Record<Wht50TawiIncomeRowKey, Wht50TawiPlacedLine[]>>
}

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtNum(n: number): string {
  const x = Number(n)
  if (!Number.isFinite(x)) return ''
  return x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function normalizeTaxId(raw: string): string {
  return String(raw || '')
    .replace(/\D/g, '')
    .slice(0, 13)
}

/** 공식 양식 Tax ID 칸 — 그룹 1-4-5-2-1 */
function taxIdCells(taxId: string): string {
  const digits = normalizeTaxId(taxId).padEnd(13, ' ').split('')
  const groups = [1, 4, 5, 2, 1]
  let i = 0
  const parts: string[] = []
  for (let g = 0; g < groups.length; g++) {
    if (g > 0) parts.push('<td class="wht-tin-dash">-</td>')
    for (let k = 0; k < groups[g]; k++) {
      const d = digits[i++] || ' '
      parts.push(`<td class="wht-tin-cell">${d.trim() ? esc(d) : '&nbsp;'}</td>`)
    }
  }
  return parts.join('')
}

function formatThaiPaymentDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').slice(0, 10))
  if (!m) return ''
  const y = Number(m[1]) + 543
  return `${Number(m[3])}/${Number(m[2])}/${y}`
}

function parseBookCertNo(certificateNo: string): { bookNo: string; certNo: string } {
  const raw = String(certificateNo || '').trim()
  if (!raw || raw === '—') return { bookNo: '', certNo: '' }
  const dash = raw.lastIndexOf('-')
  if (dash > 0) {
    return { bookNo: raw.slice(0, dash), certNo: raw.slice(dash + 1) }
  }
  return { bookNo: '', certNo: raw }
}

function resolveIncomeRow(data: { incomeType?: string; memo?: string }): { row: Wht50TawiIncomeRowKey; otherText: string } {
  const t = String(data.incomeType || '').toLowerCase()
  if (/เงินเดือน|salary|급여|40\s*\(\s*1\s*\)/i.test(t)) return { row: 'r1', otherText: '' }
  if (/ค่าธรรมเนียม|commission|40\s*\(\s*2\s*\)/i.test(t)) return { row: 'r2', otherText: '' }
  if (/ลิขสิทธิ|royalt|40\s*\(\s*3\s*\)/i.test(t)) return { row: 'r3', otherText: '' }
  if (/ดอกเบี้ย|interest|40\s*\(\s*4\s*\)\s*\(\s*ก\s*\)/i.test(t)) return { row: 'r4a', otherText: '' }
  if (/ปันผล|dividend|40\s*\(\s*4\s*\)\s*\(\s*ข\s*\)/i.test(t)) return { row: 'r4b', otherText: '' }
  if (
    /ค่าบริการ|ค่าเช่า|ค่าโฆษณา|ค่าขนส่ง|ค่าจ้าง|ค่าแสดง|service|rent|용역|서비스|40\s*\(\s*5\s*\)|คำสั่งกรมสรรพากร/i.test(t)
  ) {
    return { row: 'r5', otherText: '' }
  }
  const label = String(data.incomeType || data.memo || '').trim()
  return { row: 'r6', otherText: label || 'ค่าใช้จ่าย' }
}

function certificateIncomeLines(data: WhtCertificateData): WhtCertificateIncomeLine[] {
  if (Array.isArray(data.incomeLines) && data.incomeLines.length > 0) {
    return data.incomeLines.filter((ln) => Number(ln.whtAmount) > 0 || Number(ln.grossAmount) > 0)
  }
  return [
    {
      incomeType: data.incomeType,
      paymentDate: data.paymentDate,
      grossAmount: data.grossAmount,
      whtAmount: data.whtAmount,
      whtRate: data.whtRate,
    },
  ]
}

function placeIncomeLines(
  data: WhtCertificateData
): {
  amountsByRow: Partial<Record<Wht50TawiIncomeRowKey, Wht50TawiPlacedLine[]>>
  incomeRow: Wht50TawiIncomeRowKey
  incomeOtherText: string
} {
  const lines = certificateIncomeLines(data)
  const amountsByRow: Partial<Record<Wht50TawiIncomeRowKey, Wht50TawiPlacedLine[]>> = {}
  const push = (row: Wht50TawiIncomeRowKey, line: WhtCertificateIncomeLine) => {
    const date = formatThaiPaymentDate(line.paymentDate || data.paymentDate)
    const placed: Wht50TawiPlacedLine = {
      date,
      gross: Number(line.grossAmount) || 0,
      wht: Number(line.whtAmount) || 0,
    }
    const arr = amountsByRow[row] || []
    arr.push(placed)
    amountsByRow[row] = arr
  }

  if (lines.length <= 1) {
    const only = lines[0]
    const income = resolveIncomeRow({ incomeType: only?.incomeType || data.incomeType, memo: data.memo })
    if (only) push(income.row, only)
    return { amountsByRow, incomeRow: income.row, incomeOtherText: income.otherText }
  }

  const mapped = lines.map((ln) => ({ ln, ...resolveIncomeRow({ incomeType: ln.incomeType }) }))
  const allR5 = mapped.every((m) => m.row === 'r5')
  if (allR5) {
    push('r5', mapped[0].ln)
    for (let i = 1; i < mapped.length; i++) push('r6', mapped[i].ln)
    const labels = [...new Set(mapped.map((m) => String(m.ln.incomeType || '').trim()).filter(Boolean))]
    return {
      amountsByRow,
      incomeRow: 'r5',
      incomeOtherText: labels.join(', ') || 'ค่าเช่า, ค่าบริการ',
    }
  }

  for (const m of mapped) push(m.row, m.ln)
  const r6Labels = mapped
    .filter((m) => m.row === 'r6')
    .map((m) => String(m.ln.incomeType || '').trim())
    .filter(Boolean)
  const fallback = resolveIncomeRow({ incomeType: data.incomeType, memo: data.memo })
  return {
    amountsByRow,
    incomeRow: mapped[0]?.row || fallback.row,
    incomeOtherText: r6Labels.join(', ') || fallback.otherText,
  }
}

function resolvePndChecks(formHint: string): Record<string, boolean> {
  const h = String(formHint || '').toUpperCase()
  return {
    pnd1k: /PND1K|ภ\.ง\.ด\.1ก/i.test(h) && !/พิเศษ/i.test(h),
    pnd1kSpecial: /PND1.*พิเศษ|1ก.*พิเศษ/i.test(h),
    pnd2: /PND2[^K]|ภ\.ง\.ด\.2[^ก]/i.test(h),
    pnd3: /PND3[^K53]|ภ\.ง\.ด\.3[^ก53]/i.test(h),
    pnd2k: /PND2K|2ก/i.test(h),
    pnd3k: /PND3K|3ก/i.test(h),
    pnd53: /PND53|ภ\.ง\.ด\.53/i.test(h),
  }
}

export function resolveWht50Tawi(data: WhtCertificateData): Wht50TawiResolved {
  const { bookNo, certNo } = parseBookCertNo(data.certificateNo)
  const placed = placeIncomeLines(data)
  const fromHint = resolvePndChecks(data.formHint)
  const pnd = {
    pnd1k: fromHint.pnd1k,
    pnd1kSpecial: fromHint.pnd1kSpecial,
    pnd2: fromHint.pnd2,
    pnd2k: fromHint.pnd2k,
    pnd3k: fromHint.pnd3k,
    pnd3: false,
    pnd53: false,
  }
  const recipientHint = resolveWhtPndFormHint({
    payeeName: data.incomeRecipient.name,
    incomeType: data.incomeType,
    payeeTaxId: data.incomeRecipient.taxId,
  })
  if (recipientHint === 'PND3') pnd.pnd3 = true
  else pnd.pnd53 = true
  return {
    bookNo,
    certNo,
    agentName: data.withholdingAgent.name || '',
    agentAddress: data.withholdingAgent.address || '',
    agentTaxId: normalizeTaxId(data.withholdingAgent.taxId),
    recipientName: data.incomeRecipient.name || '',
    recipientAddress: data.incomeRecipient.address || '',
    recipientTaxId: normalizeTaxId(data.incomeRecipient.taxId),
    paymentDateDisplay: formatThaiPaymentDate(data.paymentDate),
    incomeRow: placed.incomeRow,
    incomeOtherText: placed.incomeOtherText,
    grossAmount: data.grossAmount,
    whtAmount: data.whtAmount,
    whtAmountText: thaiBahtInWords(data.whtAmount),
    pndChecks: pnd,
    payerMode: 'withhold',
    sequenceNo: '',
    amountsByRow: placed.amountsByRow,
  }
}

function pndMark(on: boolean): string {
  return on ? '✓' : ''
}

function amountCells(
  rowKey: Wht50TawiIncomeRowKey,
  amountsByRow: Partial<Record<Wht50TawiIncomeRowKey, Wht50TawiPlacedLine[]>>
): string {
  const lines = amountsByRow[rowKey] || []
  if (lines.length === 0) {
    return '<td class="wht-date-col"></td><td class="wht-amt-col"></td><td class="wht-amt-col"></td>'
  }
  if (lines.length === 1) {
    const ln = lines[0]
    return `<td class="wht-date-col">${esc(ln.date)}</td><td class="wht-amt-col">${fmtNum(ln.gross)}</td><td class="wht-amt-col">${fmtNum(ln.wht)}</td>`
  }
  const dates = lines.map((ln) => `<div>${esc(ln.date)}</div>`).join('')
  const gross = lines.map((ln) => `<div>${fmtNum(ln.gross)}</div>`).join('')
  const wht = lines.map((ln) => `<div>${fmtNum(ln.wht)}</div>`).join('')
  return `<td class="wht-date-col wht-stack">${dates}</td><td class="wht-amt-col wht-stack">${gross}</td><td class="wht-amt-col wht-stack">${wht}</td>`
}

function partyBlock(params: {
  title: string
  name: string
  address: string
  taxId: string
}): string {
  const nameVal = params.name
    ? `<span class="wht-fill">${esc(params.name)}</span>`
    : '<span class="wht-uline">&nbsp;</span>'
  const addrVal = params.address
    ? `<span class="wht-fill">${esc(params.address)}</span>`
    : '<span class="wht-uline">&nbsp;</span>'

  return `
<div class="wht-party">
  <table class="wht-party-tbl" cellspacing="0" cellpadding="0">
    <tr>
      <td class="wht-party-l">
        <div class="wht-party-h">${esc(params.title)}</div>
        <div class="wht-fl"><span class="wht-k">ชื่อ</span> ${nameVal}</div>
        <div class="wht-fl"><span class="wht-k">ที่อยู่</span> ${addrVal}</div>
        ${params.address ? '' : '<div class="wht-fl wht-addr2"><span class="wht-k">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> <span class="wht-uline">&nbsp;</span></div>'}
        <div class="wht-note">(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</div>
        <div class="wht-note">(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)</div>
      </td>
      <td class="wht-party-r">
        <div class="wht-tin-lab">เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*</div>
        <table class="wht-tin" cellspacing="0" cellpadding="0"><tr>${taxIdCells(params.taxId)}</tr></table>
      </td>
    </tr>
  </table>
</div>`
}

function headerBlock(params: { copyNo: Wht50TawiCopyNo; bookNo: string; certNo: string }): string {
  const c1 = params.copyNo === 1 ? ' wht-on' : ''
  const c2 = params.copyNo === 2 ? ' wht-on' : ''
  const book = esc(params.bookNo || '') || '................'
  const cert = esc(params.certNo || '') || '................'
  return `
<div class="wht-head">
  <div class="wht-head-l">
    <div class="wht-copy${c1}">ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)</div>
    <div class="wht-copy${c2}">ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)</div>
  </div>
  <div class="wht-head-c">
    <div class="wht-ttl">หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
    <div class="wht-sub">ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
  </div>
  <div class="wht-head-r">
    <div>เล่มที่ <span class="wht-uline-sm">${book}</span></div>
    <div>เลขที่ <span class="wht-uline-sm">${cert}</span></div>
  </div>
</div>`
}

function buildWht50TawiCertificateBody(data: WhtCertificateData, copyNo: Wht50TawiCopyNo): string {
  const r = resolveWht50Tawi(data)
  const issueDate = r.paymentDateDisplay || '.... / .... / ........'
  const other = r.incomeOtherText
    ? esc(r.incomeOtherText)
    : '........................................................'

  const incomeTable = `
<table class="wht-tbl" cellspacing="0" cellpadding="0">
  <thead>
    <tr>
      <th class="c-type">ประเภทเงินได้พึงประเมินที่จ่าย</th>
      <th class="c-date">วัน เดือน<br/>หรือปีภาษี ที่จ่าย</th>
      <th class="c-amt">จำนวนเงินที่จ่าย</th>
      <th class="c-amt">ภาษีที่หัก<br/>และนำส่งไว้</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)</td>
      ${amountCells('r1', r.amountsByRow)}
    </tr>
    <tr>
      <td>2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)</td>
      ${amountCells('r2', r.amountsByRow)}
    </tr>
    <tr>
      <td>3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)</td>
      ${amountCells('r3', r.amountsByRow)}
    </tr>
    <tr>
      <td>4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)</td>
      ${amountCells('r4a', r.amountsByRow)}
    </tr>
    <tr>
      <td class="pad-l">&nbsp;&nbsp;(ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)</td>
      ${amountCells('r4b', r.amountsByRow)}
    </tr>
    <tr>
      <td class="tiny" colspan="4">(1) กรณีผู้ได้รับเงินปันผลได้รับเครดิตภาษี โดยจ่ายจากกำไรสุทธิของกิจการที่ต้องเสียภาษีเงินได้นิติบุคคลในอัตราดังนี้</td>
    </tr>
    <tr>
      <td class="tiny pad-l" colspan="4">
        (1.1) อัตราร้อยละ 30 ของกำไรสุทธิ &nbsp;
        (1.2) อัตราร้อยละ 25 ของกำไรสุทธิ &nbsp;
        (1.3) อัตราร้อยละ 20 ของกำไรสุทธิ &nbsp;
        (1.4) อัตราอื่น ๆ (ระบุ) ............ ของกำไรสุทธิ
      </td>
    </tr>
    <tr>
      <td class="tiny" colspan="4">(2) กรณีผู้ได้รับเงินปันผลไม่ได้รับเครดิตภาษี เนื่องจากจ่ายจาก</td>
    </tr>
    <tr>
      <td class="tiny pad-l" colspan="4">(2.1) กำไรสุทธิของกิจการที่ได้รับยกเว้นภาษีเงินได้นิติบุคคล</td>
    </tr>
    <tr>
      <td class="tiny pad-l" colspan="4">(2.2) เงินปันผลหรือเงินส่วนแบ่งของกำไรที่ได้รับยกเว้นไม่ต้องนำมารวมคำนวณเป็นรายได้เพื่อเสียภาษีเงินได้นิติบุคคล</td>
    </tr>
    <tr>
      <td class="tiny pad-l" colspan="4">(2.3) กำไรสุทธิส่วนที่ได้หักผลขาดทุนสุทธิยกมาไม่เกิน 5 ปี ก่อนรอบระยะเวลาบัญชีปีปัจจุบัน</td>
    </tr>
    <tr>
      <td class="tiny pad-l" colspan="4">(2.4) กำไรที่รับรู้ทางบัญชีโดยวิธีส่วนได้เสีย (equity method)</td>
    </tr>
    <tr>
      <td class="tiny pad-l" colspan="4">(2.5) อื่น ๆ (ระบุ) ........................................................</td>
    </tr>
    <tr>
      <td>
        5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส
        เช่น รางวัล ส่วนลดหรือประโยชน์ใด ๆ เนื่องจากการส่งเสริมการขาย รางวัลในการประกวด การแข่งขัน
        การชิงโชค ค่าแสดงของนักแสดงสาธารณะ ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ
        ค่าเบี้ยประกันวินาศภัย ฯลฯ
      </td>
      ${amountCells('r5', r.amountsByRow)}
    </tr>
    <tr>
      <td>6. อื่น ๆ (ระบุ) ${other}</td>
      ${amountCells('r6', r.amountsByRow)}
    </tr>
    <tr class="sum">
      <td colspan="2" class="sum-l">รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td>
      <td class="wht-amt-col">${fmtNum(r.grossAmount)}</td>
      <td class="wht-amt-col">${fmtNum(r.whtAmount)}</td>
    </tr>
    <tr class="sum-words">
      <td colspan="4">รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)&nbsp;&nbsp;<strong>${esc(r.whtAmountText)}</strong></td>
    </tr>
  </tbody>
</table>`

  return `
<div class="wht-form">
  ${headerBlock({ copyNo, bookNo: r.bookNo, certNo: r.certNo })}
  ${partyBlock({
    title: 'ผู้มีหน้าที่หักภาษี ณ ที่จ่าย : -',
    name: r.agentName,
    address: r.agentAddress,
    taxId: r.agentTaxId,
  })}
  ${partyBlock({
    title: 'ผู้ถูกหักภาษี ณ ที่จ่าย : -',
    name: r.recipientName,
    address: r.recipientAddress,
    taxId: r.recipientTaxId,
  })}
  <div class="wht-pnd">
    ลำดับที่ <span class="wht-uline-sm">${esc(r.sequenceNo) || '........'}</span> ในแบบ
    &nbsp;(1) ภ.ง.ด.1ก <span class="chk">${pndMark(r.pndChecks.pnd1k)}</span>
    &nbsp;(2) ภ.ง.ด.1ก พิเศษ <span class="chk">${pndMark(r.pndChecks.pnd1kSpecial)}</span>
    &nbsp;(3) ภ.ง.ด.2 <span class="chk">${pndMark(r.pndChecks.pnd2)}</span>
    &nbsp;(4) ภ.ง.ด.3 <span class="chk">${pndMark(r.pndChecks.pnd3)}</span>
    &nbsp;(5) ภ.ง.ด.2ก <span class="chk">${pndMark(r.pndChecks.pnd2k)}</span>
    &nbsp;(6) ภ.ง.ด.3ก <span class="chk">${pndMark(r.pndChecks.pnd3k)}</span>
    &nbsp;(7) ภ.ง.ด.53 <span class="chk">${pndMark(r.pndChecks.pnd53)}</span>
    <div class="wht-pnd-note">(ให้สามารถอ้างอิงหรือสอบยันกันได้ระหว่างลำดับที่ตามหนังสือรับรองฯ กับแบบยื่นรายการภาษีหักที่จ่าย)</div>
  </div>
  <div class="wht-tbl-slot">${incomeTable}</div>
  <div class="wht-fund">
    เงินที่จ่ายเข้า กบข. / กสจ. / กองทุนสงเคราะห์ครูโรงเรียนเอกชน <span class="wht-uline-sm">............</span> บาท
    &nbsp; กองทุนประกันสังคม <span class="wht-uline-sm">............</span> บาท
    &nbsp; กองทุนสำรองเลี้ยงชีพ <span class="wht-uline-sm">............</span> บาท
  </div>
  <div class="wht-paymode">
    ผู้จ่ายเงิน
    &nbsp;(1) หัก ณ ที่จ่าย <span class="chk">${r.payerMode === 'withhold' ? '✓' : ''}</span>
    &nbsp;(2) ออกให้ตลอดไป <span class="chk">${r.payerMode === 'forever' ? '✓' : ''}</span>
    &nbsp;(3) ออกให้ครั้งเดียว <span class="chk">${r.payerMode === 'once' ? '✓' : ''}</span>
    &nbsp;(4) อื่น ๆ (ระบุ) <span class="wht-uline-sm">........................</span>
  </div>
  <table class="wht-foot" cellspacing="0" cellpadding="0">
    <tr>
      <td class="wht-warn">
        <strong>คำเตือน</strong>
        ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร
        ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร
      </td>
      <td class="wht-sign">
        <div class="wht-cert">ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</div>
        <div class="wht-sign-ln">ลงชื่อ ................................................ ผู้จ่ายเงิน</div>
        <div class="wht-sign-dt">${esc(issueDate)}</div>
        <div class="wht-sign-cap">(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)</div>
        <div class="wht-seal">ประทับตรา<br/>นิติบุคคล<br/>(ถ้ามี)</div>
      </td>
    </tr>
  </table>
  <div class="wht-fn">
    หมายเหตุ เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* หมายถึง
    1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง
    2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า
    3. กรณีอื่น ๆ นอกเหนือจาก 1. และ 2. ให้ใช้เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) ของกรมสรรพากร
  </div>
</div>`
}

export function buildWht50TawiCertificateHtml(
  data: WhtCertificateData,
  copyNo: Wht50TawiCopyNo = 1
): string {
  return `<section class="wht50-sheet" data-copy="${copyNo}">${buildWht50TawiCertificateBody(data, copyNo)}</section>`
}

/** Vendor용 — ฉบับที่ 1·2 각 A4 1장(양식 전체) → 인쇄 시 총 2페이지 */
export function buildWht50TawiCertificateHtmlBothCopies(data: WhtCertificateData): string {
  return [1, 2]
    .map((n) => buildWht50TawiCertificateHtml(data, n as Wht50TawiCopyNo))
    .join('\n')
}

/**
 * 원본 กรมสรรพากร 50 ทวิ — A4 1장 = 양식 1장.
 * 시트·테두리 양식을 A4 인쇄영역(285mm)에 고정 높이로 꽉 채우고,
 * 남는 세로 공간은 소득유형 표가 흡수한다. (미리보기 height:auto 금지)
 */
export const WHT_50_TAWI_STYLES = `
  @page { size: A4 portrait; margin: 6mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; width: 100%;
    background: #fff; color: #000;
    font-family: "TH Sarabun New", "Sarabun", "Noto Sans Thai", Tahoma, sans-serif;
    font-size: 12.5px; line-height: 1.18;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .wht50-sheet {
    display: flex;
    flex-direction: column;
    width: 198mm;
    max-width: 100%;
    /* A4 297mm − @page 상하 margin 6mm×2 */
    height: 285mm;
    min-height: 285mm;
    max-height: 285mm;
    margin: 0 auto;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
    page-break-inside: avoid;
    break-inside: avoid;
    page-break-before: auto;
    break-before: auto;
  }
  .wht50-sheet + .wht50-sheet {
    page-break-before: always;
    break-before: page;
  }
  .wht50-sheet:last-child {
    page-break-after: auto;
    break-after: auto;
  }

  .wht-form {
    border: 1.4px solid #000;
    padding: 2.2mm 2.4mm 1.8mm;
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    min-height: 100%;
    max-height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* —— Header (원본: 좌 ฉบับ / 중 제목 / 우 เล่ม·เลข) —— */
  .wht-head { display: table; width: 100%; table-layout: fixed; margin-bottom: 1.6mm; flex: 0 0 auto; }
  .wht-head-l, .wht-head-c, .wht-head-r { display: table-cell; vertical-align: top; }
  .wht-head-l { width: 34%; font-size: 9.5px; line-height: 1.25; padding-right: 1.2mm; }
  .wht-copy { margin: 0; }
  .wht-copy.wht-on { font-weight: 700; text-decoration: underline; }
  .wht-head-c { width: 42%; text-align: center; }
  .wht-ttl { font-size: 18px; font-weight: 700; line-height: 1.1; }
  .wht-sub { font-size: 12px; margin-top: 0.4mm; }
  .wht-head-r { width: 24%; text-align: right; font-size: 13px; padding-top: 0.6mm; line-height: 1.4; }

  .wht-uline { display: inline-block; min-width: 78%; border-bottom: 1px dotted #000; }
  .wht-uline-sm { display: inline-block; min-width: 30px; border-bottom: 1px dotted #000; text-align: center; font-weight: 600; }
  .wht-fill { font-weight: 600; border-bottom: 1px dotted #000; }

  /* —— Party boxes —— */
  .wht-party { border: 1px solid #000; border-bottom: none; padding: 1.4mm 1.8mm; flex: 0 0 auto; }
  .wht-party-tbl { width: 100%; border-collapse: collapse; }
  .wht-party-l { width: 60%; vertical-align: top; padding-right: 1.5mm; }
  .wht-party-r { width: 40%; vertical-align: top; text-align: right; }
  .wht-party-h { font-weight: 700; font-size: 13px; margin-bottom: 0.5mm; }
  .wht-fl { margin: 0.35mm 0; font-size: 12.5px; line-height: 1.25; }
  .wht-k { white-space: nowrap; }
  .wht-note { font-size: 8.5px; color: #222; line-height: 1.15; }
  .wht-tin-lab { font-size: 9.5px; margin-bottom: 0.7mm; }
  .wht-tin { border-collapse: collapse; margin-left: auto; }
  .wht-tin-cell {
    width: 13px; height: 16px; border: 1px solid #000;
    text-align: center; font-size: 12px; font-weight: 700;
    padding: 0; line-height: 16px;
  }
  .wht-tin-dash { width: 7px; border: none; text-align: center; font-size: 11px; vertical-align: middle; }

  /* —— PND row —— */
  .wht-pnd {
    border: 1px solid #000; border-bottom: none;
    padding: 1.2mm 1.8mm; font-size: 11px; line-height: 1.3;
    flex: 0 0 auto;
  }
  .wht-pnd-note { font-size: 8.5px; margin-top: 0.4mm; }
  .chk {
    display: inline-block; width: 11px; height: 11px; border: 1px solid #000;
    text-align: center; font-size: 9.5px; font-weight: 700; line-height: 10px;
    vertical-align: middle; margin: 0 1px;
  }

  /* —— Income table: A4 남는 세로 공간을 표가 채움 —— */
  .wht-tbl-slot {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .wht-tbl {
    width: 100%;
    height: 100%;
    border-collapse: collapse;
    font-size: 10.5px;
    flex: 1 1 auto;
    table-layout: fixed;
  }
  .wht-tbl th, .wht-tbl td { border: 1px solid #000; padding: 1.1mm 1.2mm; vertical-align: middle; }
  .wht-tbl th { text-align: center; font-weight: 700; font-size: 10.5px; height: 8mm; }
  .c-type { width: 56%; }
  .c-date { width: 14%; }
  .c-amt { width: 15%; }
  .wht-tbl td { font-size: 10.2px; line-height: 1.18; }
  .wht-tbl tbody tr { height: 6.2%; }
  .tiny {
    font-size: 8.8px !important; line-height: 1.15 !important;
    padding-top: 0.35mm !important; padding-bottom: 0.35mm !important;
    vertical-align: top !important;
  }
  .wht-tbl tbody tr:has(td.tiny) { height: 3.2%; }
  .pad-l { padding-left: 3mm !important; }
  .wht-date-col { text-align: center; font-size: 11px; white-space: nowrap; }
  .wht-amt-col {
    text-align: right; font-variant-numeric: tabular-nums;
    white-space: nowrap; font-size: 11px;
  }
  .wht-stack div { line-height: 1.35; }
  .sum td { font-weight: 700; }
  .sum-l { text-align: center; }
  .sum-words td { background: #d9d9d9; font-size: 12px; font-weight: 500; }
  .wht-tbl tbody tr.sum,
  .wht-tbl tbody tr.sum-words { height: 5%; }

  .wht-fund, .wht-paymode {
    border: 1px solid #000; border-top: none;
    padding: 1.2mm 1.8mm; font-size: 11px; line-height: 1.3;
    flex: 0 0 auto;
  }

  .wht-foot {
    width: 100%; border-collapse: collapse; border: 1px solid #000; border-top: none;
    flex: 0 0 auto;
  }
  .wht-warn {
    width: 38%; font-size: 9px; line-height: 1.25;
    border-right: 1px solid #000; padding: 2mm; vertical-align: top;
  }
  .wht-sign {
    width: 62%; padding: 2.2mm 16mm 2mm 2mm; vertical-align: top;
    position: relative; min-height: 30mm; text-align: center;
  }
  .wht-cert { font-size: 12px; font-weight: 600; margin-bottom: 1.8mm; }
  .wht-sign-ln { font-size: 13px; margin: 2.5mm 0 1mm; }
  .wht-sign-dt { font-size: 13px; }
  .wht-sign-cap { font-size: 9.5px; }
  .wht-seal {
    position: absolute; right: 2mm; top: 2mm;
    width: 16mm; height: 16mm; border: 1px dashed #444; border-radius: 50%;
    font-size: 8.5px; display: flex; align-items: center; justify-content: center;
    text-align: center; line-height: 1.1;
  }
  .wht-fn { font-size: 8.5px; margin-top: 1.2mm; line-height: 1.2; padding: 0 0.4mm; flex: 0 0 auto; }

  @media print {
    html, body {
      background: #fff !important;
      overflow: visible !important;
      height: auto !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .wht50-sheet {
      display: flex !important;
      flex-direction: column !important;
      width: 100% !important;
      max-width: none !important;
      height: 285mm !important;
      min-height: 285mm !important;
      max-height: 285mm !important;
      margin: 0 !important;
      overflow: hidden !important;
      page-break-after: always !important;
      break-after: page !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .wht50-sheet + .wht50-sheet {
      page-break-before: always !important;
      break-before: page !important;
    }
    .wht50-sheet:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .wht-form {
      flex: 1 1 auto !important;
      height: 100% !important;
      min-height: 100% !important;
      max-height: 100% !important;
    }
    .wht-tbl-slot { flex: 1 1 auto !important; min-height: 0 !important; }
    .wht-tbl { height: 100% !important; }
  }
  @media screen {
    body { padding: 12px; background: #cfcfcf; }
    .wht50-sheet {
      background: #fff;
      box-shadow: 0 1px 8px rgba(0,0,0,.2);
      margin-bottom: 16px;
      /* preview must keep fixed A4 height (do not use auto) */
      height: 285mm !important;
      min-height: 285mm !important;
      max-height: 285mm !important;
    }
  }
`
