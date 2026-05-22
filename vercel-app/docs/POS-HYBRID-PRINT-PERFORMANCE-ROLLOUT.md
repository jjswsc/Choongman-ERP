# POS 하이브리드 인쇄 성능 롤아웃 가이드

## 목표 SLA
- 메인 POS 주문 인지: 1~2초대(Realtime 정상 시)
- 첫 인쇄 시작: 3~5초대(매장 프린터 상태 정상 시)
- 주문 폭주 구간에서도 인쇄 누락/중복 증가 없이 유지

## 코드 반영 항목
- `windows-pos/main.js`
  - HTML 인쇄 IPC 큐 직렬화
  - 숨김 인쇄 창 재사용
  - settle/spool 대기시간 단축 + 실패 시 자동 백오프
- `app/pos/terminal/page.tsx`
  - 메인 폴링 간격 10초 → 6초
  - Realtime payload 빈 항목 감지 시 즉시 폴백 poll 트리거
  - 폴링 중복 실행 방지(in-flight guard)
  - 부가 scan(취소 감시) 30초 주기 최적화
- `lib/pos-order-no-server.ts` + `sql/pos_order_no_counter_rpc.sql`
  - 주문번호 할당 RPC 우선(원자 증가), 미배포 시 기존 fallback

## 파일럿 운영 체크리스트 (2~3개 매장)
- 1) 앱/셸 배포 후 `runtime-config.json`에서 아래 기본값 확인
  - `printHtmlSettleMs: 260`
  - `postHtmlPrintSpoolFlushMs: 350`
  - `printHtmlQueueGapMs: 80`
- 2) 프린터 이름 정확 매핑
  - `print.receiptDeviceName`, `print.kitchen1~3DeviceName`
- 3) 측정 로그 수집 (최소 하루)
  - API 응답 헤더: `X-Pos-Save-Elapsed-Ms`, `X-Pos-Save-Allocate-OrderNo-Ms`
  - 브라우저 디버그: `?printDebug=1` 또는 `localStorage.pos_print_debug=1`
  - 하이브리드 디버그: `CM_POS_DEBUG_LOG_ENABLED=1`
- 4) 합격 기준
  - 주문 몰림(연속 주문 20건+)에서 첫 인쇄 체감 지연 유의미 감소
  - 중복/누락 인쇄 신고 건수 증가 없음

## 전매장 롤아웃 순서
1. 파일럿 2~3개 매장 적용
2. 2일 이상 모니터링 후 이상 징후(미인쇄/과다 지연) 확인
3. 드라이버 특이 매장만 `printHtmlSettleMs`/`postHtmlPrintSpoolFlushMs` 미세 조정
4. 전체 매장 확대

## 장애 대응(즉시 되돌림)
- 인쇄 실패 급증 시 임시 조치
  - `printHtmlSettleMs`를 320~400으로 상향
  - `postHtmlPrintSpoolFlushMs`를 500~750으로 상향
- 주문번호 RPC 미배포/오류 시
  - 서버는 자동으로 기존 select+scan 방식 fallback
