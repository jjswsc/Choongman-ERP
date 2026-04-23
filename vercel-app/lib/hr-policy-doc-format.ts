/**
 * 인사 규정 본문: 상단에 문서번호·수신 행(공문 느낌) + 본문. 기존 단일 텍스트는 본문으로만 취급.
 */
export type HrPolicyDocParts = {
  docRef: string
  recipientTo: string
  body: string
}

const LINE_REF = /^\s*〔\s*문서번호\s*:\s*([^\n〕]+)〕/u
const LINE_TO = /^\s*〔\s*수신\s*:\s*([^\n〕]+)〕/u

export function parseHrPolicyContent(raw: string): HrPolicyDocParts {
  const t = String(raw || '')
  if (!t.trim()) {
    return { docRef: '', recipientTo: '', body: '' }
  }
  const lines = t.split('\n')
  let i = 0
  let docRef = ''
  let recipientTo = ''
  if (i < lines.length) {
    const m1 = lines[i]?.match(LINE_REF)
    if (m1) {
      docRef = (m1[1] || '').trim()
      i += 1
    }
  }
  if (i < lines.length) {
    const m2 = lines[i]?.match(LINE_TO)
    if (m2) {
      recipientTo = (m2[1] || '').trim()
      i += 1
    }
  }
  if (i < lines.length && lines[i]?.trim() === '') {
    i += 1
  }
  const body = lines.slice(i).join('\n')
  if (!docRef && !recipientTo) {
    return { docRef: '', recipientTo: '', body: t }
  }
  return { docRef, recipientTo, body: body || '' }
}

export function buildHrPolicyContent(parts: HrPolicyDocParts): string {
  const ref = (parts.docRef || '').trim()
  const to = (parts.recipientTo || '').trim()
  const body = parts.body || ''
  const head: string[] = []
  if (ref) head.push(`〔문서번호: ${ref}〕`)
  if (to) head.push(`〔수신: ${to}〕`)
  if (head.length === 0) return body
  return `${head.join('\n')}\n\n${body}`.trimEnd()
}

export const HR_POLICY_TEMPLATE_KO = `제1조 (목적)
이 규정은 (목적을 기술합니다).

제2조 (적용범위)
① 본 규정은 (적용 대상)에게 적용합니다.
② (예외)에 대하여는 (별도 규정)을 따릅니다.

제3조 (용어의 정의)
이 규정에서 사용하는 용어의 정의는 다음과 같습니다.`
