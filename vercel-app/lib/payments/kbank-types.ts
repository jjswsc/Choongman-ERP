export type KbankTokenResponse = {
  access_token: string
  token_type?: string
  expires_in?: number
  scope?: string
}

export type KbankGenerateQrRequest = {
  amount: number
  partnerTransactionId: string
  qrType?: string
  orderId?: number
  storeCode?: string
  reference1?: string
  reference2?: string
  reference3?: string
  reference4?: string
  payload?: Record<string, unknown>
}

export type KbankGenerateQrResult = {
  ok: boolean
  requestId: string
  statusCode?: string
  statusMessage?: string
  response: Record<string, unknown>
}

export type KbankCheckStatusRequest = {
  partnerTransactionId?: string
  originalTransactionId?: string
  refId?: string
  terminalId?: string
  txnNo?: string
  orderId?: number
  storeCode?: string
  payload?: Record<string, unknown>
}

export type KbankCheckStatusResult = {
  ok: boolean
  requestId: string
  statusCode?: string
  statusMessage?: string
  response: Record<string, unknown>
}

export type KbankCancelQrRequest = {
  partnerTransactionId?: string
  originalTransactionId?: string
  refId?: string
  orderId?: number
  storeCode?: string
  payload?: Record<string, unknown>
}

export type KbankCancelQrResult = {
  ok: boolean
  requestId: string
  statusCode?: string
  statusMessage?: string
  response: Record<string, unknown>
}

export type KbankVoidPaymentRequest = {
  partnerTransactionId?: string
  originalTransactionId?: string
  origPartnerTxnUid?: string
  refId?: string
  terminalId?: string
  txnNo?: string
  orderId?: number
  storeCode?: string
  payload?: Record<string, unknown>
}

export type KbankVoidPaymentResult = {
  ok: boolean
  requestId: string
  statusCode?: string
  statusMessage?: string
  response: Record<string, unknown>
}

export type KbankSettlementRequest = {
  partnerTransactionId?: string
  originalTransactionId?: string
  refId?: string
  terminalId?: string
  qrType?: string
  orderId?: number
  storeCode?: string
  payload?: Record<string, unknown>
}

export type KbankSettlementResult = {
  ok: boolean
  requestId: string
  statusCode?: string
  statusMessage?: string
  response: Record<string, unknown>
}
