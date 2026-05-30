# CRM 구현 체크리스트

## 메뉴/도움말 동기화 (필수)

- [ ] `components/erp/erp-sidebar.tsx`에 CRM 메뉴(`href`, `titleKey`)를 추가/수정했다.
- [ ] `lib/i18n.ts`에 메뉴 라벨 키를 추가했다. (최소 `ko`, `en`)
- [ ] `lib/i18n.ts`에 `helpSum_*` / `helpHow_*` 키를 같은 경로 기준으로 추가했다.
- [ ] 경로가 `/admin/crm/...` 처럼 변경되면 `hrefToHelpSummaryKey` 규칙(`-` -> `_`, `/` -> `_`)과 일치하는지 확인했다.
- [ ] 임베디드 긴 도움말이 필요한 경우에만 `lib/admin-help-registry.ts`의 `EMBEDDED_BY_HREF`와 `components/erp/erp-page-help.tsx`를 함께 갱신했다.

## 회원 마스터 필수 필드

- [ ] 이름
- [ ] 전화번호
- [ ] 생년월일
- [ ] 성별
- [ ] 국적

## 운영 기준

- [ ] 고객용 회원 페이지는 로그인 단계를 최소화했다(전화번호 OTP).
- [ ] POS 주문 완료 시 포인트 적립/사용 멱등성(`member_id + order_id + kind`)이 보장된다.
- [ ] LINE 발송은 초기 저비용 반자동(세그먼트 추출 -> 대상 내보내기) 흐름을 제공한다.
- [ ] 30만 이상 확장을 위해 cursor/RPC/배치 경로를 사용한다.

