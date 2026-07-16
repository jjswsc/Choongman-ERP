import type { WhtCertificateData } from '@/lib/wht-certificate-data'
import { thaiBahtInWords } from '@/lib/thai-baht-text'

export type Wht50TawiIncomeRowKey = 'r1' | 'r2' | 'r3' | 'r4a' | 'r4b' | 'r5' | 'r6'

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

function taxIdCells(taxId: string): string {
  const digits = normalizeTaxId(taxId).padEnd(13, ' ').split('')
  return digits
    .map((d) => `<td class="wht-tin-cell">${d.trim() ? esc(d) : '&nbsp;'}</td>`)
    .join('')
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
  const pnd = resolvePndChecks(data.formHint)
  if (data.direction === 'outbound' && !Object.values(pnd).some(Boolean)) {
    pnd.pnd3 = true
  }
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

function dots(len = 40): string {
  return '.'.repeat(len)
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
    return `<td class="wht-date-col">${dots(10)}</td><td class="wht-amt-col"></td><td class="wht-amt-col"></td>`
  }
  return `<td class="wht-date-col">${esc(date)}</td><td class="wht-amt-col">${fmtNum(gross)}</td><td class="wht-amt-col">${fmtNum(wht)}</td>`
}

function partyBlock(params: {
  title: string
  name: string
  address: string
  taxId: string
  bookNo?: string
  certNo?: string
  showBook?: boolean
}): string {
  const nameLine = params.name
    ? `<span class="wht-val">${esc(params.name)}</span>`
    : `<span class="wht-dots">${dots(72)}</span>`
  const addrLine = params.address
    ? `<span class="wht-val">${esc(params.address)}</span>`
    : `<span class="wht-dots">${dots(95)}</span>`

  const bookHtml = params.showBook
    ? `<div class="wht-bookno">เล่มที่ <span class="wht-val-sm">${esc(params.bookNo || '')}</span> เลขที่ <span class="wht-val-sm">${esc(params.certNo || '')}</span></div>`
    : ''

  return `
<div class="wht-party-block">
  <table class="wht-party-table" cellspacing="0" cellpadding="0">
    <tr>
      <td class="wht-party-left">
        <div class="wht-party-title">${esc(params.title)}</div>
        <div class="wht-line"><span class="wht-lbl">ชื่อ</span> ${nameLine}</div>
        <div class="wht-line wht-addr-line"><span class="wht-lbl">ที่อยู่</span> ${addrLine}</div>
        <div class="wht-hint">(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</div>
        <div class="wht-hint">(ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)</div>
      </td>
      <td class="wht-party-right">
        ${bookHtml}
        <div class="wht-tin-caption">เลขประจำตัวผู้เสียภาษีอากร</div>
        <div class="wht-tin-caption-sm">เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*</div>
        <table class="wht-tin-grid" cellspacing="0" cellpadding="0"><tr>${taxIdCells(params.taxId)}</tr></table>
      </td>
    </tr>
  </table>
</div>`
}

