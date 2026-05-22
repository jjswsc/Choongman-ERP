# AI 센터 — 데이터 보안 (1차: API + 약관 확인)

> **결정 (2026-05):** Enterprise / Zero Data Retention(ZDR) 견적은 **나중**.  
> 먼저 **OpenAI API(또는 동급 API) + 약관·DPA 확인** + ERP 최소 전송 원칙으로 운영한다.

## 1. 원칙 (회사 자산)

| 원칙 | 설명 |
|------|------|
| **원본 DB는 Supabase에만** | AI 업체 DB에 ERP 전체를 복제하지 않음 |
| **서버만 DB 접근** | 브라우저·개인 ChatGPT에 raw/export 금지 |
| **최소 전송** | 집계·요약만 LLM에 (RPC/advisor). 행 단위 대량 붙여넣기 금지 |
| **권한 = ERP와 동일** | `lib/ai/policy.ts` 매장·역할·기간 상한 |
| **API만 사용** | 직원 개인 ChatGPT/제미나이 **웹**에 매출·급여·고객정보 붙여넣기 **금지** |

## 2. OpenAI 시작 시 확인 체크리스트 (대표·법무 1회)

[OpenAI Platform](https://platform.openai.com) 로그인 → **Settings / Organization** 및 최신 **Terms · Privacy · DPA** 확인.

| # | 확인 항목 | 통과 기준 (요지) |
|---|-----------|------------------|
| 1 | **API 데이터 학습** | API로 보낸 비즈니스 데이터가 **모델 학습에 쓰이지 않음** (최신 정책 문구 확인) |
| 2 | **보관·로그** | API 요청 **보관 기간**·목적(남용 방지 등) 이해. 필요 시 조직 설정에서 보관 최소화 옵션 확인 |
| 3 | **계정 유형** | **팀/비즈니스** 조직. 개인 무료 ChatGPT와 **별도** API 프로젝트·키 |
| 4 | **DPA** | 데이터 처리 계약(DPA) 체결 가능 여부·하도급·삭제 조항 |
| 5 | **키 관리** | API 키 **서버(Vercel)만**. Rotation(분기 1회 등) 계획 |
| 6 | **결제·한도** | Usage limit / 월 예산 상한 설정 |
| 7 | **금지 데이터** | 프롬프트에 주민번호·계좌전체·비밀번호·전체 고객 DB dump **넣지 않음** |

확인일·담당·메모:

```
확인일: __________  담당: __________
OpenAI 정책 URL/버전 메모: __________
학습 미사용: ☐ 확인  DPA: ☐ 확인  Usage limit: ☐ 설정
```

## 3. ERP 기술 측 (이미/예정)

| 항목 | 상태 |
|------|------|
| `OPENAI_API_KEY` Vercel only | 설정 필요 (0-2) |
| `/api/ai/ask` 서버 집계 | advisor·RAG 확장 예정 |
| `ai_usage_logs` | 사용 추적 (민감 본문은 note에 넣지 않기) |
| `GET /api/ai/health` | 테이블·키 설정 여부 |

## 4. Enterprise / ZDR로 올리는 **트리거** (나중)

아래 중 하나라도 해당되면 견적·전환 검토:

- 태국/개인정보 규정상 **제3자 보관 0일** 계약이 필요할 때
- 감사·프랜차이즈 계약서에 **ZDR·지정 리전** 조항이 필수일 때
- **Azure OpenAI** 등 지역·전용 계약이 필요할 때
- 월 API 비용이 커서 Enterprise 번들이 유리할 때

## 5. 직원 공지 (1문장)

> ERP 밖 ChatGPT/제미나이에 **매장·매출·급여·고객 데이터를 붙여 넣지 마세요.**  
> 회사 데이터 질문은 **ERP AI 센터**만 사용합니다.

## 6. 0-2 — API 키 넣기 (Vercel)

1. [OpenAI API keys](https://platform.openai.com/api-keys) → **Create secret key** → `sk-...` 복사 (한 번만 표시)
2. [Vercel](https://vercel.com) → **CM ERP 프로젝트** (Root Directory `vercel-app`) → **Settings → Environment Variables**
3. 추가:
   - **Name:** `OPENAI_API_KEY` · **Value:** `sk-...` · **Environment:** Production (Preview/Development도 쓰면 동일 추가)
   - (선택) **Name:** `OPENAI_ERP_AI_MODEL` · **Value:** `gpt-4o-mini`
4. **Deployments** → 최신 배포 → **⋯ → Redeploy** (환경 변수만 저장하면 반영 안 됨)
5. 확인:
   - ERP **AI 센터** 상단: **「AI 모델 연결됨」** 초록 안내
   - 또는 로그인 후 `GET /api/ai/health` → `"openaiConfigured": true`
   - 질문 생성 시 답변에 **「모델 키 미설정」** 문구 없음 · `model` 필드에 예: `gpt-4o-mini`

**로컬:** `vercel-app/.env.example` → `.env.local` 복사 후 `OPENAI_API_KEY` 입력 → `npm run dev`

## 7. 다음 작업 순서

1. **0-2:** 위 §6 완료  
2. **§2 체크리스트** 1회 체크  
3. **1단계:** `docs/AI-STORE-OPS-METRICS.md` 4항목 확정  
4. **2단계:** RPC + advisor (첫 숫자 도메인)  
5. 도메인별 advisor 확장 → 범용 질의 라우팅
