# Outbound Soft Delete Rollout

## 1) DB 선반영
- `sql/stock_logs_soft_delete_outbound.sql` 적용
- `sql/outbound_soft_delete_integrity_checks.sql` 점검 쿼리 저장

## 2) 1차 배포(강제출고 중심)
- `/api/deleteOutbound`를 `mode=force`로만 운영 오픈
- 삭제 전 `dryRun=true` 결과로 충돌(수금 초과) 없는 건만 실행
- 배포 당일/익일에 무결성 쿼리 1, 3, 4 실행

## 3) 2차 배포(주문출고 포함)
- `mode=order` 오픈
- 회계 분개(`store_purchase`) 존재 주문은 차단 유지
- 삭제 후 자동 미수 재계산 및 주문 배송상태 재산정 검증

## 4) 운영 체크리스트
- 삭제 API 응답 `warnings`가 비어있는지 확인
- `getCombinedOutboundHistory` 조회 시 삭제 건이 기본 숨김인지 확인
- `getReceivablePayableSummary` 잔액이 음수 매장 없이 유지되는지 확인
- 대시보드 출고 건수가 삭제 정책과 일치하는지 확인

## 5) 롤백 가이드
- 코드 롤백 전, 이미 삭제된 `stock_logs.is_deleted=true` 데이터는 감사 목적 유지
- 임시 복구 필요 시 `is_deleted=false` 재설정 후 아래 재동기화 API 순서 실행
  1. `/api/syncOrderReceivableFromOutbound` (주문 단건)
  2. `/api/syncAllOrderReceivablesFromOutbound` (주문 배치)
  3. 강제출고 미수 배치 보정 루틴 실행
