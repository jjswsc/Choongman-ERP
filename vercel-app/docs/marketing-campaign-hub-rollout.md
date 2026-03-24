# Marketing Campaign Hub Rollout

## Phase 1: Contract and schema
- Apply `sql/marketing_campaign_hub_extensions.sql` in staging.
- Verify `marketing_campaign_id` read/write on `pos_orders`, `bank_transactions`, `petty_cash_transactions`.
- Deploy API contract changes for:
  - `marketingCampaignResults` (linked + fallback attribution fields)
  - `marketingCampaignCosts` (linked + heuristic attribution fields)
  - `importMarketingExcel` (`dryRun`, mapping stats)

## Phase 2: Hub-first UX
- Use campaign editor as the control tower:
  - linked counts (ads/influencers/promos)
  - quick navigation to linked screens with `?campaignId=<id>`
- Enforce campaign selection on new ad/influencer/promo creation.
- Validate save-path behavior:
  - new registration
  - edit existing item
  - list filtering by campaign

## Phase 3: Hybrid attribution
- In reports, show:
  - primary totals (`totalOrders`, `totalCosts`)
  - attribution metadata (`attributionMode`, `attributionConfidence`)
  - linked vs fallback counters.
- Confirm expected behavior:
  - linked data exists -> mode `linked` or `hybrid`
  - linked data absent -> mode `heuristic`

## Phase 4: Excel migration flow
- Operators run import with preview first (`dryRun`).
- Review:
  - candidate counts
  - mapped/unmapped counts
  - warning messages
- Execute import and assign remaining unmapped rows in hub UI.

## QA checklist
- Campaign created in hub can immediately create linked:
  - ad item
  - influencer item
  - promo set
- Promo list/search in campaign context only shows linked rows.
- Cost and POS results API return non-error response for:
  - campaign with full dates
  - campaign without dates
  - DB without new campaign columns (fallback still works)
- Excel import:
  - `Marketing campaign results` file processes campaign/roas/influencer
  - `Timeline Content` file processes content sheets
  - preview mode does not insert rows.

## Rollback strategy
- API rollback: redeploy previous commit; UI keeps working with old shape (extra fields are optional).
- DB rollback:
  - no destructive migration was applied (only additive columns/indexes).
  - if needed, ignore new columns rather than dropping immediately.
- Feature fallback:
  - disable strict campaign-required checks in APIs if operations need temporary bypass.
