/**
 * LinkPOS Local Bridge (HTTP ↔ RS232)
 * Shared by Windows Electron POS (in-process) and standalone `linkpos-bridge`.
 *
 * Protocol matches EDC tester (KBTG LINK POS v1.6.0):
 * - BCD length as hex nibbles
 * - LRC from length through ETX (STX excluded)
 * - ACK / NAK then final frame
 * - Sale/Void More Indicator = 1
 */

const http = require('http')
const fs = require('fs')
const path = require('path')

const STX = 0x02
const ETX = 0x03
const FS = 0x1c
const ACK = 0x06
const NAK = 0x15

function defaultConfig() {
  return {
    httpPort: 18181,
    serial: { path: 'COM3', baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' },
    responseTimeoutMs: 120000,
    verbose: false,
  }
}

function mergeConfig(base, extra) {
  const e = extra && typeof extra === 'object' ? extra : {}
  return {
    ...base,
    ...e,
    serial: { ...base.serial, ...(e.serial || {}) },
  }
}

function loadConfigFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null
    let raw = fs.readFileSync(filePath, 'utf8')
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function bcdLen4(n) {
  const s = String(Math.max(0, Math.min(9999, n))).padStart(4, '0')
  return Buffer.from([
    Number.parseInt(s.slice(0, 2), 16),
    Number.parseInt(s.slice(2, 4), 16),
  ])
}

function calcLrc(bytes) {
  let lrc = 0
  for (const b of bytes) lrc ^= b
  return lrc & 0xff
}

function buildField(type, value) {
  const t = String(type).padEnd(2, ' ').slice(0, 2)
  const data = Buffer.from(String(value ?? ''), 'ascii')
  return Buffer.concat([
    Buffer.from(t, 'ascii'),
    bcdLen4(data.length),
    data,
    Buffer.from([FS]),
  ])
}

function buildFrame(opts) {
  const txCode = String(opts.txCode || '20').padEnd(2, ' ').slice(0, 2)
  const rr = opts.reqRes || '0'
  const rc = String(opts.responseCode || '00').padEnd(2, ' ').slice(0, 2)
  const more = opts.more || '0'
  const fv = opts.formatVersion || '1'
  const message = Buffer.concat([
    Buffer.from(`6000000000${fv}${rr}${txCode}${rc}${more}`, 'ascii'),
    Buffer.from([FS]),
    ...(opts.fields || []).map((f) => buildField(f.type, f.data)),
  ])
  const lenBcd = bcdLen4(message.length)
  const withoutStx = Buffer.concat([lenBcd, message, Buffer.from([ETX])])
  const lrc = calcLrc(withoutStx)
  return Buffer.concat([Buffer.from([STX]), withoutStx, Buffer.from([lrc])])
}

function parseFieldsInOrder(fieldsRaw) {
  const list = []
  let i = 0
  while (i + 4 <= fieldsRaw.length) {
    if (fieldsRaw[i] === FS) { i += 1; continue }
    const type = fieldsRaw.slice(i, i + 2).toString('ascii')
    const hi = fieldsRaw[i + 2]
    const lo = fieldsRaw[i + 3]
    const len = (Math.floor(hi / 16) * 10 + (hi % 16)) * 100
      + Math.floor(lo / 16) * 10 + (lo % 16)
    i += 4
    const data = fieldsRaw.slice(i, i + len).toString('ascii')
    i += len
    if (i < fieldsRaw.length && fieldsRaw[i] === FS) i += 1
    list.push({ type, data })
  }
  return list
}

function parseFrame(buf) {
  if (!buf || buf.length === 0) throw new Error('empty_response')
  if (buf.length === 1 && buf[0] === ACK) return { type: 'ACK', txCode: '', responseCode: '', fields: {}, fieldOrder: [] }
  if (buf.length === 1 && buf[0] === NAK) return { type: 'NAK', txCode: '', responseCode: '', fields: {}, fieldOrder: [] }
  if (buf.length < 6 || buf[0] !== STX) throw new Error('invalid_frame')
  const etxIdx = buf.lastIndexOf(ETX)
  if (etxIdx < 0 || etxIdx >= buf.length - 1) throw new Error('no_etx')
  const expected = calcLrc(buf.slice(1, etxIdx + 1))
  if (expected !== buf[etxIdx + 1]) throw new Error('invalid_lrc')
  const body = buf.slice(3, etxIdx)
  if (body.length < 16) throw new Error('body_too_short')
  const txCode = body.slice(12, 14).toString('ascii')
  const responseCode = body.slice(14, 16).toString('ascii')
  const fsIdx = body.indexOf(FS, 0)
  const fieldsRaw = fsIdx >= 0 ? body.slice(fsIdx + 1) : Buffer.alloc(0)
  const fieldList = parseFieldsInOrder(fieldsRaw)
  const fields = {}
  for (const f of fieldList) fields[f.type] = f.data
  return {
    type: 'Frame',
    txCode,
    responseCode,
    fields,
    fieldOrder: fieldList.map((f) => f.type),
    fieldList,
  }
}

function normalizeAmount12(amount) {
  const cents = Math.round(Math.max(0, Number(amount)) * 100)
  return String(cents).padStart(12, '0')
}

const HYPERCOM_REF_MAX_LEN = 20
const THAI_QR_PAYMENT_INDICATOR = '03'
const DEFAULT_KASIKORN_BANK_ID = '04'
const NATIVE_QR_FIELD_ORDER = ['40', 'A1', 'R1', 'R2', 'J6']

/** Hypercom R1/R2: ASCII printable 0x20–0x7E only, max 20. Thai/Unicode is not supported. */
function sanitizeHypercomText(value, maxLen = HYPERCOM_REF_MAX_LEN) {
  const limit = Math.max(0, Number(maxLen) || HYPERCOM_REF_MAX_LEN)
  const raw = String(value ?? '').trim()
  let out = ''
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    if (code >= 0x20 && code <= 0x7e) {
      out += raw.charAt(i)
      if (out.length >= limit) break
    }
  }
  return out.trim().slice(0, limit)
}

