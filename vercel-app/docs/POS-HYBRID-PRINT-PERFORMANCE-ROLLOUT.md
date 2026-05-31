# POS 하이브리드 인쇄 성능 롤아웃 가이드

## 목표 SLA
- 메인 POS 주문 인지: 1~2초대(Realtime 정상 시)
- 첫 인쇄 시작: 3~5초대(매장 프린터 상태 정상 시)
- 주문 폭주 구간에서도 인쇄 누락/중복 증가 없이 유지

## 코드 반영 항목
- `windows-pos/main.js`
  - HTML 인쇄 IPC 큐 직렬화
  - 무인쇄 시 **건별 전용 숨김 창**(재사용 시 연속 주방 인쇄 본문 깨짐 방지)
  - `printHtmlSettleMs` 전체 반영 + `document.fonts.ready` 대기
  - 인쇄 성공 후 스풀 안정화(`postHtmlPrintSpoolFlushMs`)를 다음 작업 전에 수행
- `lib/pos-print-html.ts`
  - 렌더러에서 영수증·주방 HTML 인쇄 **전역 직렬 큐**
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

## Android 태블릿(예: MBK) — 「Save as PDF」·로딩 화면 인쇄

- **증상**: 주문·인쇄 시 OS 인쇄 UI에 POS 본화면(「กำลังโหลด…」·빈 장바구니)이 보이고 5초 이상 지연.
- **원인**: Capacitor WebView에서 숨김 iframe `print()`가 본 문서를 캡처하는 경우 + `refetch` 시 테이블 영역 전체 로딩 오버레이.
- **코드 반영**:
  - `lib/print-html-iframe.ts`: Android는 영수증 HTML만 담은 **보조 창**에서 `print()` (`printHtmlInDedicatedPrintWindow`).
  - `lib/pos-store.ts`: `refetchStores({ scope: 'current' })`는 이미 데이터가 있으면 **로딩 오버레이 생략**.
- **매장 확인**: MBK 태블릿 APK 최신 + Vercel 배포 후, 인쇄 미리보기에 **영수증/주방 본문**만 보이는지·Letter가 아닌 80mm(또는 프린터 기본)에 가깝게 나오는지.

## CM Silom(สาขาสีลม) — 주방전 본문 깨짐

**증상**: 연속 주문 후 「Kitchen 1」 헤더만 정상, 본문이 기호·난문처럼 출력.

**매장 PC 적용** (`vercel-app/` 루트, 기존 프린터 이름 유지):

```powershell
# 1) 최신 Windows POS 설치본( main.js 수정 포함 ) 배포 후
# 2) %APPDATA%\choongman-pos-windows\runtime-config.json 에 타이밍만 병합
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/merge-windows-pos-runtime-config.ps1 `
  -OverlayPath "store-configs/store-cm-silom-print-overlay.json" `
  -RuntimeConfigPath "$env:APPDATA\choongman-pos-windows\runtime-config.json"
# 3) Choongman POS 재시작
```

오버레이 값: `printHtmlSettleMs: 360`, `postHtmlPrintSpoolFlushMs: 600`, `printHtmlQueueGapMs: 120`.

**Vercel**: `lib/pos-print-html.ts`, `app/pos/order/page.tsx` 배포(웹 POS·자동 주방 인쇄 큐).

## 장애 대응(즉시 되돌림)
- 인쇄 실패 급증 시 임시 조치
  - `printHtmlSettleMs`를 320~400으로 상향
  - `postHtmlPrintSpoolFlushMs`를 500~750으로 상향
- 주문번호 RPC 미배포/오류 시
  - 서버는 자동으로 기존 select+scan 방식 fallback
