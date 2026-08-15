-- ============================================================
-- pos_menu_boards.sql
-- POS 메뉴판 구성 (getPosMenuBoards PGRST205)
--
-- 증상: Could not find the table 'public.pos_menu_boards' in the schema cache
-- 대상: 충만 faxolqgaadcvyeyvrydc (Omni에도 없으면 동일 실행)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pos_menu_boards (
  id bigserial PRIMARY KEY,
  store_code text NOT NULL,
  board_type text NOT NULL,
  board_name text NOT NULL,
  group_grid_cols integer NOT NULL DEFAULT 5,
  group_grid_rows integer NOT NULL DEFAULT 2,
  menu_grid_cols integer NOT NULL DEFAULT 5,
  menu_grid_rows integer NOT NULL DEFAULT 5,
  resolution_width integer NOT NULL DEFAULT 1024,
  resolution_height integer NOT NULL DEFAULT 768,
  group_count integer NOT NULL DEFAULT 0,
  menu_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pos_menu_boards_unique_name
  ON public.pos_menu_boards (store_code, board_type, board_name);

ALTER TABLE public.pos_menu_boards ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_menu_boards TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.pos_menu_boards_id_seq TO anon, authenticated;

DROP POLICY IF EXISTS "pos_menu_boards_allow_public" ON public.pos_menu_boards;
CREATE POLICY "pos_menu_boards_allow_public"
  ON public.pos_menu_boards
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- 확인
SELECT to_regclass('public.pos_menu_boards') AS pos_menu_boards;
