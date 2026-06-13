import { NextRequest, NextResponse } from 'next/server'
import { assertTenantInScope, requireSaasControlPlane } from '@/lib/saas-control-plane-scope'
import {
  listAllTenantIntegrationsForAdmin,
  loadTenantIntegrationRaw,
  maskIntegrationConfigForAdmin,
  mergeIntegrationConfigSecrets,
  saveTenantIntegration,
  saveTenantStoreIntegration,
} from '@/lib/tenant-integration-store'
import type { IntegrationProvider } from '@/lib/tenant-integration-types'

export const dynamic = 'force-dynamic'

function normalizeProvider(raw: unknown): IntegrationProvider | null {
  const v = String(raw || '').trim().toLowerCase()
  if (v === 'kbank' || v === 'grab') return v
  return null
}

function readConfigRecord(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  return {}
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse

  const tenantId = String(req.nextUrl.searchParams.get('tenantId') || '').trim()
  if (!tenantId) {
    return NextResponse.json({ success: false, message: 'tenantId가 필요합니다.' }, { status: 400, headers })
  }

  const inScope = await assertTenantInScope(cp.scope, tenantId)
  if (!inScope) {
    return NextResponse.json({ success: false, message: '해당 고객사에 접근할 수 없습니다.' }, { status: 403, headers })
  }

  try {
    const data = await listAllTenantIntegrationsForAdmin(tenantId)
    return NextResponse.json({
      success: true,
      tenantId,
      tenantIntegrations: data.tenant.map((row) => ({
        ...row,
        config: maskIntegrationConfigForAdmin(row.provider, readConfigRecord(row.config)),
      })),
      storeIntegrations: data.stores.map((row) => ({
        ...row,
        config: row.config,
      })),
    }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg }, { status: 500, headers })
  }
}

type SaveBody = {
  level?: 'tenant' | 'store'
  tenantId?: string
  storeCode?: string
  provider?: IntegrationProvider
  isEnabled?: boolean
  config?: Record<string, unknown>
  notes?: string
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse

  try {
    const body = (await req.json()) as SaveBody
    const tenantId = String(body.tenantId || '').trim()
    const provider = normalizeProvider(body.provider)
    const level = body.level === 'store' ? 'store' : 'tenant'
    if (!tenantId || !provider) {
      return NextResponse.json({ success: false, message: 'tenantId/provider가 필요합니다.' }, { status: 400, headers })
    }

    const inScope = await assertTenantInScope(cp.scope, tenantId)
    if (!inScope) {
      return NextResponse.json({ success: false, message: '해당 고객사에 접근할 수 없습니다.' }, { status: 403, headers })
    }

    const incoming = readConfigRecord(body.config)
    const isEnabled = body.isEnabled !== false

    if (level === 'tenant') {
      const existingRow = await loadTenantIntegrationRaw(tenantId, provider)
      const existing = readConfigRecord(existingRow?.config)
      const merged = mergeIntegrationConfigSecrets(provider, incoming, existing)
      await saveTenantIntegration({
        tenantId,
        provider,
        isEnabled,
        config: merged,
        notes: body.notes,
      })
    } else {
      const storeCode = String(body.storeCode || '').trim()
      if (!storeCode) {
        return NextResponse.json({ success: false, message: 'storeCode가 필요합니다.' }, { status: 400, headers })
      }
      const { listTenantStoreIntegrations } = await import('@/lib/tenant-integration-store')
      const existingRows = await listTenantStoreIntegrations(tenantId, provider)
      const existingRow = existingRows.find((r) => r.storeCode === storeCode)
      const existing = readConfigRecord(existingRow?.config)
      const merged = { ...existing, ...incoming }
      await saveTenantStoreIntegration({
        tenantId,
        storeCode,
        provider,
        isEnabled,
        config: merged,
        notes: body.notes,
      })
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ success: false, message: msg }, { status: 500, headers })
  }
}
