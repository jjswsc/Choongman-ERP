# RPC 전환 로드맵 (2026-06)

행 조회 상한(`limit`, `maxRows`)으로 인한 집계 오차를 줄이기 위한 운영 문서.

## 1) 현재 상태 요약

- 이번 배치에서 POS/회계/물류/회원 CRM의 고위험 집계 경로는 대부분 전페이지 조회 또는 상한 상향을 적용함.
- 집계 API는 `X-Sales-Truncated` 또는 `truncated`를 통해 잘림 신호를 유지.
- 남은 `limit: 50000` 경로는 현재 기준으로 대부분 보조/배치성/운영 도구이며, 실시간 매출/손익 집계의 핵심 경로는 아님.

## 2) 완료된 핵심 안정화 (요약)

- POS 매출/정산 계열
  - `posSalesBy*` 공통 fetch 상한 상향
  - 실시간 매출, 취소사유, 채널정산 gross, 필터 옵션 폴백 전페이지 조회 적용
- 회계 계열
  - 손익/시산표/잔액/정합성 리포트 폴백 상한 확대 + 전페이지 조회 적용
  - `getBankTransactions`, `getAccountingWorkflowReminders`, `accounting/backfill` 대량 스캔 경로 개선
- 물류/재고 계열
  - `getStockStores`, `getAppData` 재고 폴백, 본사 출고 집계 상한 확대
- 회원/CRM 계열
  - 회원 전체 등급 재계산, recent 세그먼트/캠페인 타겟 스캔 상한 확대

## 3) 남은 50k 경로 (2026-06 기준)

다음은 코드 스캔 기준 잔여 `limit: 50000` 경로:

- `app/api/backfillPriceHistory/route.ts`
- `app/api/restoreFromPriceHistory/route.ts`
- `app/api/getHrPolicyReaderStats/route.ts`
- `app/api/getNoticeReaderStats/route.ts`
- `app/api/migratePosMenuOptionsToGroupLinks/route.ts`
- `lib/grab-order-to-pos.ts`

분류:

- 낮은 우선순위(집계 정확도 직접 영향 작음)
  - `backfillPriceHistory`, `restoreFromPriceHistory`, `migratePosMenuOptionsToGroupLinks`
  - 이유: 운영/마이그레이션/복구 성격
- 중간 우선순위(목록 누락 가능성)
  - `getHrPolicyReaderStats`, `getNoticeReaderStats`
  - 이유: 관리자 통계성 조회
- 케이스별 검토
  - `grab-order-to-pos`
  - 이유: 실시간 주문 연동 코드 경로라 변경 시 부작용 가능. 배치/폴백 여부를 확인한 뒤 전환.

## 4) RPC 우선 전환 대상 (P0/P1)

### P0 (집계 정확도 + 사용 빈도 높음)

1. POS 정합성 비교 (`getPosComplianceReconciliation`) 전용 RPC
   - 제안 함수
     - `get_pos_paid_totals_by_window`
     - `get_vat_draft_totals_by_window`
   - 효과
     - POS/VAT 비교를 DB 집계로 통일
     - 대량 기간에서 API 응답 안정화

2. KT20K Summary/CSV 전용 RPC
   - 제안 함수
     - `get_kt20k_summary`
     - `get_kt20k_monthly_rows`
   - 효과
     - payroll 대량 스캔 제거
     - Summary/CSV 산식 일치 보장

3. 마케팅 캠페인 성과 집계 RPC
   - 제안 함수
     - `get_marketing_campaign_pos_results`
   - 효과
     - linked/heuristic 집계를 DB에서 수행
     - 캠페인 기간/브랜치 필터 비용 절감

### P1 (운영 안정화)

4. 알림/정책 읽음 통계 RPC
   - 대상: `getHrPolicyReaderStats`, `getNoticeReaderStats`
   - 효과: 5만 스캔 제거, 관리자 화면 체감 개선

5. Grab 연동 보조 집계 점검 후 RPC/페이징 전환
   - 대상: `lib/grab-order-to-pos.ts`
   - 효과: 피크 시간대 연동 안정성 개선

## 5) 전환 원칙 (반드시 준수)

1. 집계는 RPC 우선, 목록은 페이지네이션 유지.
2. RPC 미배포/실패 시 select 폴백은 유지하되 `source`를 응답에 명시.
3. 응답 산식은 기존 UI와 동일하게 유지(회귀 방지).
4. 모든 전환은 아래 검증을 통과해야 반영:
   - `npx tsc --noEmit`
   - `npm run lint`
   - 필요 시 `npm run build` (배포 전 최종)

## 6) 배포/운영 체크리스트

- SQL 함수 추가 시:
  - 함수 정의 파일을 `vercel-app/sql/`에 추가
  - API는 `tryFetch...Rpc` + fallback 구조 유지
  - `source: 'rpc' | 'select'` 또는 헤더(`X-Pos-Sales-Source`)로 관측 가능해야 함
- 운영 점검:
  - 기간 확장 테스트(1일/7일/30일/90일)
  - 다매장/본사 범위 테스트
  - 결과 합계가 기존과 동일한지 대조

## 7) 다음 실행 순서 (권장)

1. `get_kt20k_summary` 계열 RPC 먼저 배포
2. `get_pos_paid_totals_by_window`, `get_vat_draft_totals_by_window` 배포
3. `get_marketing_campaign_pos_results` 배포
4. 읽음 통계 RPC (`notice`, `hr-policy`) 배포
5. `grab-order-to-pos` 경로 점검 후 최종 전환

