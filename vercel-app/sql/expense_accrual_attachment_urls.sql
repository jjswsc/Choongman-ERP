-- 지출 지급예정(expense_accruals) 첨부: 인보이스·영수증 URL JSON 배열 (data URL 또는 https)
-- 예: ["data:image/jpeg;base64,..."]
alter table if exists expense_accruals
  add column if not exists attachment_urls text;

comment on column expense_accruals.attachment_urls is 'JSON string array of attachment URLs for invoice/receipt (max length per app)';
