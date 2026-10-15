-- 매장별 Grab 「포장 완료 → 준비완료 자동 전송」 설정 확인 (행이 없는 매장은 기본 true)
SELECT store_code, app_code, pack_complete_marks_grab_ready, updated_at AT TIME ZONE 'Asia/Bangkok' AS updated_bkk
FROM public.pos_delivery_app_policies
WHERE app_code = 'grab'
ORDER BY pack_complete_marks_grab_ready, store_code;
