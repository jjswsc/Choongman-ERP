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
    pnd1k: /PND1|ภ\.ง\.ด\.1/i.test(h),
    pnd1kSpecial: /PND1.*พิเศษ|1ก.*พิเศษ/i.test(h),
    pnd2: /PND2|ภ\.ง\.ด\.2/i.test(h) && !/2ก/i.test(h),
    pnd3: /PND3|ภ\.ง\.ด\.3/i.test(h) && !/3ก|53/i.test(h),
    pnd2k: /PND2K|2ก/i.test(h),
    pnd3k: /PND3K|3ก/i.test(h),
    pnd53: /PND53|ภ\.ง\.ด\.53|53/i.test(h),
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

function dottedLine(len = 80): string {
  return '.'.repeat(len)
}

function incomeAmountCells(
  rowKey: Wht50TawiIncomeRowKey,
  active: Wht50TawiIncomeRowKey,
  date: string,
  gross: number,
  wht: number
): string {
  if (rowKey !== active) {
    return `<td class="wht-date">${dottedLine(12)}</td><td class="wht-num"></td><td class="wht-num"></td>`
  }
  return `<td class="wht-date">${esc(date)}</td><td class="wht-num">${fmtNum(gross)}</td><td class="wht-num">${fmtNum(wht)}</td>`
}

function pndMark(on: boolean): string {
  return on ? '✓' : ''
}

