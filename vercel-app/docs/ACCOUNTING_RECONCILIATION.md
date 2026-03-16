# Accounting Backfill & Reconciliation

## 목적
- 기존 집계형 손익과 신규 분개 기반 손익 차이를 월 단위로 비교한다.
- 최근 N개월 데이터를 분개로 백필하여 재무상태표/손익 검증 기반을 만든다.

## 1) 분개 스키마 적용
- `scripts/accounting_double_entry_schema.sql` 실행

## 2) 백필 실행
- API: `POST /api/accounting/backfill`
- Body 예시:

```json
{
  "months": 6,
  "dryRun": true
}
```

- `dryRun: true`로 예상 생성 건수 확인 후, `false`로 실행한다.

## 3) 대사 리포트 조회
- API: `GET /api/getAccountingReconcile?yearMonth=2026-03&storeFilter=All`
- 응답:
  - `legacy`: 기존 손익 API 기준
  - `journal`: 분개 라인 기준
  - `diff`: 차이값

## 확인 포인트
- `diff.netProfit`이 0에 가까워야 한다.
- 차이가 큰 경우 우선 확인:
  - POS 상태 미완료 주문(매출 인식 시점)
  - 통장 거래 category 분류 오류
  - `expense_date`/`sales_date` 누락
  - 직접정산(From HQ 제외) 품목 처리 누락

