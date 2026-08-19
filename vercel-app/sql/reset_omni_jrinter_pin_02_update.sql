-- 2/2 회사 jrinter + 비밀번호 1234 (bcrypt 60자)
-- ⚠️ Omni Supabase에서만 실행. 충만 DB 금지.
-- 결과가 1행으로 보여야 함. 0행이면 계정이 없는 것.

UPDATE public.employees
SET
  company = 'jrinter',
  password = '$2b$10$zTR.QTx0cjfGRugqs2pFG.sBPyYlGebxu99wAgIVFQy4Qi8GG95na',
  role = 'Manager',
  job = 'manager'
WHERE trim(store) = 'Partner'
  AND trim(name) = 'admin'
RETURNING id, company, store, name, role, length(password) AS pw_len;