export function buildWht50TawiCertificateHtml(data: WhtCertificateData): string {
  const r = resolveWht50Tawi(data)
  const issueDate = r.paymentDateDisplay

  const incomeRows: { key: Wht50TawiIncomeRowKey; label: string; sub?: boolean }[] = [
    { key: 'r1', label: '1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)' },
    { key: 'r2', label: '2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)' },
    { key: 'r3', label: '3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)' },
    { key: 'r4a', label: '4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)', sub: true },
    { key: 'r4b', label: '(ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)', sub: true },
    {
      key: 'r5',
      label:
        '5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น รางวัล ส่วนลดหรือประโยชน์ใด ๆ เนื่องจากการส่งเสริมการขาย รางวัลในการประกวด การแข่งขัน การชิงโชค ค่าแสดงของนักแสดงสาธารณะ ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเช่าซื้อ ดอกเบี้ย เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ',
    },
    {
      key: 'r6',
      label: `6. อื่น ๆ (ระบุ) ${r.incomeRow === 'r6' ? esc(r.incomeOtherText) : dottedLine(40)}`,
    },
  ]

  const incomeBody = incomeRows
    .map((row) => {
      const cells = incomeAmountCells(row.key, r.incomeRow, r.paymentDateDisplay, r.grossAmount, r.whtAmount)
      return `<tr class="${row.sub ? 'wht-sub' : ''}"><td class="wht-type">${row.label}</td>${cells}</tr>`
    })
    .join('')

  return `
<section class="wht50-page">
  <table class="wht50-wrap" cellspacing="0" cellpadding="0">
    <tr>
      <td colspan="2" class="wht50-agent-head">ผู้มีหน้าที่หักภาษี ณ ที่จ่าย : -</td>
    </tr>
    <tr>
      <td colspan="2" class="wht50-field">ชื่อ ${r.agentName ? `<span class="wht-fill">${esc(r.agentName)}</span>` : dottedLine(90)}</td>
    </tr>
    <tr>
      <td colspan="2" class="wht50-field wht50-addr">ที่อยู่ ${r.agentAddress ? `<span class="wht-fill">${esc(r.agentAddress)}</span>` : dottedLine(120)}</td>
    </tr>
    <tr>
      <td class="wht50-tin-label">เลขประจำตัวผู้เสียภาษีอากร</td>
      <td class="wht50-book">เล่มที่ <span class="wht-fill-sm">${esc(r.bookNo)}</span> เลขที่ <span class="wht-fill-sm">${esc(r.certNo)}</span></td>
    </tr>
    <tr>
      <td colspan="2"><table class="wht50-tin"><tr>${taxIdCells(r.agentTaxId)}</tr></table></td>
    </tr>
    <tr>
      <td colspan="2" class="wht50-title">
        <div class="wht50-title-main">หนังสือรับรองการหักภาษี ณ ที่จ่าย</div>
        <div>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</div>
        <div class="wht50-copy">ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)</div>
        <div class="wht50-copy">ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)</div>
      </td>
    </tr>
    <tr>
      <td colspan="2">
        <table class="wht50-income" cellspacing="0" cellpadding="0">
          <thead>
            <tr>
              <th class="wht-type-h">ประเภทเงินได้พึงประเมินที่จ่าย</th>
              <th class="wht-date-h">วัน เดือน หรือปีภาษี ที่จ่าย</th>
              <th class="wht-num-h">จำนวนเงินที่จ่าย</th>
              <th class="wht-num-h">ภาษีที่หักและนำส่งไว้</th>
            </tr>
          </thead>
          <tbody>
            ${incomeBody}
            <tr class="wht-total">
              <td colspan="2" class="wht-total-label">รวมเงินที่จ่ายและภาษีที่หักนำส่ง</td>
              <td class="wht-num">${fmtNum(r.grossAmount)}</td>
              <td class="wht-num">${fmtNum(r.whtAmount)}</td>
            </tr>
            <tr>
              <td colspan="4" class="wht-total-text">รวมเงินภาษีที่หักนำส่ง (ตัวอักษร) <span class="wht-fill">${esc(r.whtAmountText)}</span></td>
            </tr>
          </tbody>
        </table>
      </td>
    </tr>
    <tr>
      <td colspan="2" class="wht50-agent-head">ผู้ถูกหักภาษี ณ ที่จ่าย : -</td>
    </tr>
    <tr>
      <td colspan="2" class="wht50-field">ชื่อ ${r.recipientName ? `<span class="wht-fill">${esc(r.recipientName)}</span>` : dottedLine(90)}</td>
    </tr>
    <tr>
      <td colspan="2" class="wht50-field wht50-addr">ที่อยู่ ${r.recipientAddress ? `<span class="wht-fill">${esc(r.recipientAddress)}</span>` : dottedLine(120)}</td>
    </tr>
    <tr>
      <td class="wht50-tin-label">เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*</td>
      <td></td>
    </tr>
    <tr>
      <td colspan="2"><table class="wht50-tin"><tr>${taxIdCells(r.recipientTaxId)}</tr></table></td>
    </tr>
    <tr>
      <td colspan="2" class="wht50-pnd">
        ลำดับที่ <span class="wht-fill-sm">${esc(r.sequenceNo)}</span> ในแบบ
        (1) ภ.ง.ด.1ก <span class="wht-chk">${pndMark(r.pndChecks.pnd1k)}</span>
        (2) ภ.ง.ด.1ก พิเศษ <span class="wht-chk">${pndMark(r.pndChecks.pnd1kSpecial)}</span>
        (3) ภ.ง.ด.2 <span class="wht-chk">${pndMark(r.pndChecks.pnd2)}</span>
        (4) ภ.ง.ด.3 <span class="wht-chk">${pndMark(r.pndChecks.pnd3)}</span>
        (5) ภ.ง.ด.2ก <span class="wht-chk">${pndMark(r.pndChecks.pnd2k)}</span>
        (6) ภ.ง.ด.3ก <span class="wht-chk">${pndMark(r.pndChecks.pnd3k)}</span>
        (7) ภ.ง.ด.53 <span class="wht-chk">${pndMark(r.pndChecks.pnd53)}</span>
        <span class="wht50-pnd-note">(ให้สามารถอ้างอิงหรือสอบยันกันได้ระหว่างลำดับที่ตามหนังสือรับรองฯ กับแบบยื่นรายการภาษีหัก ที่จ่าย)</span>
      </td>
    </tr>
    <tr>
      <td colspan="2" class="wht50-payer">
        ผู้จ่ายเงิน
        (1) หัก ณ ที่จ่าย <span class="wht-chk">${r.payerMode === 'withhold' ? '✓' : ''}</span>
        (2) ออกให้ตลอดไป <span class="wht-chk">${r.payerMode === 'forever' ? '✓' : ''}</span>
        (3) ออกให้ครั้งเดียว <span class="wht-chk">${r.payerMode === 'once' ? '✓' : ''}</span>
        (4) อื่น ๆ (ระบุ) ${dottedLine(20)}
      </td>
    </tr>
    <tr>
      <td colspan="2" class="wht50-fund">
        เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน ${dottedLine(8)} บาท
        กองทุนประกันสังคม ${dottedLine(8)} บาท
        กองทุนสำรองเลี้ยงชีพ ${dottedLine(8)} บาท
      </td>
    </tr>
    <tr>
      <td class="wht50-warn" colspan="2">
        <strong>คำเตือน</strong> ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร
      </td>
    </tr>
    <tr>
      <td colspan="2" class="wht50-cert">ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</td>
    </tr>
    <tr>
      <td class="wht50-sign" colspan="2">
        ลงชื่อ ${dottedLine(40)} ผู้จ่ายเงิน
        <div class="wht50-sign-date">${issueDate || '....../....../........'}</div>
        <div>(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)</div>
        <div class="wht50-stamp">ประทับตรา<br/>นิติบุคคล<br/>(ถ้ามี)</div>
      </td>
    </tr>
    <tr>
      <td colspan="2" class="wht50-foot">
        หมายเหตุ เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* หมายถึง 1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง
        2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า 3. กรณีอื่น ๆ นอกเหนือจาก 1. และ 2. ให้ใช้เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) ของกรมสรรพากร
      </td>
    </tr>
  </table>
</section>`
}

