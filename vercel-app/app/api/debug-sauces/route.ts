import { NextRequest, NextResponse } from 'next/server'
import { supabaseCountTable, supabaseSelect } from '@/lib/supabase-server'
import { guardDebugDiagnosticsRoute } from '@/lib/debug-diagnostics-guard'

type TableDiag = {
  ok: boolean
  count?: number
  sample?: unknown[]
  error?: string
}

async function readTable(table: string, select: string): Promise<TableDiag> {
  try {
    const [count, sampleRows] = await Promise.all([
      supabaseCountTable(table),
      supabaseSelect(table, { limit: 5, order: 'id.asc', select }),
    ])
    return {
      ok: true,
      count,
      sample: Array.isArray(sampleRows) ? sampleRows : [],
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export async function GET(req: NextRequest) {
  const denied = await guardDebugDiagnosticsRoute(req)
  if (denied) return denied

  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim()
  const url = (process.env.SUPABASE_URL || '').trim()

  let urlHost: string | null = null
  try {
    if (url) urlHost = new URL(url.replace(/^http:\/\//, 'https://')).hostname
  } catch {
    urlHost = null
  }

  const [sauces, sauceIngredients, items] = await Promise.all([
    readTable('sauces', 'id,code,name,unit,cost_per_unit,usage_kind,linked_item_code'),
    readTable('sauce_ingredients', 'id,sauce_id,item_code,quantity,loss_rate'),
    readTable('items', 'id,code,name,unit,price,total_quantity'),
  ])

  return NextResponse.json({
    env: {
      supabaseUrlHost: urlHost,
      usingServiceRole: serviceKey.length > 0,
      hasAnonKey: anonKey.length > 0,
      serviceKeyLength: serviceKey.length,
      anonKeyLength: anonKey.length,
    },
    tables: {
      sauces,
      sauce_ingredients: sauceIngredients,
      items,
    },
  })
}

