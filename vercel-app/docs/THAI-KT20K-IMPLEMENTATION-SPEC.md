# 태국 กท.20 ก (KT20K) 구현 스펙 초안

## 목적

- 태국 **연간 근로자 보상기금 신고서(กท.20 ก)** 준비를 ERP 내에서 수행한다.
- 급여 확정 데이터와 연계해 연간 보고서를 자동 집계하고, 검증 포인트를 제공한다.
- 연간 PND1A/급여 누계와 대사 가능한 형태로 제공한다.

참고 UX/업무 흐름: [FlowAccount KT20K 가이드](https://flowaccount.com/help-center/category/payroll/kor-tor-20-kor)

## 현재 코드/데이터 기준

- 급여 산출 API: `app/api/getPayrollCalc/route.ts`
- 급여 확정 조회 API: `app/api/getPayrollRecords/route.ts`
- 급여 핵심 테이블(문서 기준):
  - `payroll_records`
  - `employees`
  - `leave_requests`
  - `attendance_logs`
- 기존 태국 신고 자동화 흐름:
  - `components/admin/admin-accounting-compliance.tsx`
  - `app/api/exportPnd1RdPrepTxt/route.ts`
  - `app/api/validatePnd1RdPrep/route.ts`

## KT20K에서 필요한 데이터(요구사항)

FlowAccount 가이드 기준으로 KT20K는 다음이 필요하다.

- 회사/고용주 기본정보
  - 관할 사회보장 사무소(จังหวัด)
  - 관할 사무소 연락처
  - 사업장 코드(5자리)
  - 기금 요율(0.20~1.00 구간)
- 월별 집계(1~12월)
  - 근로자 수
  - 월급(เงินเดือน)
  - 일당(ค่าจ้างรายวัน)
  - 기타 보수(ค่าตอบแทนอื่นๆ)
  - (1) 총임금
  - (2) 인당 20,000 초과분
  - (3) 신고 순임금 = (1) - (2)
- 연간 합계
- 급여/세무 데이터 정합성 점검(특히 PND1A와 대사)

## 현재 ERP 컬럼 매핑 (1차)

### A. 월별 인원/임금 집계

- 기준 테이블: `payroll_records` (status가 지급 완료인 건만 반영 권장)
- 권장 필터:
  - `month`가 대상연도(`YYYY-01` ~ `YYYY-12`)
  - `status` in (`paid`, `done`, `ชำระแล้ว`) 형태를 표준화해서 사용

| KT20K 항목 | 1차 매핑 | 비고 |
|---|---|---|
| เดือน (월) | `payroll_records.month` | `YYYY-MM` |
| จำนวนลูกจ้าง (인원) | `count(distinct employee_id or (store,name))` | 직원 식별키 우선순위 필요 |
| เงินเดือน (월급) | `sum(salary)` | 월급제/시급제 혼합 정책 필요 |
| ค่าจ้างรายวัน (일당) | **갭** | 현재 `payroll_records`에 직접 구분치 없음 |
| ค่าตอบแทนอื่นๆ (기타 보수) | `sum(pos_allow + haz_allow + diligence_allow + birth_bonus + spl_bonus + ot_amt + holiday_pay)`(정책 확정 필요) | SSO 계산 포함 항목 정책 필요 |
| (1) รวมค่าจ้าง | 월급 + 일당 + 기타 보수 | |
| (2) ส่วนเกิน 20,000/คน/เดือน | per employee: `max((월합계) - 20000, 0)` 합산 | 월합계 정의 고정 필요 |
| (3) ค่าจ้างสุทธิที่ต้องแจ้ง | (1) - (2) | |

### B. 회사/고용주 설정값

현재 확인된 전용 저장소 테이블이 없음. 신규 필요.

제안 테이블: `thai_workers_comp_settings`

- `id`
- `company_tax_id`
- `company_name`
- `sso_office_province`
- `sso_office_phone`
- `business_code_5`
- `fund_rate_percent`
- `effective_year`
- `updated_by`, `updated_at`

## 확인된 갭

1) **일당(ค่าจ้างรายวัน) 분리 값 부재**
- `payroll_records`에서 월급/일당을 분리 집계하기 어려움.
- 해결안:
  - 급여확정 시 `wage_monthly`, `wage_daily` 저장 컬럼 추가 또는
  - `employees.sal_type` + 근태 기반으로 리빌드 집계 API 제공

2) **기타 보수(ค่าตอบแทนอื่นๆ) 정책 테이블 부재**
- 어떤 조정항목이 KT20K 기타보수로 들어가는지 표준 규칙 필요.
- 해결안:
  - `payroll_component_rules` 또는 기존 add/deduct 설정에 `include_in_kt20k_other_comp` 플래그 추가

3) **고용주 KT20K 설정값 저장소 부재**
- 관할사무소/사업코드/요율 등 입력값이 필요.

4) **급여 지급완료 상태 표준화 필요**
- 보고서에는 지급완료 데이터만 반영해야 함.

## 구현안 (MVP)

### 1. API

- `GET /api/getKt20kSummary?year=YYYY&storeFilter=...`
  - 월별 집계 + 연간 합계 + 경고(누락값)
- `POST /api/saveKt20kSettings`
  - 고용주 설정 저장
- `GET /api/getKt20kSettings?year=YYYY`
  - 고용주 설정 조회
- `GET /api/exportKt20kCsv?year=YYYY&storeFilter=...`
  - 감사/검토용 CSV
- (선택) `GET /api/exportKt20kPdf?...`
  - 제출용 인쇄형 PDF

### 2. UI

추가 위치: `components/admin/admin-accounting-compliance.tsx` 내 태국 컴플라이언스 영역

- 서브탭: `KT20K`
- 블록 1: 고용주 설정 카드(관할사무소, 연락처, 사업코드, 요율)
- 블록 2: 연도 선택 + 매장 필터 + 조회
- 블록 3: 월별 테이블(1~12월)
- 블록 4: 연간 합계 + 검증 메시지
- 블록 5: 내보내기(CSV/PDF) 버튼

### 3. 검증 규칙(MVP)

- `business_code_5`는 숫자 5자리
- `fund_rate_percent`는 0.20~1.00
- 월별 row에서 `(3) = (1) - (2)` 불일치 금지
- 연간 합계 = 월합계 합과 일치
- 경고:
  - 해당 월 지급완료 급여 없음
  - `PND1A` 연간 총액 대비 차이 임계치 초과

## PND1A 대사(권장)

- 비교 기준:
  - KT20K 연간 신고 순임금 총액 vs PND1A 대상 연간 급여 총액
- 차이 리포트:
  - 월별 차이
  - 직원별 상위 차이
  - 원인 태깅(일당 분리 부재, 제외수당 정책 차이 등)

## 단계별 작업 계획

1. 스키마 추가
  - `thai_workers_comp_settings` 생성
  - (선택) `payroll_records` 보강 컬럼(`wage_monthly`, `wage_daily`, `kt20k_other_comp`)
2. 집계 API 추가
  - `getKt20kSummary`, `get/saveKt20kSettings`
3. UI 추가
  - KT20K 탭 + 월별 표 + 검증 메시지
4. 내보내기
  - CSV 먼저, PDF는 2차
5. 대사 기능
  - PND1A와 차이 리포트

## 완료 기준 (Definition of Done)

- 연도 선택 시 1~12월 KT20K 집계가 ERP에서 재현 가능
- 필수 설정값 검증 통과 후 내보내기 가능
- CSV 내보내기 결과가 회계 검토에 사용 가능
- PND1A 대사 요약(연간 차이) 확인 가능

