-- OmniFoodTech 플랫폼 관리자 로그인 진단·복구
-- ⚠️ Omni Supabase에서만 실행. 충만 DB 금지.
--
-- 원인: saas_tenant_bootstrap 시드가 password='1234' 평문으로 넣을 수 있음.
--       Omni loginCheck는 평문 저장 계정을 거부함(Login Failed).

-- 1) 계정 확인 (password는 앞 4글자만)
SELECT
  id,
  company,
  store,
  name,
  role,
  job,
  left(coalesce(password, ''), 4) AS pw_prefix,
  length(coalesce(password, '')) AS pw_len,
  CASE
    WHEN coalesce(password, '') LIKE '$2a$%' OR coalesce(password, '') LIKE '$2b$%'
      THEN 'hashed'
    ELSE 'plaintext_or_empty'
  END AS pw_kind,
  resign_date
FROM public.employees
WHERE lower(trim(coalesce(company, ''))) = 'omnifoodtech'
ORDER BY id;

-- 2) 평문이면 bcrypt로 교체 (비번 1234)
--    아래 해시는 bcryptjs cost=10 으로 '1234'를 해시한 값입니다.
UPDATE public.employees
SET password = '$2b$10$pTOZEBMGirq4G1Qs40r2z.9i.flpbN30yUDs7/yd4rVslesSMcKsO'
WHERE lower(trim(coalesce(company, ''))) = 'omnifoodtech'
  AND trim(coalesce(name, '')) = 'admin'
  AND trim(coalesce(store, '')) IN ('HQ', '본사')
  AND (
    password IS NULL
    OR trim(password) = ''
    OR (
      password NOT LIKE '$2a$%'
      AND password NOT LIKE '$2b$%'
    )
  );

-- 3) 재확인 — pw_head 가 $2b$10$ 이면 해시 적용됨
SELECT id, company, store, name, role,
       left(password, 7) AS pw_head,
       length(password) AS pw_len
FROM public.employees
WHERE lower(trim(coalesce(company, ''))) = 'omnifoodtech'
  AND trim(coalesce(name, '')) = 'admin';
