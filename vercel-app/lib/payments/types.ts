export type LinkposMode = 'hypercom' | 'manual_edc'

export type LinkposTransactionCode = '20' | '26' | '50'

export type LinkposBankId = string

export type LinkposPayRequest = {
  amount: number
  currency?: 'THB'
  bankId: LinkposBankId
  reference1: string
  reference2?: string
  mode?: LinkposMode
  timeoutMs?: number
}

export type LinkposVoidRequest = {
  traceNo: string
  bankId: LinkposBankId
  reference1: string
  mode?: LinkposMode
  timeoutMs?: number
}

export type LinkposSettlementRequest = {
  nii: string
  bankId: LinkposBankId
  reference1: string
  mode?: LinkposMode
  timeoutMs?: number
}

export type LinkposFieldMap = Record<string, string>

export type LinkposProviderResult = {
  ok: boolean
  txCode: LinkposTransactionCode
  responseCode: string
  responseText?: string
  approvalCode?: string
  traceNo?: string
  refNo?: string
  terminalId?: string
  merchantId?: string
  fields?: LinkposFieldMap
  rawRequestHex?: string
  rawResponseHex?: string
  errorCode?: string
  errorMessage?: string
}

export type LinkposProvider = {
  sale(req: LinkposPayRequest): Promise<LinkposProviderResult>
  void(req: LinkposVoidRequest): Promise<LinkposProviderResult>
  settlement(req: LinkposSettlementRequest): Promise<LinkposProviderResult>
}

export type LinkposAttemptStatus =
  | 'pending'
  | 'approved'
  | 'declined'
  | 'timeout'
  | 'network_error'
  | 'failed'

export type LinkposErrorClass =
  | 'validation'
  | 'network'
  | 'timeout'
  | 'declined'
  | 'protocol'
  | 'internal'

export type LinkposPaymentSummary = {
  provider: 'kbtg_linkpos'
  mode: LinkposMode
  txCode: LinkposTransactionCode
  bankId: string
  responseCode: string
  approvalCode?: string
  traceNo?: string
  refNo?: string
  terminalId?: string
  merchantId?: string
  reference1: string
  requestedAmount: number
  approvedAmount: number
  requestedAt: string
  respondedAt: string
}
