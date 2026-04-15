import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/verify-auth"
import { supabaseInsert, supabaseSelect, supabaseSelectFilter, supabaseUpdate } from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

type ProductRow = {
  id?: number | string
  slug?: string | null
  title?: string | null
  subtitle?: string | null
  summary?: string | null
  description?: string | null
  price_label?: string | null
  cover_image_url?: string | null
  gallery_urls?: unknown
  feature_bullets?: unknown
  cta_label?: string | null
  cta_url?: string | null
  is_active?: boolean | null
  sort_order?: number | null
  created_at?: string | null
  updated_at?: string | null
}

function noStoreHeaders(h: Headers) {
  h.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  h.set("Pragma", "no-cache")
}

function cleanText(v: unknown): string {
  return String(v ?? "").trim()
}

function cleanOptionalText(v: unknown): string | null {
  const x = cleanText(v)
  return x ? x : null
}

function toSafeArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => cleanText(x)).filter(Boolean)
  }
  if (typeof v === "string") {
    return v
      .split(/\r?\n|,/g)
      .map((x) => x.trim())
      .filter(Boolean)
  }
  return []
}

function toSortOrder(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(-9999, Math.min(9999, Math.floor(n)))
}

function toProductResponse(row: ProductRow) {
  return {
    id: String(row.id ?? ""),
    slug: cleanText(row.slug),
    title: cleanText(row.title),
    subtitle: cleanText(row.subtitle),
    summary: cleanText(row.summary),
    description: cleanText(row.description),
    priceLabel: cleanText(row.price_label),
    coverImageUrl: cleanText(row.cover_image_url),
    galleryUrls: toSafeArray(row.gallery_urls),
    featureBullets: toSafeArray(row.feature_bullets),
    ctaLabel: cleanText(row.cta_label),
    ctaUrl: cleanText(row.cta_url),
    isActive: row.is_active !== false,
    sortOrder: Number(row.sort_order ?? 0) || 0,
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  }
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  noStoreHeaders(headers)

  try {
    const { searchParams } = new URL(req.url)
    const adminView = searchParams.get("admin") === "1"
    const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)))

    const rows = (await supabaseSelect("product_catalog_items", {
      order: "sort_order.asc,updated_at.desc,id.desc",
      limit,
    })) as ProductRow[]
    const mapped = Array.isArray(rows) ? rows.map(toProductResponse) : []
    const list = adminView ? mapped : mapped.filter((x) => x.isActive)
    return NextResponse.json({ success: true, items: list }, { headers })
  } catch (e) {
    console.error("productCatalog GET:", e)
    return NextResponse.json(
      {
        success: false,
        message:
          "상품 카탈로그 테이블이 아직 없을 수 있습니다. SQL Editor에서 vercel-app/sql/product_catalog.sql 을 실행하세요.",
        items: [],
      },
      { status: 500, headers }
    )
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  noStoreHeaders(headers)

  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse

  try {
    const body = (await req.json()) as {
      id?: string | number
      slug?: string
      title?: string
      subtitle?: string
      summary?: string
      description?: string
      priceLabel?: string
      coverImageUrl?: string
      galleryUrls?: string[] | string
      featureBullets?: string[] | string
      ctaLabel?: string
      ctaUrl?: string
      isActive?: boolean
      sortOrder?: number
    }

    const id = cleanText(body.id)
    const slug = cleanText(body.slug).toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-")
    const title = cleanText(body.title)
    if (!title) {
      return NextResponse.json({ success: false, message: "상품명은 필수입니다." }, { status: 400, headers })
    }

    const payload = {
      slug: slug || null,
      title,
      subtitle: cleanOptionalText(body.subtitle),
      summary: cleanOptionalText(body.summary),
      description: cleanOptionalText(body.description),
      price_label: cleanOptionalText(body.priceLabel),
      cover_image_url: cleanOptionalText(body.coverImageUrl),
      gallery_urls: toSafeArray(body.galleryUrls),
      feature_bullets: toSafeArray(body.featureBullets),
      cta_label: cleanOptionalText(body.ctaLabel),
      cta_url: cleanOptionalText(body.ctaUrl),
      is_active: body.isActive !== false,
      sort_order: toSortOrder(body.sortOrder),
      updated_by: cleanText(authResult.auth.name || "unknown"),
      updated_at: new Date().toISOString(),
    }

    if (id) {
      await supabaseUpdate("product_catalog_items", id, payload)
      const rows = (await supabaseSelectFilter(
        "product_catalog_items",
        `id=eq.${encodeURIComponent(id)}`,
        { limit: 1 }
      )) as ProductRow[]
      return NextResponse.json(
        {
          success: true,
          message: "수정되었습니다.",
          item: rows?.[0] ? toProductResponse(rows[0]) : null,
        },
        { headers }
      )
    }

    const created = (await supabaseInsert("product_catalog_items", {
      ...payload,
      created_by: cleanText(authResult.auth.name || "unknown"),
      created_at: new Date().toISOString(),
    })) as ProductRow[]
    const first = Array.isArray(created) ? created[0] : null
    return NextResponse.json(
      {
        success: true,
        message: "등록되었습니다.",
        item: first ? toProductResponse(first) : null,
      },
      { headers }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("productCatalog POST:", msg)
    return NextResponse.json({ success: false, message: "저장 실패: " + msg }, { status: 500, headers })
  }
}

