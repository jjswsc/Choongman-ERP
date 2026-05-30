function toText(v: unknown): string {
  return String(v || '').trim()
}

export function formatSmsPhone(raw: string): string {
  const digits = toText(raw).replace(/[^\d]/g, '')
  if (digits.startsWith('66')) return digits
  if (digits.startsWith('0')) return `66${digits.slice(1)}`
  return digits
}

function thaiBulkConfig(): { apiKey: string; apiSecret: string; sender: string } | null {
  const apiKey = toText(process.env.THAIBULKSMS_API_KEY)
  const apiSecret = toText(process.env.THAIBULKSMS_API_SECRET)
  const sender = toText(process.env.THAIBULKSMS_SENDER)
  if (!apiKey || !apiSecret || !sender) return null
  return { apiKey, apiSecret, sender }
}

export function isMemberOtpSmsConfigured(): boolean {
  return thaiBulkConfig() !== null
}

export function isMemberOtpDebugEnabled(): boolean {
  return toText(process.env.MEMBER_OTP_DEBUG) === '1'
}

export async function sendMemberOtpSms(params: {
  phone: string
  code: string
  expireMinutes: number
}): Promise<{ provider: string }> {
  const cfg = thaiBulkConfig()
  if (!cfg) {
    throw new Error('SMS 발송 설정이 없습니다. THAIBULKSMS_API_KEY/SECRET/SENDER 환경변수를 설정해 주세요.')
  }

  const msisdn = formatSmsPhone(params.phone)
  if (!/^66\d{8,9}$/.test(msisdn)) {
    throw new Error('태국 휴대폰 번호 형식이 올바르지 않습니다. (예: 0812345678)')
  }

  const message = `[Choongman] 인증번호 ${params.code} (유효 ${params.expireMinutes}분)`
  const body = new URLSearchParams({
    msisdn,
    message,
    sender: cfg.sender,
  })

  const auth = Buffer.from(`${cfg.apiKey}:${cfg.apiSecret}`).toString('base64')
  const res = await fetch('https://api-v2.thaibulksms.com/sms', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  const text = await res.text()
  let data: Record<string, unknown> = {}
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    data = { raw: text }
  }

  if (!res.ok) {
    const err = data.error as { description?: string; name?: string } | undefined
    const detail = toText(err?.description) || toText(err?.name) || text || `HTTP ${res.status}`
    throw new Error(`SMS 발송 실패: ${detail}`)
  }

  const phoneList = data.phone_number_list as Array<{ number?: string }> | undefined
  const badList = data.bad_phone_number_list as Array<{ number?: string; message?: string }> | undefined
  if (badList?.length) {
    const msg = toText(badList[0]?.message) || '잘못된 번호'
    throw new Error(`SMS 발송 실패: ${msg}`)
  }
  if (!phoneList?.length) {
    throw new Error('SMS 발송 응답이 비어 있습니다.')
  }

  return { provider: 'thaibulksms' }
}