export function buildWht50TawiCertificateHtml(data: WhtCertificateData): string {
  const r = resolveWht50Tawi(data)
  const issueDate = r.paymentDateDisplay || '....../....../........'
  const active = r.incomeRow

  const incomeTable = `
<table class="wht-income-table" cellspacing="0" cellpadding="0">
  <thead>
    <tr>
      <th class="wht-col-type">ประเภทเงินได้พึงประเมินที่จ่าย</th>
      <th class="wht-col-date">วัน เดือน<br/>หรือปีภาษี ที่จ่าย</th>
      <th class="wht-col-amt">จำนวนเงินที่จ่าย</th>
      <th class="wht-col-amt">ภาษีที่หัก<br/>และนำส่งไว้</th>
    </tr>
  </thead>
  <tbody>
    <tr><td class="wht-type-col">1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)</td>${amountCells('r1', active, r.paymentDateDisplay, r.grossAmount, r.whtAmount)}</tr>
    <tr><td class="wht-type-col">2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)</td>${amountCells('r2', active, r.paymentDateDisplay, r.grossAmount, r.whtAmount)}</tr>
    <tr><td class="wht-type-col">3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)</td>${amountCells('r3', active, r.paymentDateDisplay, r.grossAmount, r.whtAmount)}</tr>
    <tr><td class="wht-type-col wht-indent">4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)</td>${amountCells('r4a', active, r.paymentDateDisplay, r.grossAmount, r.whtAmount)}</tr>
    <tr><td class="wht-type-col wht-indent2">(ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)</td>${amountCells('r4b', active, r.paymentDateDisplay, r.grossAmount, r.whtAmount)}</tr>
    <tr><td class="wht-type-col wht-subnote" colspan="4">(1) กรณีผู้ได้รับเงินปันผลได้รับเครดิตภาษี โดยจ่ายจากกำไรสุทธิของกิจการที่ต้องเสียภาษีเงินได้นิติบุคคลในอัตราดังนี้</td></tr>
    <tr><td class="wht-type-col wht-indent3" colspan="4">(1.1) อัตราร้อยละ 30 ของกำไรสุทธิ &nbsp; (1.2) อัตราร้อยละ 25 ของกำไรสุทธิ &nbsp; (1.3) อัตราร้อยละ 20 ของกำไรสุทธิ &nbsp; (1.4) อัตราอื่น ๆ (ระบุ) ${dots(12)} ของกำไรสุทธิ</td></tr>
    <tr><td class="wht-type-col wht-subnote" colspan="4">(2) กรณีผู้ได้รับเงินปันผลไม่ได้รับเครดิตภาษี เนื่องจากจ่ายจาก (2.1)~(2.5) ตามแบบฟอร์ม</td></tr>
    <tr><td class="wht-type-col">5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น รางวัล ส่วนลดหรือประโยชน์ใด ๆ เนื่องจากการส่งเสริมการขาย รางวัลในการประกวด การแข่งขัน การชิงโชค ค่าแสดงของนักแสดงสาธารณะ ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ</td>${amountCells('r5', active, r.paymentDateDisplay, r.grossAmount, r.whtAmount)}</tr>
    <tr><td class="wht-type-col">6. อื่น ๆ (ระบุ) ${active === 'r6' ? esc(r.incomeOtherText) : dots(50)}</td>${amountCells('r6', active, r.paymentDateDisplay, r.grossAmount, r.whtAmount)}</tr>
    <tr class="wht-sum-row">
      <td colspan="2" class="wht-sum-label">รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td>
      <td class="wht-amt-col">${fmtNum(r.grossAmount)}</td>
      <td class="wht-amt-col">${fmtNum(r.whtAmount)}</td>
    </tr>
    <tr>
      <td colspan="4" class="wht-sum-text">รวมเงินภาษีที่หักนำส่ง (ตัวอักษร) <span class="wht-val">${esc(r.whtAmountText)}</span></td>
    </tr>
  </tbody>
</table>`

  return `
<section class="wht50-sheet">
  <div class="wht50-border">
    ${partyBlock({
      title: 'ผู้มีหน้าที่หักภาษี ณ ที่จ่าย : -',
      name: r.agentName,
      address: r.agentAddress,
      taxId: r.agentTaxId,
      bookNo: r.bookNo,
      certNo: r.certNo,
      showBook: true,
    })}
    ${partyBlock({
      title: 'ผู้ถูกหักภาษี ณ ที่จ่าย : -',
      name: r.recipientName,
      address: r.recipientAddress,
      taxId: r.recipientTaxId,
    })}
    <div class="wht-pnd-row">
      ลำดับที่ <span class="wht-val-sm">${esc(r.sequenceNo)}</span> ในแบบ
      (1) ภ.ง.ด.1ก <span class="wht-chk">${pndMark(r.pndChecks.pnd1k)}</span>
      (2) ภ.ง.ด.1ก พิเศษ <span class="wht-chk">${pndMark(r.pndChecks.pnd1kSpecial)}</span>
      (3) ภ.ง.ด.2 <span class="wht-chk">${pndMark(r.pndChecks.pnd2)}</span>
      (4) ภ.ง.ด.3 <span class="wht-chk">${pndMark(r.pndChecks.pnd3)}</span>
      (5) ภ.ง.ด.2ก <span class="wht-chk">${pndMark(r.pndChecks.pnd2k)}</span>
      (6) ภ.ง.ด.3ก <span class="wht-chk">${pndMark(r.pndChecks.pnd3k)}</span>
      (7) ภ.ง.ด.53 <span class="wht-chk">${pndMark(r.pndChecks.pnd53)}</span>
      <span class="wht-pnd-hint">(ให้สามารถอ้างอิงหรือสอบยันกันได้ระหว่างลำดับที่ตามหนังสือรับรองฯ กับแบบยื่นรายการภาษีหัก ที่จ่าย)</span>
    </div>

    <div class="wht-title-block">
      <div class="wht-title-main">หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
      <div>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
      <div class="wht-copy-line">ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)</div>
      <div class="wht-copy-line">ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)</div>
    </div>

    ${incomeTable}

    <div class="wht-fund-row">
      เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน <span class="wht-dots-sm">${dots(10)}</span> บาท
      กองทุนประกันสังคม <span class="wht-dots-sm">${dots(10)}</span> บาท
      กองทุนสำรองเลี้ยงชีพ <span class="wht-dots-sm">${dots(10)}</span> บาท
    </div>

    <div class="wht-payer-row">
      ผู้จ่ายเงิน
      (1) หัก ณ ที่จ่าย <span class="wht-chk">${r.payerMode === 'withhold' ? '✓' : ''}</span>
      (2) ออกให้ตลอดไป <span class="wht-chk">${r.payerMode === 'forever' ? '✓' : ''}</span>
      (3) ออกให้ครั้งเดียว <span class="wht-chk">${r.payerMode === 'once' ? '✓' : ''}</span>
      (4) อื่น ๆ (ระบุ) <span class="wht-dots-sm">${dots(16)}</span>
    </div>

    <table class="wht-footer-table" cellspacing="0" cellpadding="0">
      <tr>
        <td class="wht-warn-cell">
          <strong>คำเตือน</strong> ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร
        </td>
        <td class="wht-sign-cell">
          <div class="wht-cert-line">ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</div>
          <div class="wht-sign-line">ลงชื่อ <span class="wht-dots-sm">${dots(28)}</span> ผู้จ่ายเงิน</div>
          <div class="wht-sign-date">${esc(issueDate)}</div>
          <div class="wht-sign-caption">(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)</div>
          <div class="wht-stamp-box">ประทับตรา<br/>นิติบุคคล<br/>(ถ้ามี)</div>
        </td>
      </tr>
    </table>

    <div class="wht-footnote">
      หมายเหตุ เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* หมายถึง
      1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง
      2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า
      3. กรณีอื่น ๆ นอกเหนือจาก 1. และ 2. ให้ใช้เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) ของกรมสรรพากร
    </div>
  </div>
</section>`
}

