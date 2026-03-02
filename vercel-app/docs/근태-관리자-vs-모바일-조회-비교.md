# 근태 기록: 관리자 조회 vs 모바일 기록/조회 비교

관리자 페이지 "근태 기록/승인"에서 보이는 것과 모바일에서 기록·조회되는 것이 다르게 느껴질 수 있는 원인을, **같은 DB 테이블·API 기준**으로만 정리했습니다.

---

## 1. 데이터 소스 (동일)

| 구분 | 테이블 | API |
|------|--------|-----|
| **모바일 기록** | `attendance_logs` | `POST /api/submitAttendance` → insert |
| **모바일 조회** | `attendance_logs` | `GET /api/getAttendanceList` |
| **관리자 조회** | `attendance_logs` | `GET /api/getAttendanceRecordsAdmin` |

→ **같은 테이블**을 보고 있음. 다른 건 **조회 조건·날짜 계산·결과 형태**입니다.

---

## 2. 조회 API 차이 요약

| 항목 | 모바일 조회 (getAttendanceList) | 관리자 조회 (getAttendanceRecordsAdmin) |
|------|----------------------------------|----------------------------------------|
| **용도** | 직원 본인 오늘/기간 출퇴근 **로그 목록** (출근/퇴근/휴식 시각 나열) | 관리자 근태 **일별 집계** (날짜·매장·이름별 출근/퇴근 시각, 연장·지각 등) |
| **결과 형태** | `{ timestamp, type, status, late_min?, ot_min? }[]` (로그 한 건씩) | `AttendanceDailyRow[]` (날짜·매장·이름당 1행, inTimeStr, outTimeStr, breakMin, lateMin, otMin 등) |
| **store_name 조건** | `store_name=ilike.{storeFilter}` (전달한 값과 **완전 일치**, 대소문자 무시) | `store_name=ilike.{storeFilter}` (동일). 단 "All"이면 store 조건 없음 |
| **name 조건** | `name=ilike.{employeeFilter}` (필수) | `employeeFilter`가 있으면 이름 일치만 남김. "All"이면 전 직원 |
| **날짜 범위** | `log_at >= startStr`, `log_at < endStr` (문자열 비교 = UTC 구간으로 해석) | 동일하게 `log_at` 구간 조회 후, **추가로** 방콕 기준 날짜(`toDateStr(log_at)`)로 행 필터/집계 |

즉, **같은 `attendance_logs`**를 보지만  
- 모바일: “이 매장·이 직원·이 기간” **로그 리스트**  
- 관리자: “이 기간” **일별 집계** (매장/직원 필터는 있지만, 집계 단위가 “날짜+매장+이름”)  
이라서 **화면에 보이는 형태**가 다릅니다.

---

## 3. 날짜 범위 계산 (차이 가능 지점)

두 API 모두 클라이언트가 준 `startDate` / `endDate`(예: "2025-03-02")로 `log_at` 구간을 만듭니다.

### 3-1. getAttendanceList (모바일)

```ts
// app/api/getAttendanceList/route.ts
const startD = new Date(startDate + 'T12:00:00')   // 로컬(브라우저) 12:00
const endD = new Date(endDate + 'T12:00:00')
const endExclusive = new Date(endD)
endExclusive.setDate(endExclusive.getDate() + 1)
const startStr = startD.toISOString().slice(0, 10)  // UTC 날짜
const endStr = endExclusive.toISOString().slice(0, 10)
// filter: log_at >= startStr AND log_at < endStr
```

- `startStr`/`endStr`은 **브라우저 로컬** 정오 기준으로 만든 뒤 **UTC 날짜**로 변환한 값.
- DB에는 `log_at`이 UTC(ISO)로 저장되므로, 실제로는 **UTC 날짜 구간**으로 조회됨.

### 3-2. getAttendanceRecordsAdmin (관리자)

```ts
// app/api/getAttendanceRecordsAdmin/route.ts
const startStr = startDate.slice(0, 10)   // 그대로 "YYYY-MM-DD"
const endD = new Date(endDate + 'T23:59:59')
endD.setDate(endD.getDate() + 1)
const endStr = endD.toISOString().slice(0, 10)   // 로컬 23:59:59+1일 → UTC 날짜
// fetch: log_at >= startStr AND log_at < endStr
// 그 다음 각 row에 대해:
//   rowDate = toDateStr(r.log_at)  // 방콕(Asia/Bangkok) 기준 날짜
//   if (rowDate < startStr || rowDate >= endStr) continue  // 방콕 날짜로 한번 더 필터
```

- **가져올 때**: `log_at`을 **UTC 날짜** 구간으로 조회 (문자열 비교).
- **보여줄 때**: `log_at`을 **방콕 날짜**로 바꾼 뒤, 그 날짜가 `startStr`~`endStr` 안에 있는 행만 사용.

그래서:

- **관리자**: “오늘”을 조회해도, **방콕 00:00~07:00** 사이 기록은 UTC로는 **전날**이라, `log_at >= "오늘"` 조건으로는 안 들어올 수 있음 → 해당 날짜로 조회하면 **관리자 화면에만 안 나올 수 있음**.
- **모바일**: 같은 날짜를 “오늘”로 보내면, 역시 UTC 구간이라 **같은 이유**로 00:00~07:00 방콕 기록이 “오늘” 조회에 안 잡힐 수 있음.

즉, **날짜 기준이 “로컬/방콕 일자”가 아니라 “UTC 일자”로 섞여 있어서**,  
- 같은 로그가  
  - 모바일 “오늘”에는 안 보이고  
  - 관리자 “어제” 또는 “오늘” 한쪽에만 보이거나,  
