-- 기존 '일부 배송 완료'를 '일부배송완료'로 통일 (띄어쓰기 제거)
UPDATE orders SET delivery_status = '일부배송완료' WHERE delivery_status = '일부 배송 완료';
