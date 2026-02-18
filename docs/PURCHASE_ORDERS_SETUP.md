# purchase_orders 테이블 설정

본사 발주 저장 시 `Could not find the table 'public.purchase_orders'` 오류가 발생하면,
Supabase SQL Editor에서 아래 스크립트를 실행하세요.

## 1. Supabase 대시보드 접속

1. [Supabase](https://supabase.com) 대시보드 로그인
2. 프로젝트 선택
3. 좌측 메뉴 **SQL Editor** 선택

## 2. SQL 실행

아래 내용을 복사하여 SQL Editor에 붙여넣고 **Run** 버튼을 클릭하세요.

```sql
-- purchase_orders 테이블 생성
-- 발주 저장 실패 시 "Could not find the table 'public.purchase_orders'" 에러 해결용

-- 창고/배송 위치 (없으면 생성)
CREATE TABLE IF NOT EXISTS warehouse_locations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  location_code TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_warehouse_locations_sort ON warehouse_locations(sort_order);

-- 발주서 (본사 → 거래처 발주)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id BIGSERIAL PRIMARY KEY,
  po_no TEXT,
  vendor_code TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  location_name TEXT NOT NULL,
  location_address TEXT NOT NULL,
  location_code TEXT NOT NULL,
  cart_json TEXT NOT NULL,
  subtotal NUMERIC(12,2) DEFAULT 0,
  vat NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  user_name TEXT DEFAULT '',
  status TEXT DEFAULT 'Draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON purchase_orders(vendor_code);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created ON purchase_orders(created_at);

-- 기본 창고 (선택 사항 - 필요 시 주석 해제 후 실행)
-- INSERT INTO warehouse_locations (name, address, location_code, sort_order)
-- VALUES ('창고', '배송 주소를 입력하세요', '창고', 1);
```

## 3. 확인

실행 후 에러가 없으면 `purchase_orders` 테이블이 생성된 것입니다.
본사 발주 저장이 정상적으로 동작합니다.