function normalizeThaiQrA1(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return THAI_QR_PAYMENT_INDICATOR
  return digits.padStart(2, '0').slice(-2)
}

function normalizeQrBankId(bankId) {
  const id = sanitizeHypercomText(bankId, 3)
  return id || DEFAULT_KASIKORN_BANK_ID
}

/**
 * LinkPOS Native QR (tx 70) — KBTG: 40 → A1=03 → R1 → R2 → J6=04 (KBank default).
 * Not the KBank Partner QR API.
 */
function buildNativeQrFields(json) {
  const a1 = normalizeThaiQrA1(json && (json.paymentIndicator || json.qrType))
  const fields = [
    { type: '40', data: normalizeAmount12(json && json.amount) },
    { type: 'A1', data: a1 },
  ]
  const ref1 = sanitizeHypercomText(json && json.reference1)
  const ref2 = sanitizeHypercomText(json && json.reference2)
    || sanitizeHypercomText(json && json.storeCode)
  if (ref1) fields.push({ type: 'R1', data: ref1 })
  if (ref2) fields.push({ type: 'R2', data: ref2 })
  fields.push({ type: 'J6', data: normalizeQrBankId(json && json.bankId) })
  return fields
}

function buildNativeQrRequestFrame(json) {
  return buildFrame({ txCode: '70', more: '1', fields: buildNativeQrFields(json) })
}

