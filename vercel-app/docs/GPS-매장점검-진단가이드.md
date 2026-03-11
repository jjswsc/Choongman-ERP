# 매장 점검/출근 GPS 거리 문제 진단 가이드

## 1. 시스템 vs 직원 폰 구분 방법

### 1) 거리 수치로 판단

| 상황 | 가능성 | 확인 방법 |
|------|--------|-----------|
| **거리 9,000m+ (9km 이상)** | ● 매장 좌표(vendors) 오류 가능성 높음<br>● 잘못된 매장 좌표가 등록됐을 수 있음 | 관리자 → 거래처 관리에서 해당 매장 lat/lng 확인 |
| **거리 100~500m** | 직원 폰 GPS 오차 가능 (실내, 건물 내부) | `enableHighAccuracy` 적용 여부 확인 |
| **거리 50m 이내인데도 실패** | ● 단위/좌표계 버그 가능 (현재 Haversine은 정상)<br>● 캐시된 오래된 위치 사용 가능 | `maximumAge: 0` 적용 여부 확인 |

### 2) 같은 매장·같은 시점에서 여러 직원 테스트

- **A직원만 실패** → A 직원 폰 GPS 문제 가능성
- **모두 실패** → 시스템(매장 좌표) 문제 가능성

---

## 2. 시스템 측 검증 포인트

### 2-1. 매장 좌표 소스

- **출처**: `vendors` 테이블의 `gps_name`, `name`, `lat`, `lng`
- **매칭**: 선택한 매장명(또는 직원 `store`)이 `gps_name` 또는 `name`과 일치하는 행의 lat/lng 사용
- **주의**: `gps_name`이 비어 있으면 `name`으로 매칭. 매장명이 다르게 등록되면 잘못된 좌표와 매칭될 수 있음

### 2-2. 거리 계산 (Haversine)

- **구현**: `submitStoreVisit/route.ts`, `submitAttendance/route.ts`의 `calcDistance`
- **정확도**: Earth radius 6,371km 기준 Haversine 공식 사용 → 일반적으로 정확함
- **결과 단위**: 미터(m)

### 2-3. 허용 거리

- **기준**: 999m 이내만 허용
- **공통**: Store Visit, 출퇴근 모두 동일

### 2-4. 클라이언트 GPS 옵션 (vercel-app)

| 기능 | enableHighAccuracy | timeout | maximumAge |
|------|--------------------|---------|------------|
| **매장 방문 (Visit)** | ❌ 미설정 (기본값 false) | 10초 | 미설정 |
| **출퇴근 (HR)** | ✅ true | 5초 | 0 |

**Visit 탭**: `enableHighAccuracy` 미설정으로 WiFi/셀 기반 저정밀 위치가 사용될 수 있음.

---

## 3. 직원 폰(클라이언트) 측 가능 원인

1. **실내/지하**: GPS 신호 약함 → 오차 50~500m
2. **위치 권한**: 앱/브라우저 위치 권한 차단 또는 제한
3. **배터리 절전**: 일부 기기에서 GPS 정확도 하락
4. **캐시된 위치**: 이전 위치가 재사용됨 (HR은 maximumAge:0으로 방지)

---

## 4. 관리자 점검 절차

### Step 1: 매장 좌표 확인

**방법 A - 진단 API 사용**

```
GET /api/getStoreGpsCheck?store=CM%20Asoke
```

- 해당 매장의 등록된 `lat`, `lng`, `mapsUrl`(Google Maps 링크) 반환
- mapsUrl에서 실제 매장 위치와 일치하는지 바로 확인 가능

**방법 B - Supabase/거래처 관리**

1. 관리자 → **거래처 관리** 이동
2. 해당 매장(예: CM Asoke, CM Silom) 검색
3. **gps_name**, **lat**, **lng** 확인
   - lat/lng가 0 또는 비어 있으면 → GPS 미등록
   - Google Maps에서 해당 lat/lng로 검색하여 실제 매장 위치인지 확인

### Step 2: 매장명 매칭 확인

- 직원 `store` 또는 선택한 매장명과 `vendors.gps_name` / `vendors.name`이 정확히 일치해야 함
- 예: "CM Asoke" vs "CM Asoke " (공백), "Asoke" vs "CM Asoke" → 불일치 시 다른 매장 좌표 사용 가능

### Step 3: 실제 거리 검증 (선택)

- Google Maps에서 매장 주소 검색 → 우클릭 → 좌표 복사
- vendors에 등록된 lat, lng와 비교하여 동일한지 확인

---

## 5. 개선 권장 사항

1. **Visit 탭**: `getCurrentPosition`에 `enableHighAccuracy: true`, `maximumAge: 0` 추가
2. **디버깅**: 에러 시 "매장명: XXX, 사용 좌표: (lat, lng), 사용자 좌표: (lat, lng), 거리: XXXm" 로그 추가 (관리자 전용)
3. **관리자 화면**: 매장별 등록된 GPS 좌표와 지도 미리보기 제공
