-- 충만/Omni 공통: 세무 신고용 법인 엔티티 + 매장 매핑
-- scope 예시: entity:choongman-main / entity:omni-foodtech
-- 실행 후 PP30/법인세 스코프를 법인 단위로 묶어 계산할 수 있음.

CREATE TABLE IF NOT EXISTS public.tax_entities (
  entity_code TEXT PRIMARY KEY,
  entity_name TEXT NOT NULL DEFAULT '',
  tax_id TEXT NOT NULL DEFAULT '',
  tenant_id TEXT NOT NULL DEFAULT 'default',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NULL
);

CREATE TABLE IF NOT EXISTS public.tax_entity_stores (
  entity_code TEXT NOT NULL,
  store_code TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT NULL,
  PRIMARY KEY (entity_code, store_code)
);

CREATE INDEX IF NOT EXISTS idx_tax_entities_tenant_active
  ON public.tax_entities (tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_tax_entity_stores_store_code
  ON public.tax_entity_stores (store_code);

ALTER TABLE public.tax_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_entity_stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all tax_entities" ON public.tax_entities;
CREATE POLICY "Allow all tax_entities" ON public.tax_entities
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all tax_entity_stores" ON public.tax_entity_stores;
CREATE POLICY "Allow all tax_entity_stores" ON public.tax_entity_stores
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.tax_entities IS '세무 신고용 법인(사업자) 엔티티. entity:* 스코프로 사용';
COMMENT ON TABLE public.tax_entity_stores IS '법인 엔티티와 매장(store_code) 매핑';