function selfTestProtocol() {
  const d0 = buildFrame({ txCode: 'D0', reqRes: '1' }).toString('hex').toUpperCase()
  const expectedD0 = '02001836303030303030303030313144303030301C0345'
  if (d0 !== expectedD0) throw new Error(`D0 mismatch expected ${expectedD0} actual ${d0}`)
  const sale = buildFrame({
    txCode: '20',
    more: '1',
    fields: [{ type: '40', data: '000000000100' }],
  }).toString('hex').toUpperCase()
  const expectedSale = '02003536303030303030303030313032303030311C343000123030303030303030303130301C0315'
  if (sale !== expectedSale) throw new Error(`Sale mismatch expected ${expectedSale} actual ${sale}`)

  const qrJson = {
    amount: 1,
    paymentIndicator: '03',
    reference1: 'POSQR123',
    reference2: 'TABLE1',
  }
  const qrFields = buildNativeQrFields(qrJson)
  const qrOrder = qrFields.map((f) => f.type).join(',')
  const expectedOrder = NATIVE_QR_FIELD_ORDER.join(',')
  if (qrOrder !== expectedOrder) {
    throw new Error(`QR field order mismatch expected ${expectedOrder} actual ${qrOrder}`)
  }
  if (qrFields[1].data !== THAI_QR_PAYMENT_INDICATOR) {
    throw new Error(`QR A1 expected ${THAI_QR_PAYMENT_INDICATOR} actual ${qrFields[1].data}`)
  }
  if (qrFields[4].data !== DEFAULT_KASIKORN_BANK_ID) {
    throw new Error(`QR J6 default expected ${DEFAULT_KASIKORN_BANK_ID} actual ${qrFields[4].data}`)
  }

  const stripped = buildNativeQrFields({
    amount: 1,
    reference1: 'โต๊ะPOSQR-1234567890XXXX',
    reference2: '충만-โต๊ะ 5',
    bankId: '',
  })
  if (stripped[2].data.length > HYPERCOM_REF_MAX_LEN) {
    throw new Error(`QR R1 exceeds ${HYPERCOM_REF_MAX_LEN}`)
  }
  if (/[^\x20-\x7E]/.test(stripped[2].data + stripped[3].data)) {
    throw new Error('QR R1/R2 must be ASCII printable 0x20-0x7E')
  }
  if (stripped[2].data.includes('โต๊ะ') || stripped[3].data.includes('โต๊ะ')) {
    throw new Error('QR R1/R2 still contains Thai after sanitize')
  }
  if (stripped[4].data !== DEFAULT_KASIKORN_BANK_ID) {
    throw new Error('QR J6 missing Kasikorn default 04')
  }

  const qrFrame = buildNativeQrRequestFrame(qrJson)
  const parsedQr = parseFrame(qrFrame)
  if (parsedQr.txCode !== '70') throw new Error(`QR txCode expected 70 actual ${parsedQr.txCode}`)
  if (parsedQr.fieldOrder.join(',') !== expectedOrder) {
    throw new Error(`QR frame field order mismatch expected ${expectedOrder} actual ${parsedQr.fieldOrder.join(',')}`)
  }
  const expectedQrHex = '02007336303030303030303030313037303030311C343000123030303030303030303130301C4131000230331C52310008504F5351523132331C523200065441424C45311C4A36000230341C0340'
  const qrHex = qrFrame.toString('hex').toUpperCase()
  if (qrHex !== expectedQrHex) throw new Error(`QR frame mismatch expected ${expectedQrHex} actual ${qrHex}`)

  const parsedSale = parseFrame(Buffer.from(expectedSale, 'hex'))
  if (parsedSale.txCode !== '20') throw new Error(`Sale txCode expected 20 actual ${parsedSale.txCode}`)
  if (parsedSale.responseCode !== '00') throw new Error(`Sale responseCode expected 00 actual ${parsedSale.responseCode}`)
  const parsedVoid = parseFrame(buildFrame({ txCode: '26', more: '1', fields: [{ type: '65', data: '000001' }] }))
  if (parsedVoid.txCode !== '26') throw new Error(`Void txCode expected 26 actual ${parsedVoid.txCode}`)

  const omittedR2 = buildNativeQrFields({ amount: 1, reference1: 'POSQR1', reference2: 'โต๊ะ' })
  if (omittedR2.map((f) => f.type).join(',') !== '40,A1,R1,J6') {
    throw new Error(`empty R2 should be omitted, got ${omittedR2.map((f) => f.type).join(',')}`)
  }
}

/** @type {{ cfg: ReturnType<typeof defaultConfig>, server: import('http').Server|null, port: any, portReady: boolean, busy: boolean, queue: any[], SerialPort: any, log: Function, dbg: Function } | null} */
let runtime = null

