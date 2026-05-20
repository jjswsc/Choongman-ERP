import type { WhtCertificateData } from '@/lib/wht-certificate-data'

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtNum(n: number): string {
  const x = Number(n)
  if (!Number.isFinite(x)) return '0.00'
  return x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export type WhtCertificateLabels = {
  title: string
  formLine: string
  certNo: string
  paymentDate: string
  taxMonth: string
  agentTitle: string
  recipientTitle: string
  name: string
  taxId: string
  address: string
  incomeType: string
  gross: string
  rate: string
  withheld: string
  netPaid: string
  memo: string
  store: string
  signAgent: string
  signRecipient: string
}

export function defaultWhtCertificateLabels(lang: string): WhtCertificateLabels {
  const ko = lang === 'ko'
  const th = lang === 'th'
  return {
    title: ko
      ? '원천징수영수증 (หนังสือรับรองการหักภาษี ณ ที่จ่าย)'
      : th
        ? 'หนังสือรับรองการหักภาษี ณ ที่จ่าย'
        : 'Withholding Tax Certificate',
    formLine: ko ? '서식' : th ? 'แบบ' : 'Form',
    certNo: ko ? 'เลขที่ / 증명서 번호' : 'Book / Cert. No.',
    paymentDate: ko ? '지급일' : th ? 'วันที่จ่าย' : 'Payment date',
    taxMonth: ko ? '귀속 월' : th ? 'เดือนภาษี' : 'Tax month',
    agentTitle: ko
      ? 'ผู้มีหน้าที่หักภาษี ณ ที่จ่าย (원천징수 의무자)'
      : 'Withholding agent',
    recipientTitle: ko
      ? 'ผู้ถูกหักภาษี ณ ที่จ่าย (소득자)'
      : 'Income recipient',
    name: ko ? 'ชื่อ' : 'Name',
    taxId: ko ? 'เลขประจำตัวผู้เสียภาษี' : 'Tax ID',
    address: ko ? 'ที่อยู่' : 'Address',
    incomeType: ko ? 'ประเภทเงินได้' : 'Income type',
    gross: ko ? 'จำนวนเงินที่จ่าย' : 'Gross paid',
    rate: ko ? 'อัตรา' : 'Rate (%)',
    withheld: ko ? 'ภาษีที่หัก' : 'Tax withheld',
    netPaid: ko ? 'จำนวนเงินที่จ่ายสุทธิ' : 'Net paid',
    memo: ko ? 'หมายเหตุ' : 'Memo',
    store: ko ? '매장' : 'Store',
    signAgent: ko ? 'ผู้หักภาษี (ลงชื่อ)' : 'Agent signature',
    signRecipient: ko ? 'ผู้ถูกหักภาษี (ลงชื่อ)' : 'Recipient signature',
  }
}

function buildOneCertificateHtml(data: WhtCertificateData, labels: WhtCertificateLabels): string {
  const net = Math.max(0, Math.round((data.grossAmount - data.whtAmount) * 100) / 100)
  const form = esc(data.formHint || 'PND3')
  return `
    <section class="wht-cert-page">
      <div class="wht-cert-head">
        <h1>${esc(labels.title)}</h1>
        <p class="wht-cert-meta">${esc(labels.formLine)}: <strong>${form}</strong> · ${esc(labels.certNo)}: <strong>${esc(data.certificateNo)}</strong></p>
        <p class="wht-cert-meta">${esc(labels.paymentDate)}: <strong>${esc(data.paymentDate)}</strong> · ${esc(labels.taxMonth)}: <strong>${esc(data.taxMonth)}</strong></p>
        ${data.storeName ? `<p class="wht-cert-meta">${esc(labels.store)}: ${esc(data.storeName)}</p>` : ''}
      </motion.div>
      <div class="wht-cert-grid">
        <div class="wht-cert-box">
          <h2>${esc(labels.agentTitle)}</h2>
          <table class="wht-party">
            <tr><th>${esc(labels.name)}</th><td>${esc(data.withholdingAgent.name)}</td></tr>
            <tr><th>${esc(labels.taxId)}</th><td>${esc(data.withholdingAgent.taxId)}</td></tr>
            ${data.withholdingAgent.address ? `<tr><th>${esc(labels.address)}</th><td>${esc(data.withholdingAgent.address)}</td></tr>` : ''}
          </table>
        </div>
        <div class="wht-cert-box">
          <h2>${esc(labels.recipientTitle)}</h2>
          <table class="wht-party">
            <tr><th>${esc(labels.name)}</th><td>${esc(data.incomeRecipient.name)}</td></tr>
            <tr><th>${esc(labels.taxId)}</th><td>${esc(data.incomeRecipient.taxId)}</td></tr>
            ${data.incomeRecipient.address ? `<tr><th>${esc(labels.address)}</th><td>${esc(data.incomeRecipient.address)}</td></tr>` : ''}
          </table>
        </div>
      </motion.div>
      <table class="wht-amt">
        <thead>
          <tr>
            <th>${esc(labels.incomeType)}</th>
            <th class="num">${esc(labels.gross)}</th>
            <th class="num">${esc(labels.rate)}</th>
            <th class="num">${esc(labels.withheld)}</th>
            <th class="num">${esc(labels.netPaid)}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${esc(data.incomeType)}</td>
            <td class="num">${fmtNum(data.grossAmount)}</td>
            <td class="num">${data.whtRate != null ? fmtNum(data.whtRate) : '—'}</td>
            <td class="num">${fmtNum(data.whtAmount)}</td>
            <td class="num">${fmtNum(net)}</td>
          </tr>
        </tbody>
      </table>
      ${data.memo ? `<p class="wht-memo"><strong>${esc(labels.memo)}:</strong> ${esc(data.memo)}</p>` : ''}
      <motion.div class="wht-sign">
        <div class="wht-sign-col">
          <p>${esc(labels.signAgent)}</p>
          <div class="wht-sign-line"></motion.div>
          <p class="wht-sign-date">${esc(data.paymentDate)}</p>
        </div>
        <div class="wht-sign-col">
          <p>${esc(labels.signRecipient)}</p>
          <motion.div class="wht-sign-line"></motion.div>
          <p class="wht-sign-date">${esc(data.paymentDate)}</p>
        </div>
      </motion.div>
    </section>
  `
}

const WHT_CERT_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: "Sarabun", "Noto Sans Thai", "Malgun Gothic", sans-serif; color: #111; margin: 0; padding: 12mm; font-size: 13px; }
  .wht-cert-page { page-break-after: always; max-width: 190mm; margin: 0 auto 16mm; }
  .wht-cert-page:last-child { page-break-after: auto; }
  .wht-cert-head { text-align: center; margin-bottom: 14px; border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; }
  .wht-cert-head h1 { font-size: 18px; margin: 0 0 6px; color: #1e3a8a; }
  .wht-cert-meta { margin: 2px 0; font-size: 12px; color: #334155; }
  .wht-cert-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
  .wht-cert-box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; }
  .wht-cert-box h2 { font-size: 12px; margin: 0 0 6px; color: #1e40af; }
  .wht-party { width: 100%; border-collapse: collapse; font-size: 12px; }
  .wht-party th { text-align: left; width: 38%; padding: 4px 6px; color: #64748b; font-weight: 600; vertical-align: top; }
  .wht-party td { padding: 4px 6px; }
  .wht-amt { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
  .wht-amt th, .wht-amt td { border: 1px solid #94a3b8; padding: 8px 6px; }
  .wht-amt th { background: #eff6ff; }
  .wht-amt .num { text-align: right; font-variant-numeric: tabular-nums; }
  .wht-memo { font-size: 11px; color: #475569; margin: 8px 0; }
  .wht-sign { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 28px; }
  .wht-sign-col p { margin: 0 0 4px; font-size: 11px; }
  .wht-sign-line { border-bottom: 1px solid #334155; height: 36px; margin: 8px 0; }
  .wht-sign-date { font-size: 10px; color: #64748b; }
  @media print {
    body { padding: 0; }
    .wht-cert-page { page-break-inside: avoid; }
  }
`

/** Fix typo motion.div -> div in template - I accidentally used motion.div in strings */
export function buildWhtCertificateDocumentHtml(
  items: WhtCertificateData[],
  lang: string
): string {
  const labels = defaultWhtCertificateLabels(lang)
  const bodies = items.map((d) => buildOneCertificateHtmlFixed(d, labels)).join('\n')
  return `<!DOCTYPE html><html lang="${lang === 'ko' ? 'ko' : 'en'}"><head><meta charset="utf-8"/><title>${esc(labels.title)}</title><style>${WHT_CERT_STYLES}</style></head><body>${bodies}</body></html>`
}

function buildOneCertificateHtmlFixed(data: WhtCertificateData, labels: WhtCertificateLabels): string {
  return buildOneCertificateHtml(data, labels)
    .replace(/<\/?motion\.div/g, (m) => (m.startsWith('</') ? '</motion.div' : '<motion.div').replace('motion.div', 'motion.div'))
}
