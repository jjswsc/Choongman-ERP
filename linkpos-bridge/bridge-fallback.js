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

function parseFrame(buf) {
  if (!buf || buf.length === 0) throw new Error('empty_response')
  if (buf.length === 1 && buf[0] === ACK) return { type: 'ACK', txCode: '', responseCode: '', fields: {} }
  if (buf.length === 1 && buf[0] === NAK) return { type: 'NAK', txCode: '', responseCode: '', fields: {} }
  if (buf.length < 6 || buf[0] !== STX) throw new Error('invalid_frame')
  const etxIdx = buf.lastIndexOf(ETX)
  if (etxIdx < 0 || etxIdx >= buf.length - 1) throw new Error('no_etx')
  const expected = calcLrc(buf.slice(1, etxIdx + 1))
  if (expected !== buf[etxIdx + 1]) throw new Error('invalid_lrc')
  const body = buf.slice(3, etxIdx)
  if (body.length < 16) throw new Error('body_too_short')
  const txCode = body.slice(11, 13).toString('ascii')
  const responseCode = body.slice(13, 15).toString('ascii')
  const fsIdx = body.indexOf(FS, 0)
  const fieldsRaw = fsIdx >= 0 ? body.slice(fsIdx + 1) : Buffer.alloc(0)
  const fields = {}
  let i = 0
  while (i + 4 <= fieldsRaw.length) {
    if (fieldsRaw[i] === FS) { i += 1; continue }
    const type = fieldsRaw.slice(i, i + 2).toString('ascii')
    const hi = fieldsRaw[i + 2]
    const lo = fieldsRaw[i + 3]
    const len = (Math.floor(hi / 16) * 10 + (hi % 16)) * 100
      + Math.floor(lo / 16) * 10 + (lo % 16)
    i += 4
    fields[type] = fieldsRaw.slice(i, i + len).toString('ascii')
    i += len
    if (i < fieldsRaw.length && fieldsRaw[i] === FS) i += 1
  }
  return { type: 'Frame', txCode, responseCode, fields }
}

function normalizeAmount12(amount) {
  const cents = Math.round(Math.max(0, Number(amount)) * 100)
  return String(cents).padStart(12, '0')
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

  function readEdcResponse(timeoutMs) {
    return new Promise((resolve, reject) => {
      const frame = []
      let gotAck = false
      let collecting = false
      const timer = setTimeout(() => {
        cleanup()
        if (frame.length) resolve({ ack: gotAck, nak: false, frame: Buffer.from(frame) })
        else if (gotAck) reject(new Error('ack_only_timeout'))
        else reject(new Error('serial_response_timeout'))
      }, timeoutMs)

      function cleanup() {
        clearTimeout(timer)
        if (state.port) state.port.removeListener('data', onData)
      }

      function onData(chunk) {
        for (const b of chunk) {
          if (!collecting) {
            if (b === ACK) { gotAck = true; state.dbg('RX ACK'); continue }
            if (b === NAK) {
              cleanup()
              reject(new Error('edc_nak'))
              return
            }
            if (b !== STX) continue
            collecting = true
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

  async function sendFrameAndWait(frame, timeoutMs) {
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
    const rx = await readEdcResponse(timeoutMs)
    state.dbg('RX ←', rx.frame.toString('hex').toUpperCase(), 'ack=', rx.ack)
    return { ack: rx.ack, responseHex: rx.frame.toString('hex').toUpperCase() }
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
      const ref1 = String(json.reference1 || '').trim()
      const ref2 = String(json.reference2 || '').trim()
      if (ref1) fields.splice(1, 0, { type: 'R1', data: ref1.slice(0, 20) })
      if (ref2) fields.push({ type: 'R2', data: ref2.slice(0, 20) })
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
      const a1 = String(json.paymentIndicator || json.qrType || '03').slice(0, 2)
      const frame = buildFrame({
        txCode: '70',
        more: '1',
        fields: [
          { type: '40', data: normalizeAmount12(json.amount) },
          { type: 'A1', data: a1 },
          ...optionalBankField(json.bankId),
        ],
      })
      return await sendTxAndParse('70', frame, timeoutMs)
    }

    if (action === 'display_qr' || action === 'clear_qr') {
      return { success: false, message: `${action}_use_action_qr_or_cq` }
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

module.exports = {
  startLinkposBridge,
  stopLinkposBridge,
  getStatus,
  buildFrame,
  selfTestProtocol,
  defaultConfig,
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