function createRuntime(userCfg) {
  const cfg = mergeConfig(defaultConfig(), userCfg)
  const log = (...args) => console.log(new Date().toISOString(), '[linkpos]', ...args)
  const dbg = (...args) => {
    if (cfg.verbose) console.log(new Date().toISOString(), '[linkpos][DBG]', ...args)
  }

  let SerialPort = null
  try {
    SerialPort = require('serialport').SerialPort
  } catch {
    log('serialport missing — MOCK mode (no real EDC)')
  }

  const state = {
    cfg,
    server: null,
    port: null,
    portReady: false,
    busy: false,
    queue: [],
    SerialPort,
    log,
    dbg,
    reconnectTimer: null,
  }

  function openSerial() {
    if (!state.SerialPort) return
    try {
      if (state.port && state.port.isOpen) {
        try { state.port.close() } catch { /* ignore */ }
      }
      state.port = new state.SerialPort({
        path: state.cfg.serial.path,
        baudRate: state.cfg.serial.baudRate,
        dataBits: state.cfg.serial.dataBits,
        stopBits: state.cfg.serial.stopBits,
        parity: state.cfg.serial.parity,
        autoOpen: false,
      })
      state.port.open((err) => {
        if (err) {
          state.log('serial open error:', err.message)
          state.portReady = false
          scheduleReconnect()
          return
        }
        try { state.port.set({ dtr: true, rts: true }) } catch { /* optional */ }
        state.log(`serial opened ${state.cfg.serial.path} @ ${state.cfg.serial.baudRate}`)
        state.portReady = true
      })
      state.port.on('error', (err) => {
        state.log('serial error:', err.message)
        state.portReady = false
      })
      state.port.on('close', () => {
        state.log('serial closed — reconnecting in 5s')
        state.portReady = false
        scheduleReconnect()
      })
    } catch (e) {
      state.log('serial init error:', e.message)
      state.portReady = false
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (state.reconnectTimer) return
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null
      if (runtime === state) openSerial()
    }, 5000)
  }

  function readEdcResponse(timeoutMs, opts = {}) {
    const acceptAckOnly = Boolean(opts.acceptAckOnly)
    return new Promise((resolve, reject) => {
      const frame = []
      let gotAck = false
      let collecting = false
      let ackSettleTimer = null
      const timer = setTimeout(() => {
        cleanup()
        if (frame.length) resolve({ ack: gotAck, nak: false, frame: Buffer.from(frame) })
        else if (gotAck && acceptAckOnly) resolve({ ack: true, nak: false, frame: Buffer.alloc(0) })
        else if (gotAck) reject(new Error('ack_only_timeout'))
        else reject(new Error('serial_response_timeout'))
      }, timeoutMs)

      function cleanup() {
        clearTimeout(timer)
        if (ackSettleTimer) clearTimeout(ackSettleTimer)
        if (state.port) state.port.removeListener('data', onData)
      }

      function onData(chunk) {
        for (const b of chunk) {
          if (!collecting) {
            if (b === ACK) {
              gotAck = true
              state.dbg('RX ACK')
              if (acceptAckOnly && !ackSettleTimer) {
                ackSettleTimer = setTimeout(() => {
                  if (!collecting && frame.length === 0) {
                    cleanup()
                    resolve({ ack: true, nak: false, frame: Buffer.alloc(0) })
                  }
                }, 450)
              }
              continue
            }
            if (b === NAK) {
              cleanup()
              reject(new Error('edc_nak'))
              return
            }
            if (b !== STX) continue
            collecting = true
            if (ackSettleTimer) { clearTimeout(ackSettleTimer); ackSettleTimer = null }
            frame.push(b)
            continue
          }
          frame.push(b)
          if (frame.length >= 5 && frame[frame.length - 2] === ETX) {
            cleanup()
            resolve({ ack: gotAck, nak: false, frame: Buffer.from(frame) })
            return
          }
        }
      }

      if (!state.port) { clearTimeout(timer); reject(new Error('serial_not_open')); return }
      state.port.on('data', onData)
    })
  }

  function enqueue(job) {
    return new Promise((resolve, reject) => {
      state.queue.push({ job, resolve, reject })
      processQueue()
    })
  }

  async function processQueue() {
    if (state.busy || state.queue.length === 0) return
    state.busy = true
    const { job, resolve, reject } = state.queue.shift()
    try {
      resolve(await job())
    } catch (e) {
      reject(e)
    } finally {
      state.busy = false
      processQueue()
    }
  }

  async function sendFrameAndWait(frame, timeoutMs, opts = {}) {
    state.dbg('TX →', frame.toString('hex').toUpperCase())
    if (!state.SerialPort) {
      return {
        ack: true,
        responseHex: buildFrame({
          txCode: '20',
          reqRes: '1',
          responseCode: '00',
          more: '0',
        }).toString('hex').toUpperCase(),
      }
    }
    if (!state.portReady || !state.port) throw new Error('serial_not_ready')
    if (typeof state.port.flush === 'function') {
      await new Promise((resolve) => state.port.flush(() => resolve()))
    }
    await new Promise((resolve, reject) => {
      state.port.write(frame, (err) => (err ? reject(err) : resolve()))
    })
    await new Promise((resolve, reject) => {
      state.port.drain((err) => (err ? reject(err) : resolve()))
    })
    const rx = await readEdcResponse(timeoutMs, opts)
    const responseHex = rx.frame && rx.frame.length ? rx.frame.toString('hex').toUpperCase() : ''
    state.dbg('RX ←', responseHex || '(ack-only)', 'ack=', rx.ack)
    return { ack: rx.ack, responseHex }
  }

  async function sendTxAndParse(txCode, frame, timeoutMs) {
    try {
      const result = await enqueue(() => sendFrameAndWait(frame, timeoutMs))
      const parsed = parseFrame(Buffer.from(result.responseHex, 'hex'))
      const approved = String(parsed.responseCode || '').trim() === '00'
      return {
        success: approved,
        ack: result.ack,
        payment: {
          txCode,
          responseCode: parsed.responseCode,
          responseText: parsed.fields['02'] || '',
          approvalCode: parsed.fields['01'] || '',
          traceNo: parsed.fields['65'] || '',
          refNo: parsed.fields['D3'] || '',
          terminalId: parsed.fields['16'] || '',
          merchantId: parsed.fields['D1'] || '',
        },
        rawResponseHex: result.responseHex,
      }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  function optionalBankField(bankId) {
    const id = String(bankId || '').trim()
    if (!id) return []
    return [{ type: 'J6', data: id.slice(0, 3) }]
  }

  async function handleTransaction(json) {
    const action = String(json.action || '').toLowerCase()
    const timeoutMs = Math.min(
      Math.max(Number(json.timeoutMs) || state.cfg.responseTimeoutMs, 3000),
      180000
    )

    if (action === 'sale') {
      const fields = [
        { type: '40', data: normalizeAmount12(json.amount) },
        ...optionalBankField(json.bankId),
      ]
      const ref1 = sanitizeHypercomText(json.reference1)
      const ref2 = sanitizeHypercomText(json.reference2)
      if (ref1) fields.splice(1, 0, { type: 'R1', data: ref1 })
      if (ref2) fields.push({ type: 'R2', data: ref2 })
      return await sendTxAndParse('20', buildFrame({ txCode: '20', more: '1', fields }), timeoutMs)
    }

    if (action === 'void') {
      const trace = String(json.traceNo || json.invoiceNumber || '').replace(/\D/g, '').padStart(6, '0').slice(-6)
      if (!/^\d{6}$/.test(trace) || trace === '000000') {
        return { success: false, error: 'void_requires_trace_no' }
      }
      const frame = buildFrame({
        txCode: '26',
        more: '1',
        fields: [
          { type: '65', data: trace },
          ...optionalBankField(json.bankId),
        ],
      })
      return await sendTxAndParse('26', frame, timeoutMs)
    }

    if (action === 'settlement') {
      const fields = []
      const nii = String(json.nii || '').trim()
      if (nii) fields.push({ type: 'HN', data: nii.slice(0, 3) })
      fields.push(...optionalBankField(json.bankId))
      return await sendTxAndParse('50', buildFrame({ txCode: '50', more: '1', fields }), timeoutMs)
    }

    if (action === 'd0' || action === 'test') {
      return await sendTxAndParse('D0', buildFrame({ txCode: 'D0', reqRes: '1' }), Math.min(timeoutMs, 10000))
    }

    if (action === 'qr') {
      return await sendTxAndParse('70', buildNativeQrRequestFrame(json), timeoutMs)
    }

    if (action === 'display_qr' || action === 'display_qr_payload') {
      const qr = String(json.qrPayload || '').trim()
      if (!qr) return { success: false, error: 'qr_payload_required' }
      // KBank API QR 문자열을 단말에 표시 (펌웨어별 필드 지원이 다를 수 있어 순차 시도)
      const amountField = Number(json.amount) > 0
        ? [{ type: '40', data: normalizeAmount12(json.amount) }]
        : []
      // tx70 은 Native QR 결제(40→A1→R1→R2→J6). KBank API 문자열 표시는 71만 시도.
      const attempts = [
        { txCode: '71', fields: [{ type: 'QR', data: qr.slice(0, 900) }, ...amountField] },
        { txCode: '71', fields: [{ type: 'Q1', data: qr.slice(0, 900) }, ...amountField] },
      ]
      let lastErr = 'display_qr_failed'
      for (const attempt of attempts) {
        try {
          const frame = buildFrame({ txCode: attempt.txCode, more: '1', fields: attempt.fields })
          const result = await enqueue(() =>
            sendFrameAndWait(frame, Math.min(timeoutMs, 12000), { acceptAckOnly: true })
          )
          if (result.ack || result.responseHex) {
            return { success: true, ack: result.ack, message: 'display_sent' }
          }
        } catch (e) {
          lastErr = e.message || String(e)
          if (lastErr === 'edc_nak' || lastErr === 'ack_only_timeout') {
            if (lastErr === 'ack_only_timeout') return { success: true, ack: true, message: 'display_ack' }
            continue
          }
        }
      }
      return { success: false, error: lastErr }
    }

    if (action === 'clear_qr') {
      try {
        const frame = buildFrame({ txCode: 'CQ', reqRes: '1', more: '0', fields: [] })
        const result = await enqueue(() => sendFrameAndWait(frame, Math.min(timeoutMs, 8000)))
        return { success: true, ack: result.ack, message: 'clear_qr_sent' }
      } catch (e) {
        return { success: false, error: e.message }
      }
    }

    return { success: false, error: `unknown_action: ${action}` }
  }

  state.openSerial = openSerial
  state.handleTransaction = handleTransaction
  state.enqueue = enqueue
  state.sendFrameAndWait = sendFrameAndWait
  return state
}

function getStatus() {
  if (!runtime) {
    return { running: false, serialReady: false, mock: true, httpPort: null, serialPort: null }
  }
  return {
    running: Boolean(runtime.server),
    serialReady: runtime.portReady,
    mock: !runtime.SerialPort,
    httpPort: runtime.cfg.httpPort,
    serialPort: runtime.cfg.serial.path,
    baudRate: runtime.cfg.serial.baudRate,
  }
}

/**
 * @param {object} [options]
 * @param {number} [options.httpPort]
 * @param {object} [options.serial]
 * @param {number} [options.responseTimeoutMs]
 * @param {boolean} [options.verbose]
 * @param {string} [options.configPath] optional JSON config file
 * @returns {Promise<{ ok: boolean, status: object, error?: string }>}
 */
function startLinkposBridge(options = {}) {
  return new Promise((resolve) => {
    try {
      selfTestProtocol()
    } catch (e) {
      resolve({ ok: false, status: getStatus(), error: `selftest_failed: ${e.message}` })
      return
    }

    if (runtime && runtime.server) {
      resolve({ ok: true, status: getStatus(), error: 'already_running' })
      return
    }

    const fromFile = loadConfigFile(options.configPath)
    const state = createRuntime(mergeConfig(fromFile || {}, options))
    runtime = state

    state.openSerial()

    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          ok: true,
          serialPort: state.cfg.serial.path,
          serialReady: state.portReady,
          mock: !state.SerialPort,
          protocol: 'linkpos_v1.6_tester_aligned',
          embedded: true,
        }))
        return
      }

      if (req.method === 'POST' && req.url === '/linkpos/transaction') {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', async () => {
          try {
            const json = JSON.parse(body || '{}')
            const result = await state.handleTransaction(json)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(result))
          } catch (e) {
            state.log('ERROR', e.message)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: e.message }))
          }
        })
        return
      }

      if (req.method === 'POST' && req.url === '/linkpos/send') {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', async () => {
          try {
            const json = JSON.parse(body || '{}')
            const payloadHex = String(json.payloadHex || '').trim()
            if (!payloadHex) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: 'missing_payloadHex' }))
              return
            }
            const timeoutMs = Math.min(
              Math.max(Number(json.timeoutMs) || state.cfg.responseTimeoutMs, 3000),
              180000
            )
            const frame = Buffer.from(payloadHex, 'hex')
            const result = await state.enqueue(() => state.sendFrameAndWait(frame, timeoutMs))
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true, responseHex: result.responseHex, ack: result.ack }))
          } catch (e) {
            state.log('ERROR', e.message)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: e.message }))
          }
        })
        return
      }

      if (req.method === 'GET' && req.url === '/ports') {
        ;(async () => {
          try {
            if (!state.SerialPort) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ports: [], mock: true }))
              return
            }
            const ports = await state.SerialPort.list()
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ports }))
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: e.message }))
          }
        })()
        return
      }

      res.writeHead(404)
      res.end('Not Found')
    })

    state.server = server
    server.once('error', (err) => {
      state.log('listen error:', err.message)
      resolve({ ok: false, status: getStatus(), error: err.message })
    })
    server.listen(state.cfg.httpPort, '127.0.0.1', () => {
      state.log(`listening on http://127.0.0.1:${state.cfg.httpPort}`)
      state.log(`serial: ${state.cfg.serial.path} @ ${state.cfg.serial.baudRate}`)
      resolve({ ok: true, status: getStatus() })
    })
  })
}