export const WHT_50_TAWI_STYLES = `
  @page { size: A4 portrait; margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 0; font-family: "Sarabun", "TH Sarabun New", "Noto Sans Thai", sans-serif; font-size: 11px; color: #000; line-height: 1.25; }
  .wht50-page { page-break-after: always; width: 100%; max-width: 194mm; margin: 0 auto; }
  .wht50-page:last-child { page-break-after: auto; }
  .wht50-wrap { width: 100%; border-collapse: collapse; }
  .wht50-wrap td { vertical-align: top; padding: 2px 0; }
  .wht50-agent-head { font-weight: 700; padding-top: 4px; }
  .wht50-field, .wht50-addr { letter-spacing: 0.02em; }
  .wht-fill { border-bottom: 1px dotted #000; padding: 0 4px; font-weight: 600; }
  .wht-fill-sm { border-bottom: 1px dotted #000; padding: 0 6px; min-width: 40px; display: inline-block; }
  .wht50-tin-label { font-size: 10px; }
  .wht50-book { text-align: right; font-size: 10px; white-space: nowrap; }
  .wht50-tin { border-collapse: collapse; margin: 2px 0 6px; }
  .wht-tin-cell { width: 14px; height: 18px; border: 1px solid #000; text-align: center; font-size: 11px; font-weight: 600; padding: 0; }
  .wht50-title { text-align: center; padding: 6px 0; border-top: 1px solid #000; border-bottom: 1px solid #000; }
  .wht50-title-main { font-size: 15px; font-weight: 700; }
  .wht50-copy { font-size: 9.5px; }
  .wht50-income { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: 9.5px; }
  .wht50-income th, .wht50-income td { border: 1px solid #000; padding: 3px 4px; vertical-align: top; }
  .wht-type-h { width: 52%; text-align: center; }
  .wht-date-h { width: 16%; text-align: center; }
  .wht-num-h { width: 16%; text-align: center; }
  .wht-type { text-align: left; }
  .wht-sub .wht-type { padding-left: 14px; }
  .wht-date { text-align: center; font-size: 9px; color: #333; }
  .wht-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .wht-total td { font-weight: 700; }
  .wht-total-label { text-align: center; }
  .wht-total-text { font-size: 10px; }
  .wht50-pnd, .wht50-payer, .wht50-fund { font-size: 9.5px; padding-top: 4px; }
  .wht-chk { display: inline-block; min-width: 14px; text-align: center; font-weight: 700; border: 1px solid #000; margin: 0 2px; line-height: 12px; }
  .wht50-pnd-note { display: block; font-size: 8.5px; margin-top: 2px; }
  .wht50-warn { font-size: 9px; border: 1px solid #000; padding: 4px; margin-top: 4px; }
  .wht50-cert { text-align: center; font-weight: 600; padding: 6px 0; }
  .wht50-sign { text-align: center; padding: 8px 0 4px; min-height: 70px; position: relative; }
  .wht50-sign-date { margin-top: 8px; font-size: 11px; }
  .wht50-stamp { position: absolute; right: 8%; top: 0; width: 72px; height: 72px; border: 1px dashed #666; font-size: 9px; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 1.2; }
  .wht50-foot { font-size: 8px; padding-top: 6px; border-top: 1px solid #ccc; }
  @media print {
    body { padding: 0; }
    .wht50-page { page-break-inside: avoid; }
  }
`
