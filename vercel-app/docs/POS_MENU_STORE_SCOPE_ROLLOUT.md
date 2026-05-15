# POS 메뉴 매장 스코프 롤아웃 체크리스트

## 1) 배포 순서
- DB에 `pos_menu_store_scopes` 생성 SQL을 먼저 반영한다.
- 서버/API 배포 후 `POS_MENU_SCOPE_COMPATIBILITY_MODE=1` 상태로 운영한다.
- 기존 데이터 백필이 필요하면 `sql/pos_menu_store_scope_backfill.sql`을 실행한다.
- 관리자 메뉴 화면에서 신규/핵심 메뉴의 노출 매장을 지정한다.
- POS 매장별 화면에서 메뉴 노출이 정상인지 검증한다.
- 검증 완료 후 `POS_MENU_SCOPE_COMPATIBILITY_MODE=0`으로 전환한다.

## 2) 운영 검증
- A 매장 전용 메뉴가 B 매장 POS에 보이지 않는지 확인한다.
- 매장 전환 후(동일 브라우저/단말) 이전 매장 메뉴가 섞여 보이지 않는지 확인한다.
- 오프라인 상태에서 매장별 캐시가 잘 분리되는지 확인한다.

## 3) 장애 시 즉시 완화
- 환경변수 `POS_MENU_SCOPE_COMPATIBILITY_MODE=1`로 복구한다.
- `getPosMenus` 호출에 `storeCode`가 비어도 기존처럼 전체가 보이는지 확인한다.
