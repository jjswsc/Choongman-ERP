-- 출고 인보이스(IV/IVF) 인쇄 상태 저장
-- 목적: 출고 > 본사 내역에서 "วางบิลแล้ว" 표시

create table if not exists public.outbound_invoice_print_status (
  invoice_no text primary key,
  printed boolean not null default true,
  printed_at text not null,
  printed_by text,
  updated_at text not null
);

create index if not exists idx_outbound_invoice_print_status_printed
  on public.outbound_invoice_print_status (printed);

