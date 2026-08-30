import {
  CRYPTO_CONTRACTS,
  type CryptoAssetKey,
} from '@/lib/payments/crypto-assets'
import type { CryptoWatchTx } from '@/lib/payments/crypto-watch/match'

export function cryptoExplorerKeysPresent(): { etherscan: boolean; trongrid: boolean } {
  return {
    etherscan: Boolean(String(process.env.ETHERSCAN_API_KEY || '').trim()),
    trongrid: Boolean(String(process.env.TRONGRID_API_KEY || '').trim()),
  }
}

function etherscanKey(): string {
  return String(process.env.ETHERSCAN_API_KEY || '').trim()
}

function trongridKey(): string {
  return String(process.env.TRONGRID_API_KEY || '').trim()
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function parseMempoolAddressTxs(raw: unknown, wallet: string): CryptoWatchTx[] {
  if (!Array.isArray(raw)) return []
  const addr = String(wallet || '').trim()
  const out: CryptoWatchTx[] = []
  for (const item of raw) {
    const o = asRecord(item)
    if (!o) continue
    const txid = String(o.txid || '').trim()
    const status = asRecord(o.status)
    const confirmed = status?.confirmed === true
    const blockTime = num(status?.block_time) * 1000
    const vouts = Array.isArray(o.vout) ? o.vout : []
    let amount = 0
    for (const v of vouts) {
      const vo = asRecord(v)
      if (!vo) continue
      if (String(vo.scriptpubkey_address || '').trim() !== addr) continue
      amount += num(vo.value) / 1e8
    }
    if (!txid || amount <= 0) continue
    out.push({
      txHash: txid,
      toAddress: addr,
      amount,
      timestampMs: blockTime || Date.now(),
      confirmations: confirmed ? 1 : 0,
      asset: 'btc',
    })
  }
  return out
}

export function parseEtherscanTokentx(raw: unknown, wallet: string, asset: CryptoAssetKey): CryptoWatchTx[] {
  const o = asRecord(raw)
  const rows = Array.isArray(o?.result) ? o.result : []
  const to = String(wallet || '').trim().toLowerCase()
  const out: CryptoWatchTx[] = []
  for (const row of rows) {
    const r = asRecord(row)
    if (!r) continue
    if (String(r.to || '').trim().toLowerCase() !== to) continue
    const decimals = Math.max(0, Math.trunc(num(r.tokenDecimal) || 6))
    const amount = num(r.value) / 10 ** decimals
    const hash = String(r.hash || '').trim()
    if (!hash || amount <= 0) continue
    out.push({
      txHash: hash,
      toAddress: to,
      amount,
      timestampMs: num(r.timeStamp) * 1000,
      confirmations: Math.max(0, Math.trunc(num(r.confirmations))),
      asset,
    })
  }
  return out
}

export function parseEtherscanTxlist(raw: unknown, wallet: string): CryptoWatchTx[] {
  const o = asRecord(raw)
  const rows = Array.isArray(o?.result) ? o.result : []
  const to = String(wallet || '').trim().toLowerCase()
  const out: CryptoWatchTx[] = []
  for (const row of rows) {
    const r = asRecord(row)
    if (!r) continue
    if (String(r.to || '').trim().toLowerCase() !== to) continue
    const amount = num(r.value) / 1e18
    const hash = String(r.hash || '').trim()
    if (!hash || amount <= 0) continue
    out.push({
      txHash: hash,
      toAddress: to,
      amount,
      timestampMs: num(r.timeStamp) * 1000,
      confirmations: Math.max(0, Math.trunc(num(r.confirmations))),
      asset: 'eth',
    })
  }
  return out
}

export function parseTronGridTrc20(raw: unknown, wallet: string): CryptoWatchTx[] {
  const o = asRecord(raw)
  const rows = Array.isArray(o?.data) ? o.data : []
  const to = String(wallet || '').trim()
  const out: CryptoWatchTx[] = []
  for (const row of rows) {
    const r = asRecord(row)
    if (!r) continue
    if (String(r.to || '').trim() !== to) continue
    const token = String(r.token_info && asRecord(r.token_info)?.address ? asRecord(r.token_info)?.address : '')
    if (token && token !== CRYPTO_CONTRACTS.usdtTrc20) continue
    const decimals = Math.max(0, Math.trunc(num(asRecord(r.token_info)?.decimals) || 6))
    const amount = num(r.value) / 10 ** decimals
    const hash = String(r.transaction_id || r.txID || '').trim()
    if (!hash || amount <= 0) continue
    out.push({
      txHash: hash,
      toAddress: to,
      amount,
      timestampMs: num(r.block_timestamp) || Date.now(),
      confirmations: 1,
      asset: 'usdt_trc20',
    })
  }
  return out
}

async function fetchJson(url: string, headers?: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...(headers || {}) },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`explorer_http_${res.status}`)
  return res.json()
}

export async function fetchCryptoWatchTxs(params: {
  asset: CryptoAssetKey
  walletAddress: string
}): Promise<CryptoWatchTx[]> {
  const wallet = String(params.walletAddress || '').trim()
  if (!wallet) return []
  const key = etherscanKey()
  const etherscanQs = key ? `&apikey=${encodeURIComponent(key)}` : ''

  if (params.asset === 'btc') {
    const raw = await fetchJson(`https://mempool.space/api/address/${encodeURIComponent(wallet)}/txs`)
    return parseMempoolAddressTxs(raw, wallet)
  }
  if (params.asset === 'usdt_trc20') {
    const headers: Record<string, string> = {}
    const tg = trongridKey()
    if (tg) headers['TRON-PRO-API-KEY'] = tg
    const raw = await fetchJson(
      `https://api.trongrid.io/v1/accounts/${encodeURIComponent(wallet)}/transactions/trc20?limit=30&only_to=true`,
      headers
    )
    return parseTronGridTrc20(raw, wallet)
  }
  if (params.asset === 'eth') {
    const raw = await fetchJson(
      `https://api.etherscan.io/v2/api?chainid=1&module=account&action=txlist&address=${encodeURIComponent(wallet)}&page=1&offset=30&sort=desc${etherscanQs}`
    )
    return parseEtherscanTxlist(raw, wallet)
  }
  const contract =
    params.asset === 'usdc_erc20' ? CRYPTO_CONTRACTS.usdcErc20 : CRYPTO_CONTRACTS.usdtErc20
  const raw = await fetchJson(
    `https://api.etherscan.io/v2/api?chainid=1&module=account&action=tokentx&contractaddress=${contract}&address=${encodeURIComponent(wallet)}&page=1&offset=30&sort=desc${etherscanQs}`
  )
  return parseEtherscanTokentx(raw, wallet, params.asset)
}
