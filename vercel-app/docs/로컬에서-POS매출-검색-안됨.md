# 로컬 접속 시 포스 매출 검색이 안 될 때

## 증상
- localhost로 접속하면 **다른 데이터**(매장, 품목, 비용 등)는 정상 표시
- **포스로 등록한 매출**만 검색·집계에 안 나옴

---

## 원인 1: Supabase 환경 변수 불일치 (가장 흔함)

| 접속 경로 | API 서버 | 사용하는 Supabase |
|----------|----------|-------------------|
| localhost:3000 | 로컬 Next.js | `.env.local`의 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Vercel 배포 URL | Vercel 서버 | Vercel 환경 변수 |

**실제 매장 POS는 대개 Vercel URL 사용** → 포스 주문은 **프로덕션 Supabase**에 저장됨.

로컬에서 `.env.local`이 **개발/스테이징** Supabase를 가리키면, 로컬 조회 시 **다른 DB**를 보게 되어 프로덕션 포스 데이터가 보이지 않음.

### 해결
로컬에서 프로덕션 포스 데이터를 보려면 `.env.local`에 **Vercel과 동일한** Supabase 값을 설정:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

변경 후 `npm run dev` 재시작 필요.

---

## 원인 2: 기간 조회 시 limit·날짜 필터 문제 (개선 완료)

기존 `getPosOrders`는 날짜 없이 **최근 1만 건**만 가져온 뒤 JS로 기간 필터링 → 기간이 과거이거나 주문이 많으면 누락됨.

### 적용된 수정
- `startStr`, `endStr`가 있으면 DB `created_at` 기준으로 필터링 (방콕 시간 구간 사용)
- posSalesByPeriod, posSalesByStore 등과 동일한 `bangkokDateRangeToUtc` 사용
- 기간 내 모든 주문을 DB에서 조회하므로 누락 없음

---

## 원인 3: status(상태) 필터

매출 집계 API(`posSalesByPeriod`, `posSalesByStore` 등)는 `status`가 `completed`, `paid`, `ready`인 주문만 집계함.  
`pending` 상태는 제외됨.

- 주문 저장 직후 기본값: `pending`
- 결제 완료·조리 완료 등 흐름에 따라 `completed` 등으로 변경됨
- 오프라인 저장 후 동기화 실패 시 계속 `pending`일 수 있음

---

## 점검 순서

1. **Supabase 일치 여부**  
   `.env.local`의 `SUPABASE_URL`이 Vercel 환경 변수와 같은지 확인.

2. **기간·매장 선택**  
   매출/영수증 화면에서 기간과 매장을 선택했는지 확인.

3. **브라우저 개발자 도구**  
   Network 탭에서 `/api/getPosOrders`, `/api/posSalesByPeriod` 등 응답을 확인.

4. **터미널 로그**  
   `[getPosOrders]` 로그에서 `rowCount`, `result count` 확인.
