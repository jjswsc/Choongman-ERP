/**
 * ERP 워크스페이스 탭 × keep-alive — soft/hard 핑퐁 금지
 *
 * 증상 A: 탭만 바뀌고 본문(조회 화면)이 그대로
 *   → softDisplayHref로 슬롯만 바꾸고 router.push를 안 함
 *   → soft miss 시 KeepAlive가 cacheHref(옛 페이지)로 fallback
 *   → 라우터는 계속 조회 페이지에 남음 → 본문 고정
 *
 * 증상 B: 탭 갔다 오면 조회 결과 사라짐
 *   → router.push로 remount / 숨김 탭이 다른 URL의 useSearchParams를 흡수
 *   → useAdminUrlTab이 searchParams를 그대로 파생하면 default 탭으로 돌아가
 *     TabsContent unmount → 하위 조회 state 소멸
 *
 * 해결(역할 분리):
 *   - 탭 전환 = 항상 hard (router.push). soft로 본문을 바꾸지 않음.
 *   - keep-alive 키 = admin 기본 pathname만 (?tab=으로 슬롯 분리 금지)
 *   - URL 탭 훅 = useAdminUrlTab local state + 활성일 때만 sync
 *   - 조회 유지 보조 = sales-management-view-cache 등 + useErpPageActive 가드
 *
 * softDisplayHref를 “캐시 hit 시 빠른 전환”으로 다시 넣지 말 것.
 */

export {}
