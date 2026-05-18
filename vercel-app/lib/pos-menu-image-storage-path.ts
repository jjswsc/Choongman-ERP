/**
 * POS 메뉴 이미지 Storage 경로 규칙
 * - 업로드: `{ms}-{menuId}_{safeOriginal}`  예) 1774343948409-27_menu.jpg
 * - 복구 SQL·strict 매칭: 파일명의 숫자 id = pos_menus.id
 */

export function buildPosMenuImageStorageObjectName(
  menuId: number,
  originalFileName: string,
  nowMs: number = Date.now()
): string {
  const id = Math.floor(Number(menuId))
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error('POS_MENU_IMAGE_INVALID_MENU_ID')
  }
  const safe = String(originalFileName || 'img.jpg')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^[0-9]+-/, '')
  const suffix = safe.replace(new RegExp(`^${id}[_-]`), '') || 'img.jpg'
  return `${nowMs}-${id}_${suffix}`
}

/** URL 또는 Storage 객체명에서 메뉴 id 추출 (규칙에 맞을 때만) */
export function extractPosMenuIdFromStorageObjectName(objectNameOrUrl: string): number | null {
  const raw = String(objectNameOrUrl ?? '').trim()
  if (!raw) return null
  let segment = raw
  try {
    if (/^https?:\/\//i.test(raw)) {
      segment = new URL(raw).pathname.split('/').pop() || raw
    } else {
      segment = raw.split('/').pop() || raw
    }
  } catch {
    segment = raw.split('/').pop() || raw
  }
  const m = segment.match(/^[0-9]+-([0-9]+)(\.|_)/)
  if (!m) return null
  const id = Math.floor(Number(m[1]))
  return Number.isFinite(id) && id > 0 ? id : null
}

export function validatePosMenuImageUrlForMenu(
  imageUrl: string,
  menuId: number | string | null | undefined
): { ok: true } | { ok: false; message: string } {
  const url = String(imageUrl ?? '').trim()
  if (!url) return { ok: true }
  const mid = Math.floor(Number(menuId))
  if (!Number.isFinite(mid) || mid <= 0) return { ok: true }
  if (!/pos-menu-images/i.test(url)) return { ok: true }

  const fileMenuId = extractPosMenuIdFromStorageObjectName(url)
  if (fileMenuId == null) return { ok: true }

  if (fileMenuId !== mid) {
    return {
      ok: false,
      message: `이 메뉴(id ${mid})용 사진이 아닙니다. 파일은 메뉴 id ${fileMenuId}용으로 저장되어 있습니다. 이 메뉴에서 다시 업로드해 주세요.`,
    }
  }
  return { ok: true }
}
