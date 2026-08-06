import type { WhtCertificateData } from '@/lib/wht-certificate-data'
import { thaiBahtInWords } from '@/lib/thai-baht-text'
import { resolveWhtPndFormHint } from '@/lib/wht-pnd-form-hint'

export type Wht50TawiIncomeRowKey = 'r1' | 'r2' | 'r3' | 'r4a' | 'r4b' | 'r5' | 'r6'
export type Wht50TawiCopyNo = 1 | 2

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

function resolveIncomeRow(data: WhtCertificateData): { row: Wht50TawiIncomeRowKey; otherText: string } {
  const t = String(data.incomeType || '').toLowerCase()
  if (/เงินเดือน|salary|급여|40\s*\(\s*1\s*\)/i.test(t)) return { row: 'r1', otherText: '' }
  if (/ค่าธรรมเนียม|commission|40\s*\(\s*2\s*\)/i.test(t)) return { row: 'r2', otherText: '' }
  if (/ลิขสิทธิ|royalt|40\s*\(\s*3\s*\)/i.test(t)) return { row: 'r3', otherText: '' }
  if (/ดอกเบี้ย|interest|40\s*\(\s*4\s*\)\s*\(\s*ก\s*\)/i.test(t)) return { row: 'r4a', otherText: '' }
  if (/ปันผล|dividend|40\s*\(\s*4\s*\)\s*\(\s*ข\s*\)/i.test(t)) return { row: 'r4b', otherText: '' }
  if (
    /ค่าบริการ|ค่าเช่า|ค่าโฆษณา|service|rent|용역|서비스|40\s*\(\s*5\s*\)|คำสั่งกรมสรรพากร/i.test(t)
  ) {
    return { row: 'r5', otherText: '' }
  }
  const label = String(data.incomeType || data.memo || '').trim()
  return { row: 'r6', otherText: label || 'ค่าใช้จ่าย' }
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
  const income = resolveIncomeRow(data)
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
    incomeRow: income.row,
    incomeOtherText: income.otherText,
    grossAmount: data.grossAmount,
    whtAmount: data.whtAmount,
    whtAmountText: thaiBahtInWords(data.whtAmount),
    pndChecks: pnd,
    payerMode: 'withhold',
    sequenceNo: '',
  }
}

function pndMark(on: boolean): string {
  return on ? '✓' : ''
}

function amountCells(
  rowKey: Wht50TawiIncomeRowKey,
  active: Wht50TawiIncomeRowKey,
  date: string,
  gross: number,
  wht: number
): string {
  if (rowKey !== active) {
    return '<td class="wht-date-col"></td><td class="wht-amt-col"></td><td class="wht-amt-col"></td>'
  }
  return `<td class="wht-date-col">${esc(date)}</td><td class="wht-amt-col">${fmtNum(gross)}</td><td class="wht-amt-col">${fmtNum(wht)}</td>`
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
  const a = r.incomeRow
  const other = a === 'r6' ? esc(r.incomeOtherText) : '........................................................'

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
      ${amountCells('r1', a, r.paymentDateDisplay, r.grossAmount, r.whtAmount)}
    </tr>
    <tr>
      <td>2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)</td>
      ${amountCells('r2', a, r.paymentDateDisplay, r.grossAmount, r.whtAmount)}
    </tr>
    <tr>
      <td>3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)</td>
      ${amountCells('r3', a, r.paymentDateDisplay, r.grossAmount, r.whtAmount)}
    </tr>
    <tr>
      <td>4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)</td>
      ${amountCells('r4a', a, r.paymentDateDisplay, r.grossAmount, r.whtAmount)}
    </tr>
    <tr>
      <td class="pad-l">&nbsp;&nbsp;(ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)</td>
      ${amountCells('r4b', a, r.paymentDateDisplay, r.grossAmount, r.whtAmount)}
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
      ${amountCells('r5', a, r.paymentDateDisplay, r.grossAmount, r.whtAmount)}
    </tr>
    <tr>
      <td>6. อื่น ๆ (ระบุ) ${other}</td>
      ${amountCells('r6', a, r.paymentDateDisplay, r.grossAmount, r.whtAmount)}
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
  ${incomeTable}
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
    .join('\n<div class="wht50-pagebreak" aria-hidden="true"></div>\n')
}

