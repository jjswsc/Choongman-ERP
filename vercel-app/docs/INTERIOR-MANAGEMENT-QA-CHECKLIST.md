# 인테리어 관리 고도화 QA 체크리스트

## 회귀 확인 범위
- 프로젝트 허브 탭: `일정`, `주방`, `사양서`, `도면·견적서`, `비용/결제` 기존 동작 유지
- 기존 API 동작: `getInteriorSchedule`, `saveInteriorScheduleItem`, `getInteriorKitchenItems`, `getInteriorSpecifications`
- 기존 데이터 보존: 기존 `interior_schedule_items` 데이터는 간트 조회에서 fallback으로 노출

## 신규 기능 E2E 시나리오
1. 프로젝트 상세 진입 후 `일정` 탭에서 공정 2건 생성
2. 파트 필터/상태 필터를 각각 적용해 간트 바 표시가 바뀌는지 확인
3. `업체/결제` 탭에서 공정 연결 + 입금예정/입금완료/입고/완료일 입력 후 저장
4. `배치도` 탭에서 주방/홀 각각 품목 등록, 좌표값 변경, 상태 변경 확인
5. `자재사양` 탭에서 자재 등록 후 `배치도` 품목과 자재 연결 저장
6. 저장된 데이터 재조회(새로고침) 시 모든 값 유지 확인

## 데이터 검증 포인트
- `project_id` 필수, 날짜는 `YYYY-MM-DD`로 저장되는지 확인
- 공정 진척도는 0~100 범위 유지
- 배치 zone은 `kitchen` 또는 `hall`만 저장
- 삭제 API 호출 시 해당 id만 삭제되는지 확인

## 운영 적용 순서
1. `sql/interior_management_upgrade.sql` 실행
2. Vercel 재배포
3. 관리자에서 프로젝트 1개로 E2E 시나리오 실행
4. 운영 프로젝트 확장 적용
