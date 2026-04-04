# Windows 설치형 ERP 파일럿 롤아웃 (2개 매장)

## 1) 대상

- 파일럿 매장 A: `pilot-store-a.sample.json`
- 파일럿 매장 B: `pilot-store-b.sample.json`
- 기간: 최소 7일 (영업일 기준)

## 2) 사전 준비

- [ ] Supabase에 `sql/api_request_idempotency_keys.sql` 적용
- [ ] `windows-erp` 빌드 완료
- [ ] `/downloads/windows-erp/latest.json` 게시 완료
- [ ] 파일럿 매장별 `runtime-config` 적용

## 3) 현장 설치 체크

- [ ] 설치파일 실행 및 초기 실행 성공
- [ ] 로그인 성공 (`/admin/login`)
- [ ] 업데이트 확인(`Ctrl+Shift+U`) 동작
- [ ] 인쇄창(`Ctrl+P`) 동작
- [ ] 빠른 인쇄(`Ctrl+Shift+P`) 동작

## 4) 오프라인 시나리오 필수 검증

### 시나리오 A: 읽기 캐시
- [ ] 온라인에서 주요 ERP 화면 조회 후 캐시 워밍
- [ ] 네트워크 차단 후 `admin/sales-management` 재접속
- [ ] 기존 캐시 기반 조회 가능

### 시나리오 B: 저장 큐
- [ ] 오프라인에서 저위험 저장 API 호출(예: 체크리스트/설정 저장)
- [ ] 큐 적재 확인
- [ ] 재연결 후 자동 동기화 성공

### 시나리오 C: 고위험 멱등
- [ ] 동일 `X-Idempotency-Key`로 `savePurchaseOrder` 2회 호출
- [ ] 중복 처리 없이 `duplicate: true` 응답 확인
- [ ] `addBankTransaction` 중복 전송 시 중복 생성 방지 확인

## 5) 성공 기준 (Go/No-Go)

- [ ] 중복/누락 없는 동기화(큐 성공률 99% 이상)
- [ ] 오프라인 재연결 후 치명 오류 없음
- [ ] 인쇄/업데이트 관련 CS 접수 없음
- [ ] 파일럿 2개 매장 모두 기준 충족

모두 충족 시 전체 매장 단계 배포 진행.