/** 원본 กรมสรรพากร 50 ทวิ — A4 1장에 양식 1장(내용 전부, 글자·여백을 A4에 맞춤) */
export const WHT_50_TAWI_STYLES = `
  @page { size: A4 portrait; margin: 5mm 5mm 5mm 5mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; width: 100%;
    background: #fff; color: #000;
    font-family: "TH Sarabun New", "Sarabun", "Noto Sans Thai", Tahoma, sans-serif;
    font-size: 14px; line-height: 1.22;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .wht50-sheet {
    width: 100%; max-width: 200mm; margin: 0 auto;
    page-break-after: always;
    page-break-inside: avoid;
    break-after: page;
    break-inside: avoid;
  }
  .wht50-pagebreak {
    display: none;
    height: 0; margin: 0; padding: 0; border: 0;
    page-break-after: always;
    break-after: page;
  }
  .wht50-sheet:last-of-type { page-break-after: auto; break-after: auto; }

  .wht-form {
    border: 1.5px solid #000;
    padding: 3mm 3mm 2.5mm;
    min-height: 287mm;
    display: flex;
    flex-direction: column;
  }

  /* —— Header (원본: 좌 ฉบับ / 중 제목 / 우 เล่ม·เลข) —— */
  .wht-head { display: table; width: 100%; table-layout: fixed; margin-bottom: 2.5mm; }
  .wht-head-l, .wht-head-c, .wht-head-r { display: table-cell; vertical-align: top; }
  .wht-head-l { width: 34%; font-size: 10.5px; line-height: 1.28; padding-right: 1.5mm; }
  .wht-copy { margin: 0 0 0.6mm; }
  .wht-copy.wht-on { font-weight: 700; text-decoration: underline; }
  .wht-head-c { width: 42%; text-align: center; }
  .wht-ttl { font-size: 20px; font-weight: 700; line-height: 1.15; }
  .wht-sub { font-size: 13px; margin-top: 0.8mm; }
  .wht-head-r { width: 24%; text-align: right; font-size: 14px; padding-top: 1mm; line-height: 1.5; }

  .wht-uline { display: inline-block; min-width: 78%; border-bottom: 1px dotted #000; }
  .wht-uline-sm { display: inline-block; min-width: 36px; border-bottom: 1px dotted #000; text-align: center; font-weight: 600; }
  .wht-fill { font-weight: 600; border-bottom: 1px dotted #000; }

  /* —— Party boxes —— */
  .wht-party { border: 1px solid #000; border-bottom: none; padding: 2mm 2.2mm; }
  .wht-party-tbl { width: 100%; border-collapse: collapse; }
  .wht-party-l { width: 60%; vertical-align: top; padding-right: 2mm; }
  .wht-party-r { width: 40%; vertical-align: top; text-align: right; }
  .wht-party-h { font-weight: 700; font-size: 14px; margin-bottom: 1mm; }
  .wht-fl { margin: 0.8mm 0; font-size: 14px; }
  .wht-k { white-space: nowrap; }
  .wht-note { font-size: 10px; color: #222; line-height: 1.2; margin-top: 0.4mm; }
  .wht-tin-lab { font-size: 11px; margin-bottom: 1.2mm; }
  .wht-tin { border-collapse: collapse; margin-left: auto; }
  .wht-tin-cell {
    width: 14px; height: 18px; border: 1px solid #000;
    text-align: center; font-size: 13px; font-weight: 700;
    padding: 0; line-height: 18px;
  }
  .wht-tin-dash { width: 8px; border: none; text-align: center; font-size: 12px; vertical-align: middle; }

  /* —— PND row —— */
  .wht-pnd {
    border: 1px solid #000; border-bottom: none;
    padding: 2mm 2.2mm; font-size: 12px; line-height: 1.4;
  }
  .wht-pnd-note { font-size: 10px; margin-top: 0.8mm; }
  .chk {
    display: inline-block; width: 13px; height: 13px; border: 1px solid #000;
    text-align: center; font-size: 11px; font-weight: 700; line-height: 12px;
    vertical-align: middle; margin: 0 1px;
  }

  /* —— Income table —— */
  .wht-tbl { width: 100%; border-collapse: collapse; font-size: 12px; flex: 1 1 auto; }
  .wht-tbl th, .wht-tbl td { border: 1px solid #000; padding: 1.3mm 1.6mm; vertical-align: top; }
  .wht-tbl th { text-align: center; font-weight: 700; font-size: 12px; }
  .c-type { width: 56%; }
  .c-date { width: 14%; }
  .c-amt { width: 15%; }
  .wht-tbl td { font-size: 11.5px; line-height: 1.25; }
  .tiny { font-size: 10.5px !important; line-height: 1.22 !important; }
  .pad-l { padding-left: 3.5mm !important; }
  .wht-date-col { text-align: center; font-size: 12.5px; white-space: nowrap; }
  .wht-amt-col {
    text-align: right; font-variant-numeric: tabular-nums;
    white-space: nowrap; font-size: 12.5px;
  }
  .sum td { font-weight: 700; }
  .sum-l { text-align: center; }
  .sum-words td { background: #d9d9d9; font-size: 13px; font-weight: 500; padding-top: 1.6mm; padding-bottom: 1.6mm; }

  .wht-fund, .wht-paymode {
    border: 1px solid #000; border-top: none;
    padding: 1.8mm 2.2mm; font-size: 12px; line-height: 1.4;
  }

  .wht-foot { width: 100%; border-collapse: collapse; border: 1px solid #000; border-top: none; }
  .wht-warn {
    width: 38%; font-size: 11px; line-height: 1.3;
    border-right: 1px solid #000; padding: 2.5mm; vertical-align: top;
  }
  .wht-sign {
    width: 62%; padding: 3mm 18mm 3mm 3mm; vertical-align: top;
    position: relative; min-height: 36mm; text-align: center;
  }
  .wht-cert { font-size: 13px; font-weight: 600; margin-bottom: 3mm; }
  .wht-sign-ln { font-size: 14px; margin: 4mm 0 1.5mm; }
  .wht-sign-dt { font-size: 14px; }
  .wht-sign-cap { font-size: 11px; margin-top: 0.8mm; }
  .wht-seal {
    position: absolute; right: 3mm; top: 3mm;
    width: 20mm; height: 20mm; border: 1px dashed #444; border-radius: 50%;
    font-size: 10px; display: flex; align-items: center; justify-content: center;
    text-align: center; line-height: 1.15;
  }
  .wht-fn { font-size: 10px; margin-top: 2mm; line-height: 1.28; padding: 0 0.5mm; }

  @media print {
    html, body { background: #fff !important; overflow: visible !important; height: auto !important; }
    .wht50-sheet {
      max-width: none;
      width: 100%;
      page-break-after: always !important;
      break-after: page !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .wht-form { min-height: 287mm; }
    .wht50-pagebreak {
      display: block !important;
      page-break-after: always !important;
      break-after: page !important;
    }
    .wht50-sheet:last-of-type { page-break-after: auto !important; break-after: auto !important; }
  }
  @media screen {
    body { padding: 12px; background: #cfcfcf; }
    .wht50-sheet {
      background: #fff; box-shadow: 0 1px 8px rgba(0,0,0,.2);
      margin-bottom: 16px;
    }
    .wht50-pagebreak { display: none; }
  }
`
