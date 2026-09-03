-- QR 손님 언어별 메뉴명·설명 (비워 두면 앱이 영문 메뉴명·태국어 설명을 언어에 맞게 보여 줍니다)
-- 관리자에서 나중에 언어별 문구를 넣을 때 사용합니다.

alter table if exists public.pos_menus
  add column if not exists name_i18n jsonb not null default '{}'::jsonb,
  add column if not exists description_i18n jsonb not null default '{}'::jsonb;

comment on column public.pos_menus.name_i18n is
  'QR 손님 메뉴명 { "th": "...", "en": "...", "ko": "..." }. 비우면 name(영문) 기준으로 표시.';

comment on column public.pos_menus.description_i18n is
  'QR 손님 메뉴 설명 언어별. 비우면 태국어 손님은 description_table, 다른 언어는 태국어가 아닌 기본 설명만 표시.';
