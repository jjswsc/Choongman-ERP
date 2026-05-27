import { NextRequest } from 'next/server'
import {
  GET as kbankWebhookGet,
  OPTIONS as kbankWebhookOptions,
  POST as kbankWebhookPost,
} from '@/app/api/webhooks/kbank/[...path]/route'

const CALLBACK_PATH = ['qr', 'payment-callback']

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return kbankWebhookOptions()
}

export async function GET(req: NextRequest) {
  return kbankWebhookGet(req, { params: Promise.resolve({ path: CALLBACK_PATH }) })
}

export async function POST(req: NextRequest) {
  return kbankWebhookPost(req, { params: Promise.resolve({ path: CALLBACK_PATH }) })
}
