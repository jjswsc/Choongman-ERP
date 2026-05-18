/** imageUrl 포함 여부·빈 문자열 처리 (서버 upsert 전용, server-only 없음) */

export type MenuImageUpsertInput = {
  imageUrl?: string
  imageOnly?: boolean
}

/**
 * 수정 시 imageUrl 이 빈 문자열로 오면 기존 DB image 를 지우지 않는다.
 * (옵션 구성·카테고리만 저장할 때 menus state 의 imageUrl 이 비어 있으면 대량 삭제됨)
 */
export function resolveMenuImageColumnForUpsert(
  body: MenuImageUpsertInput,
  opts: { isEdit: boolean }
): { includeInRow: boolean; image: string } {
  if (body.imageOnly === true) {
    return { includeInRow: true, image: String(body.imageUrl ?? '').trim() }
  }
  if (!('imageUrl' in body)) {
    return { includeInRow: false, image: '' }
  }
  const incoming = String(body.imageUrl ?? '').trim()
  if (!opts.isEdit) {
    return { includeInRow: true, image: incoming }
  }
  if (incoming) {
    return { includeInRow: true, image: incoming }
  }
  return { includeInRow: false, image: '' }
}