둘 다 “오늘”에 안 보일 수 있습니다.  
→ **관리자와 모바일이 “다른 것 같다”고 느끼는 원인 1**.

---

## 4. store_name / name (매장·직원명) 일치

- **기록 시** (모바일): `submitAttendance`에서 `storeName`, `name`은 **로그인 사용자 정보(auth.store, auth.user)** 그대로 저장.
- **모바일 조회**: `storeFilter`/`employeeFilter`를 그대로 `store_name`/`name`에 **ilike**로 사용 (완전 일치에 가깝고, 대소문자만 무시).
- **관리자 조회**: 매장/직원 필터가 있으면 같은 방식으로 **ilike** 적용.

따라서:

- 직원 A의 `auth.store`가 `"Ekkamai"`이면, 모바일에서 찍은 기록은 전부 `store_name = "Ekkamai"`.
- 관리자에서 매장을 **"CM Ekkamai"** 등 **다른 문자열**로 고르면, `store_name=ilike."CM Ekkamai"`만 조회하므로 **직원 A의 기록은 관리자 목록에 안 나옴**.
- 반대로, 관리자는 "Ekkamai"만 보고 있는데, 어딘가에서 `"สาขาเอกมัย"` 같은 값으로 저장된 로그가 있으면, 관리자 “Ekkamai” 조회에는 안 나올 수 있음.

→ **매장/지점 이름이 DB·로그인·관리자 드롭다운에서 조금만 달라도** “관리자에는 있는데 모바일에는 없다” / “모바일에는 있는데 관리자에는 없다”가 나올 수 있음.  
→ **관리자와 모바일이 다른 것 같다**고 느끼는 원인 2.

---

## 5. 관리자만의 “일별 집계” 규칙

관리자 API는 **출근이 있는 날**만 한 행으로 만듭니다.

```ts
// getAttendanceRecordsAdmin
if (!rec.inTime) continue  // 출근 없으면 행 자체를 안 만듦
```

- 모바일에서는 **퇴근만** 찍힌 경우(예: 전날 밤 근무 후 다음날 퇴근)도 **로그**는 있음.
- 관리자 화면에서는 “그 날에 출근 로그가 없으면” 그 날 행이 없고, 퇴근은 “다음 날” 행의 퇴근으로 묶는 로직이 있음(자정 넘김 처리).

그래서 **같은 퇴근 로그**라도:

- 모바일: “퇴근” 로그 한 건으로 보임.
- 관리자: “다음 날” 일별 행의 “퇴근 시각”으로만 보이거나, 출근이 없으면 아예 다른 날짜 행으로 묶여서 보일 수 있음.

→ **보이는 날짜/행이 다르게 느껴지는 원인 3**.

---

## 6. 확인 방법 제안

아래 순서로 보시면 “관리자 vs 모바일”이 같은 데이터를 보는지 바로 검증할 수 있습니다.

1. **DB에서 해당 기간·매장·직원 직접 확인**
   - `attendance_logs`에서  
     `store_name`, `name`, `log_at`, `log_type`  
     조건으로 조회 (예: 특정 날짜 범위, 특정 매장·이름).
   - “모바일에서 찍었다”고 하는 날/시간의 출근·퇴근 행이 실제로 있는지 확인.

2. **같은 조건으로 두 API 호출**
   - 동일한 `startDate`, `endDate`, `storeFilter`, `employeeFilter`로  
     - `GET /api/getAttendanceList?...`  
     - `GET /api/getAttendanceRecordsAdmin?...`  
     를 호출.
   - `getAttendanceList`에 나온 `log_at`/`log_type`이  
     `getAttendanceRecordsAdmin`의 해당 날짜·해당 직원 행의 `inTimeStr`/`outTimeStr`와 일치하는지 비교.

3. **매장/이름 값 통일 확인**
   - 로그인 사용자 `store`/`name`과  
     관리자 페이지에서 선택하는 매장/직원 드롭다운 값이  
     **완전히 같은 문자열**인지 확인 (공백, "CM ", "สาขา" 등 포함).
   - `attendance_logs.store_name`에 실제로 저장된 값이 그 문자열과 같은지 확인.

4. **날짜 이슈 확인**
   - “안 보인다”고 하는 기록의 `log_at`(UTC)을  
     방콕 시간으로 변환한 날짜가  
     관리자/모바일에서 선택한 “오늘”/“그날”과 같은지 확인.
   - UTC 00:00~07:00(방콕 07:00~14:00) 구간이 “전날”로 잘못 묶이지 않는지 확인.

---

## 7. 요약

| 구분 | 내용 |
|------|------|
| **데이터 소스** | 동일 (`attendance_logs`). 기록도 동일 API (`submitAttendance`). |
| **다르게 보일 수 있는 이유** | ① **날짜**: 조회 구간이 UTC 기준이라, 방콕 00:00~07:00 로그가 “그날” 조회에 안 나올 수 있음. ② **매장/이름**: `store_name`/`name`이 관리자 선택값·로그인값과 조금만 달라도 한쪽에만 보임. ③ **표시 방식**: 모바일은 “로그 나열”, 관리자는 “일별 집계(출근 있는 날만 행 생성)”라서 같은 로그가 다른 날/다른 행에 보일 수 있음. |
| **다음 단계** | 위 6번처럼 DB·동일 조건 API 비교로 “같은 로그가 두 화면에서 어떻게 다르게 나오는지”부터 확인한 뒤, 필요하면 **조회 날짜를 방콕 기준으로 통일**하거나, **store_name/name 표기 통일**을 검토하면 됨. |

이 문서는 **확인용**이며, 코드 수정은 포함하지 않았습니다.
