/**
 * Local cash-drawer bridge for POS PCs.
 *
 * Run (Windows PowerShell):
 *   $env:DRAWER_OPEN_COMMAND="C:\POS\open-drawer.bat"
 *   node scripts/local-cash-drawer-bridge.mjs
 *
 * Optional env:
 * - POS_DRAWER_BRIDGE_PORT (default: 18181)
 * - POS_BRIDGE_TOKEN (if set, require x-pos-bridge-token header)
 * - DRAWER_OPEN_COMMAND (required unless DRAWER_DRY_RUN=1)
 * - DRAWER_DRY_RUN=1 (always return success for testing)
 */

import http from 'node:http'
import { exec } from 'node:child_process'

const HOST = '127.0.0.1'
const PORT = Number(process.env.POS_DRAWER_BRIDGE_PORT || 18181)
const TOKEN = String(process.env.POS_BRIDGE_TOKEN || '').trim()
const DRY_RUN = String(process.env.DRAWER_DRY_RUN || '').trim() === '1'
const OPEN_COMMAND = String(process.env.DRAWER_OPEN_COMMAND || '').trim()

const ALLOWED_PATHS = new Set(['/pos/cash-drawer/open', '/open-cash-drawer'])

function sendJson(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type,x-pos-bridge-token',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
  })
  res.end(JSON.stringify(body))
}

function parseBody(req, maxBytes = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      size += Buffer.byteLength(chunk, 'utf8')
      if (size > maxBytes) {
        reject(new Error('body_too_large'))
        req.destroy()
        return
      }
      raw += chunk
    })
    req.on('end', () => {
      if (!raw.trim()) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('invalid_json'))
      }
    })
    req.on('error', reject)
  })
}

function runOpenCommand() {
  return new Promise((resolve) => {
    if (DRY_RUN) {
      resolve({ ok: true, dryRun: true })
      return
    }
    if (!OPEN_COMMAND) {
      resolve({ ok: false, error: 'DRAWER_OPEN_COMMAND not configured' })
      return
    }
    exec(OPEN_COMMAND, { timeout: 5000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          ok: false,
          error: String(error.message || error),
          stderr: String(stderr || '').trim(),
        })
        return
      }
      resolve({
        ok: true,
        stdout: String(stdout || '').trim(),
      })
    })
  })
}

const server = http.createServer(async (req, res) => {
  const method = String(req.method || 'GET').toUpperCase()
  const path = String((req.url || '/').split('?')[0] || '/')

  if (method === 'OPTIONS') {
    sendJson(res, 200, { success: true })
    return
  }
  if (method !== 'POST' || !ALLOWED_PATHS.has(path)) {
    sendJson(res, 404, { success: false, message: 'not_found' })
    return
  }

  if (TOKEN) {
    const provided = String(req.headers['x-pos-bridge-token'] || '').trim()
    if (provided !== TOKEN) {
      sendJson(res, 401, { success: false, message: 'unauthorized' })
      return
    }
  }

  try {
    const body = await parseBody(req)
    const reason = String(body?.reason || '').trim() || 'drawer_open'
    const source = String(body?.source || '').trim() || 'unknown'
    const storeCode = String(body?.storeCode || '').trim()
    const userName = String(body?.userName || '').trim()
    const option = String(body?.drawerOpenOption || '').trim() || 'reason_only'

    const opened = await runOpenCommand()
    if (!opened.ok) {
      sendJson(res, 500, {
        success: false,
        message: 'drawer_open_failed',
        error: opened.error || 'unknown_error',
      })
      return
    }

    sendJson(res, 200, {
      success: true,
      reason,
      source,
      storeCode,
      userName,
      drawerOpenOption: option,
      dryRun: Boolean(opened.dryRun),
      at: new Date().toISOString(),
    })
  } catch (e) {
    sendJson(res, 400, {
      success: false,
      message: 'bad_request',
      error: String(e),
    })
  }
})

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[pos-drawer-bridge] listening on http://${HOST}:${PORT}`)
  if (DRY_RUN) {
    // eslint-disable-next-line no-console
    console.log('[pos-drawer-bridge] DRAWER_DRY_RUN=1 (no hardware command)')
  } else if (!OPEN_COMMAND) {
    // eslint-disable-next-line no-console
    console.warn('[pos-drawer-bridge] WARNING: DRAWER_OPEN_COMMAND is empty')
  }
})
