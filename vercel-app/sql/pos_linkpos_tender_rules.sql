-- KBTG LINKPOS: 승인 응답 텍스트 기반 결제수단 매핑 규칙(매장별)

create table if not exists public.pos_linkpos_tender_rules (
  id bigserial primary key,
  -- __shared__ = 전 매장 공통 규칙
  store_code text not null default '__shared__',
  -- includes 매칭용 키워드 (소문자/공백제거 정규화 후 비교)
  match_keyword text not null,
  -- card | qr
  tender_group text not null,
  -- Visa, Master, PromptPay 등 결산 breakdown 키
  tender_key text not null,
  -- 낮을수록 우선순위 높음
  priority int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint chk_pos_linkpos_tender_rules_group
    check (tender_group in ('card', 'qr'))
);

create index if not exists ix_pos_linkpos_tender_rules_store_active
  on public.pos_linkpos_tender_rules(store_code, is_active, priority, id);

create unique index if not exists ux_pos_linkpos_tender_rules_unique
  on public.pos_linkpos_tender_rules(store_code, match_keyword, tender_group, tender_key);

-- 기본 공통 규칙 샘플 (중복이면 무시)
insert into public.pos_linkpos_tender_rules (store_code, match_keyword, tender_group, tender_key, priority)
values
  ('__shared__', 'promptpay', 'qr', 'PromptPay', 10),
  ('__shared__', 'thaiqr', 'qr', 'PromptPay', 11),
  ('__shared__', 'truemoney', 'qr', 'TrueMoney', 12),
  ('__shared__', 'wechat', 'qr', 'WeChat', 13),
  ('__shared__', 'alipay', 'qr', 'Alipay', 14),
  ('__shared__', 'visa', 'card', 'Visa', 20),
  ('__shared__', 'mastercard', 'card', 'Master', 21),
  ('__shared__', 'master', 'card', 'Master', 22),
  ('__shared__', 'jcb', 'card', 'JCB', 23),
  ('__shared__', 'amex', 'card', 'Amex', 24),
  ('__shared__', 'unionpay', 'card', 'UnionPay', 25)
on conflict do nothing;

