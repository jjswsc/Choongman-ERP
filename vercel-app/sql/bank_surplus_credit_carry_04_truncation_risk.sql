-- 4/4 버그 재현 조건: 미배정 Receive(음수)가 500건을 넘는지
SELECT
  count(*) FILTER (
    WHERE ref_type = 'Receive' AND ref_id IS NULL AND amount < 0
  ) AS all_neg_receive_null_ref,
  count(*) FILTER (
    WHERE ref_type = 'Receive'
      AND ref_id IS NULL
      AND amount < 0
      AND memo LIKE '과납 선수금%'
  ) AS surplus_credit_rows,
  count(*) FILTER (
    WHERE ref_type = 'Receive'
      AND ref_id IS NULL
      AND amount < 0
      AND (memo IS NULL OR memo NOT LIKE '과납 선수금%')
  ) AS other_neg_receive_null_ref
FROM receivable_transactions;
