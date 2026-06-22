export type MemberPortalOrderItemRow = {
  menuId: string
  optionId?: string
  optionCode?: string
  code?: string
  name: string
  price: number
  qty: number
}

export function parseMemberPortalOrderItemsJson(itemsJson: string | null | undefined): MemberPortalOrderItemRow[] {
  try {
    const parsed = JSON.parse(String(itemsJson || '[]')) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((it) => {
        const row = it as Record<string, unknown>
        const menuId = String(
          row.menuId ?? row.menu_id ?? row.menuId1 ?? row.menu_id1 ?? ''
        ).trim()
        const name = String(row.name ?? '').trim()
        const qty = Math.max(
          1,
          Math.trunc(Number(row.qty ?? row.quantity ?? row.count ?? 1))
        )
        const price = Math.max(0, Number(row.price || 0))
        if (!menuId && !name) return null
        const optionId = String(
          row.optionId ?? row.option_id ?? row.optionId1 ?? row.option_id1 ?? ''
        ).trim()
        const optionCode = String(
          row.optionCode ?? row.option_code ?? row.optionCode1 ?? row.option_code1 ?? ''
        ).trim()
        const code = row.code != null ? String(row.code) : undefined
        return {
          menuId: menuId || name,
          ...(optionId ? { optionId } : {}),
          ...(optionCode ? { optionCode } : {}),
          ...(code ? { code } : {}),
          name,
          price,
          qty,
        }
      })
      .filter(Boolean) as MemberPortalOrderItemRow[]
  } catch {
    return []
  }
}
