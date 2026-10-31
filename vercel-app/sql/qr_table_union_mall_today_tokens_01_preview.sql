-- Preview: Union Mall table QR tokens vs today's active sessions
-- token_id on sessions is often null (staff open without token body) — guests still claim via /t/{token} + table_name match.

SELECT
  t.id AS token_id,
  t.table_name AS token_table,
  t.active,
  left(t.token, 8) AS token_prefix,
  t.rotated_at,
  t.updated_at,
  s.id AS active_session_id,
  s.status AS session_status,
  s.entry_paid,
  s.created_at AS session_opened_at
FROM public.pos_table_qr_tokens t
LEFT JOIN LATERAL (
  SELECT s2.id, s2.status, s2.entry_paid, s2.created_at
  FROM public.pos_qr_table_sessions s2
  WHERE lower(trim(s2.store_code)) = 'cm union mall'
    AND s2.status IN ('awaiting_entry', 'active')
    AND (
      trim(s2.table_name) = trim(t.table_name)
      OR regexp_replace(trim(s2.table_name), '\s*번\s*$', '', 'g')
         = regexp_replace(trim(t.table_name), '\s*번\s*$', '', 'g')
    )
  ORDER BY s2.id DESC
  LIMIT 1
) s ON true
WHERE lower(trim(t.store_code)) = 'cm union mall'
ORDER BY t.active DESC, t.table_name;