function stopLinkposBridge() {
  return new Promise((resolve) => {
    if (!runtime) {
      resolve({ ok: true })
      return
    }
    const state = runtime
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer)
      state.reconnectTimer = null
    }
    const finish = () => {
      try {
        if (state.port && state.port.isOpen) state.port.close()
      } catch { /* ignore */ }
      runtime = null
      resolve({ ok: true })
    }
    if (state.server) {
      state.server.close(() => finish())
      setTimeout(finish, 1500)
    } else {
      finish()
    }
  })
}

/** Electron IPC — HTTP/혼합콘텐츠 없이 동일 런타임 트랜잭션 */
function runLinkposTransaction(json) {
  if (!runtime || typeof runtime.handleTransaction !== 'function') {
    return Promise.resolve({ success: false, error: 'bridge_not_running' })
  }
  return runtime.handleTransaction(json || {})
}

module.exports = {
  startLinkposBridge,
  stopLinkposBridge,
  getStatus,
  runLinkposTransaction,
  buildFrame,
  parseFrame,
  selfTestProtocol,
  defaultConfig,
  sanitizeHypercomText,
  buildNativeQrFields,
  buildNativeQrRequestFrame,
  HYPERCOM_REF_MAX_LEN,
  THAI_QR_PAYMENT_INDICATOR,
  DEFAULT_KASIKORN_BANK_ID,
  NATIVE_QR_FIELD_ORDER,
}

if (require.main === module) {
  const cfgPath = path.join(__dirname, 'config.json')
  const standaloneCfg = path.join(__dirname, '..', '..', 'linkpos-bridge', 'config.json')
  const configPath = fs.existsSync(cfgPath) ? cfgPath : (fs.existsSync(standaloneCfg) ? standaloneCfg : null)
  startLinkposBridge({
    verbose: process.argv.includes('--verbose'),
    configPath,
  }).then((r) => {
    if (!r.ok) {
      console.error('[linkpos] start failed:', r.error)
      process.exit(1)
    }
  })
}