export const WHT_50_TAWI_STYLES = `
  @page { size: A4 portrait; margin: 6mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    font-family: "TH Sarabun New", "Sarabun", "Noto Sans Thai", sans-serif;
    font-size: 13px;
    color: #000;
    line-height: 1.2;
  }
  .wht50-sheet { width: 100%; max-width: 200mm; margin: 0 auto; }
  .wht50-border { border: 1.5px solid #000; padding: 4px 6px 6px; }
  .wht-party-block { border-bottom: 1px solid #000; padding-bottom: 4px; margin-bottom: 2px; }
  .wht-party-table { width: 100%; border-collapse: collapse; }
  .wht-party-left { width: 68%; vertical-align: top; padding-right: 6px; }
  .wht-party-right { width: 32%; vertical-align: top; text-align: right; }
  .wht-party-title { font-weight: 700; font-size: 13px; margin-bottom: 2px; }
  .wht-line { margin: 1px 0; font-size: 13px; }
  .wht-addr-line { line-height: 1.15; }
  .wht-lbl { white-space: nowrap; }
  .wht-val { font-weight: 600; border-bottom: 1px dotted #000; }
  .wht-val-sm { font-weight: 600; border-bottom: 1px dotted #000; min-width: 36px; display: inline-block; text-align: center; }
  .wht-dots { letter-spacing: 1px; color: #333; font-size: 11px; }
  .wht-dots-sm { letter-spacing: 1px; color: #333; font-size: 11px; }
  .wht-hint { font-size: 9px; color: #333; line-height: 1.1; }
  .wht-bookno { font-size: 12px; margin-bottom: 4px; white-space: nowrap; }
  .wht-tin-caption { font-size: 10px; text-align: right; }
  .wht-tin-caption-sm { font-size: 9px; text-align: right; margin-bottom: 2px; }
  .wht-tin-grid { border-collapse: collapse; margin-left: auto; }
  .wht-tin-cell {
    width: 13px; height: 16px;
    border: 1px solid #000;
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    padding: 0;
    line-height: 16px;
  }
  .wht-pnd-row { font-size: 10px; padding: 3px 0; border-bottom: 1px solid #000; line-height: 1.35; }
  .wht-pnd-hint { display: block; font-size: 8.5px; margin-top: 1px; }
  .wht-chk {
    display: inline-block;
    width: 13px; height: 13px;
    border: 1px solid #000;
    text-align: center;
    font-size: 10px;
    font-weight: 700;
    line-height: 11px;
    vertical-align: middle;
    margin: 0 1px;
  }
  .wht-title-block { text-align: center; padding: 5px 0; border-bottom: 1px solid #000; }
  .wht-title-main { font-size: 16px; font-weight: 700; }
  .wht-copy-line { font-size: 10px; }
  .wht-income-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 2px; }
  .wht-income-table th, .wht-income-table td { border: 1px solid #000; padding: 2px 3px; vertical-align: top; }
  .wht-col-type { width: 54%; text-align: center; }
  .wht-col-date { width: 14%; text-align: center; }
  .wht-col-amt { width: 16%; text-align: center; }
  .wht-type-col { text-align: left; font-size: 9.5px; line-height: 1.2; }
  .wht-indent { padding-left: 12px; }
  .wht-indent2 { padding-left: 20px; }
  .wht-indent3 { padding-left: 16px; font-size: 9px; }
  .wht-subnote { font-size: 9px; border-bottom: none !important; }
  .wht-date-col { text-align: center; font-size: 9px; }
  .wht-amt-col { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; font-size: 10px; }
  .wht-sum-row td { font-weight: 700; }
  .wht-sum-label { text-align: center; }
  .wht-sum-text { font-size: 11px; }
  .wht-fund-row, .wht-payer-row { font-size: 10px; padding: 3px 0; border-top: 1px solid #000; }
  .wht-footer-table { width: 100%; border-collapse: collapse; margin-top: 2px; }
  .wht-warn-cell { width: 42%; font-size: 9px; border: 1px solid #000; padding: 4px; vertical-align: top; }
  .wht-sign-cell { width: 58%; border: 1px solid #000; padding: 6px 8px; vertical-align: top; position: relative; min-height: 88px; text-align: center; }
  .wht-cert-line { font-size: 11px; font-weight: 600; margin-bottom: 6px; }
  .wht-sign-line { font-size: 12px; margin: 8px 0 4px; }
  .wht-sign-date { font-size: 12px; }
  .wht-sign-caption { font-size: 9px; }
  .wht-stamp-box {
    position: absolute;
    right: 10px;
    top: 8px;
    width: 70px;
    height: 70px;
    border: 1px dashed #444;
    font-size: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    line-height: 1.15;
  }
  .wht-footnote { font-size: 8px; margin-top: 4px; line-height: 1.2; }
  @media print {
    body { padding: 0; }
    .wht50-sheet { page-break-inside: avoid; }
  }
`
