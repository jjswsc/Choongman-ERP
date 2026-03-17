import { NextRequest, NextResponse } from 'next/server'
import { appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const candidates = [
      'C:/CM_ERP/debug-960801.log',
      'c:\\CM_ERP\\debug-960801.log',
      'c:\\CM_ERP\\.cursor\\debug-960801.log',
      resolve(process.cwd(), 'debug-960801.log'),
      resolve(process.cwd(), '..', 'debug-960801.log'),
    ]
    let lastError = ''
    for (const p of candidates) {
      try {
        await appendFile(p, `${JSON.stringify(body)}\n`, 'utf8')
        return NextResponse.json({ ok: true, path: p })
      } catch (e) {
        lastError = String(e)
      }
    }
    return NextResponse.json({ ok: false, error: lastError }, { status: 500 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

