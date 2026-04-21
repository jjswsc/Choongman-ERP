# LINE OA와 별도 앱 병행 회원 관리 전략 (CM_ERP)

이 문서는 LINE Official Account(OA)를 회원의 단일 원장으로 쓰기 어려울 때, **자사 앱·ERP가 마스터**이고 LINE은 **선택 연동·도달 채널**인 운영 모델을 코드·DB와 맞추기 위한 기준입니다.

## 1. 제약 유형별 우선순위 (clarify-constraint)

운영에서 “LINE이 협조하지 않는다”는 아래 중 무엇에 가까운지 먼저 구분합니다.

| 유형 | 증상 예시 | 우선 조치 |
|------|-----------|-----------|
| **정책·심사** | Messaging API/LIFF 승인 지연, 메시지 유형 제한 | 자사 앱·웹에서 가입·동의 수집, OA는 공식 허용 범위만 사용 |
| **기술** | 웹훅 불안정, ID 조회 한도 | 마스터는 DB, LINE 이벤트는 보조 로그로만 처리 |
| **비용** | 발송 과금·한도 초과 | 트랜잭션 알림은 앱 푸시·SMS·이메일로 이전, OA는 저빈도 안내 |
| **파트너·법인** | 가맹별 OA 분리 | `members` 단위 또는 상위 조직 키로 테넌트 분리 후 집계만 통합 |

**기본 우선순위:** (1) 회원 마스터 데이터의 법적·운영 주체 확보 → (2) LINE은 연결 가능한 식별자만 유지 → (3) 기존 CRM 파일·동기화는 이행 브릿지.

## 2. 식별자·스키마 (identity-model)

### 단일 진실 공급원

- **`public.members.id`**: ERP/POS/앱이 공유하는 **회원 마스터 키**.
- **LINE**: `public.member_identities`에서 `provider = 'line'`, `provider_user_id` = LINE User ID (nullable 연동).

즉 `line_user_id`는 **별도 연결**이며, LINE이 끊겨도 `members` 행은 유지합니다.

### `members.source` 권장 값

| 값 | 의미 |
|----|------|
| `manual` | ERP/관리 화면에서 수동 생성(레거시·키보드 입력) |
| `app` | 자사 앱·웹·관리자 “마스터 등록” 등 **디지털 채널 원장** |
| `line` | LINE 동기화·친구추가 등 LINE 기원 |
| `line_import` | LINE CRM 파일 반영 |

신규 관리자 화면에서 “신규 등록(앱·ERP 마스터)” 시 `source = 'app'`을 사용합니다.

### 약관·동의 범위 (요약)

- **앱/웹**: 가입 시 수집하는 항목·마케팅 수신·개인정보 처리에 대한 동의는 **앱 정책**에 둡니다.
- **LINE**: OA 채널에서 수집·발송하는 범위는 **LINE 정책 및 OA 약관**에 맞춥니다.
- ERP `consent_marketing`, `consent_privacy`, `consent_at`은 **실제 운영에서 수집한 동의**를 반영하도록 유지합니다.

## 3. CM_ERP와의 연동 방식 (erp-integration)

| 옵션 | 설명 | 권장 상황 |
|------|------|-----------|
| **A. 단일 DB (기본)** | 자사 앱과 CM_ERP가 동일 Supabase `members` / `member_identities` 사용 | 앱을 같은 프로젝트 백엔드로 붙일 때 |
| **B. 동기화 잡** | 앱 전용 DB가 따로 있고 ERP는 읽기 전용 동기화 | 레거시 분리·단계적 이관 |

**본 저장소 기본 가정은 옵션 A**입니다. API는 이미 `/api/members`로 마스터 CRUD를 제공합니다.

## 4. LINE OA 역할·운영 규칙 (line-role)

- **OA 역할**: 알림, Rich Menu → 앱/웹 **딥링크**, 쿠폰·안내 등 **저빈도 메시징**; 필요 시 LIFF로 경량 화면.
- **동기화**: `LINE 동기화` 버튼·웹훅은 **보조**이며, 신규 유입은 **앱·웹 가입**을 우선 안내합니다.
- **비용**: 발송량이 큰 트랜잭션 메시지는 앱 푸시 등으로 옮기고, OA는 캠페인·공지 위주로 계획합니다.
- **CRM 파일 반영**: 전환기에만 의존하지 말고, 장기적으로는 앱/API가 마스터를 갱신하도록 합니다.

## 5. 관련 코드·SQL

- 관리자 UI: [app/admin/members/page.tsx](../app/admin/members/page.tsx)
- 회원 API: [lib/members-server.ts](../lib/members-server.ts), [app/api/members/route.ts](../app/api/members/route.ts)
- 스키마 주석: [sql/members_identity_source_convention.sql](../sql/members_identity_source_convention.sql)
