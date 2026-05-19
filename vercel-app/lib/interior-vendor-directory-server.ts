import { supabaseRpc } from '@/lib/supabase-server'

/** 프로젝트 업체·계약 저장 시 마스터 목록에 자동 반영 */
export async function touchInteriorVendorDirectoryFromTrack(params: {
  vendorName: string
  vendorCode?: string | null
}): Promise<number | null> {
  const name = String(params.vendorName || '').trim()
  if (!name) return null
  const code = String(params.vendorCode || '').trim() || null
  try {
    const id = await supabaseRpc<number | null>('upsert_interior_vendor_directory', {
      p_name: name,
      p_code: code,
    })
    if (id == null || Number.isNaN(Number(id))) return null
    return Number(id)
  } catch (e) {
    console.warn('touchInteriorVendorDirectoryFromTrack:', e)
    return null
  }
}
