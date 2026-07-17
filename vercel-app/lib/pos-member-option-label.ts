export function buildPosMemberSearchOptionLabel(row: {
  name?: string
  memberNo?: string
  phone?: string
}): string {
  const name = String(row.name || '').trim()
  const memberNo = String(row.memberNo || '').trim()
  const phone = String(row.phone || '').trim()
  const base = `${name}${memberNo ? ` (${memberNo})` : ''}`
  return phone ? `${base} · ${phone}` : base
}
