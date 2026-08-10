import type { WhtCertificateData } from '@/lib/wht-certificate-data'
import { buildWht50TawiCertificateHtmlBothCopies, WHT_50_TAWI_STYLES } from '@/lib/wht-certificate-50tawi'

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** @deprecated 레거시 라벨 — 공식 50 ทวิ 양식은 태국어 고정 */
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

/** 양식 본문만 (시트 HTML). 미리보기·문서 조립용 */
export function buildWhtCertificateBodiesHtml(items: WhtCertificateData[]): string {
  return (items || [])
    .filter((d) => d.whtAmount > 0)
    .map((d) => buildWht50TawiCertificateHtmlBothCopies(d))
    .join('\n')
}

export function buildWhtCertificateDocumentHtml(items: WhtCertificateData[], _lang?: string): string {
  const bodies = buildWhtCertificateBodiesHtml(items)
  const title = 'หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ)'
  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"/><title>${esc(title)}</title><style>${WHT_50_TAWI_STYLES}</style></head><body>${bodies || '<p>—</p>'}</body></html>`
}
