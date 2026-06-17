-- 발주(PO) 미지급금 일괄 삭제 (1회성 정리)
-- 정책: 매입채무는 입고(Inbound) 확정 시에만 payable_transactions에 반영한다.
--        발주 승인 시 ref_type='PO' 행은 더 이상 생성하지 않으며, 레거시 행을 제거한다.
--
-- Supabase SQL Editor에서 실행. 실행 전 아래 SELECT로 건수·합계를 확인하세요.

-- 1) 삭제 대상 미리보기
SELECT
  COUNT(*)::bigint AS po_row_count,
  COALESCE(SUM(amount), 0)::numeric AS po_amount_sum
FROM public.payable_transactions
WHERE ref_type = 'PO';

-- 2) 삭제 (확인 후 이 블록만 실행)
-- DELETE FROM public.payable_transactions
-- WHERE ref_type = 'PO';

-- 3) 삭제 후 검증 (0건이어야 함)
-- SELECT COUNT(*)::bigint AS remaining_po_rows
-- FROM public.payable_transactions
-- WHERE ref_type = 'PO';
