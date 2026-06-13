-- 인테리어: 견적 금액 연동 + 레이아웃 배경 도면
-- Supabase SQL Editor에서 실행

ALTER TABLE interior_project_files
  ADD COLUMN IF NOT EXISTS quote_amount numeric(12,2) DEFAULT 0;

ALTER TABLE interior_project_files
  ADD COLUMN IF NOT EXISTS linked_expense_id bigint REFERENCES interior_expense_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_interior_project_files_linked_expense
  ON interior_project_files (linked_expense_id)
  WHERE linked_expense_id IS NOT NULL;

ALTER TABLE interior_layout_editor_prefs
  ADD COLUMN IF NOT EXISTS background_file_id bigint REFERENCES interior_project_files(id) ON DELETE SET NULL;

ALTER TABLE interior_layout_editor_prefs
  ADD COLUMN IF NOT EXISTS background_opacity numeric(4,2) NOT NULL DEFAULT 0.35;

ALTER TABLE interior_layout_editor_prefs
  DROP CONSTRAINT IF EXISTS chk_interior_layout_editor_prefs_bg_opacity;
ALTER TABLE interior_layout_editor_prefs
  ADD CONSTRAINT chk_interior_layout_editor_prefs_bg_opacity
  CHECK (background_opacity >= 0.05 AND background_opacity <= 1);
