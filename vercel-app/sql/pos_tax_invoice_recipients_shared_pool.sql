-- POS 세금계산서 수취인: 전 매장 공유 풀 (앱은 store_code = '__shared__' 로 저장·조회)
-- Supabase SQL Editor에서 한 번 실행. 기존 매장별 행은 병합 후 비활성화합니다.

-- 1) 동일 tax_id + branch_no + 활성 중복 시 최신 1건만 남기고 나머지 비활성
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY tax_id, branch_no
      ORDER BY last_used_at DESC NULLS LAST, updated_at DESC, created_at DESC
    ) AS rn
  FROM public.pos_tax_invoice_recipients
  WHERE is_active = true
)
UPDATE public.pos_tax_invoice_recipients p
SET is_active = false, updated_at = now()
FROM ranked r
WHERE p.id = r.id AND r.rn > 1;

-- 2) 전부 공유 풀 코드로 통일
UPDATE public.pos_tax_invoice_recipients
SET store_code = '__shared__', updated_at = now()
WHERE store_code IS DISTINCT FROM '__shared__';

-- 3) 조회용 인덱스 (선택)
CREATE INDEX IF NOT EXISTS idx_ptir_tax_branch_active
  ON public.pos_tax_invoice_recipients (tax_id, branch_no)
  WHERE is_active = true;

COMMENT ON COLUMN public.pos_tax_invoice_recipients.store_code IS 'POS 세금계산서 수취인: 전 매장 공유 시 __shared__';
