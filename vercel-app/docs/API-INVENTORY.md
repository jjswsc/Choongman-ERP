# API 목록 (자동 생성)

> 이 파일은 `npm run api:inventory`로 생성합니다. 직접 수정하지 마세요.
> 신규 라우트 규칙: [`.cursor/rules/api-route-conventions.mdc`](../../.cursor/rules/api-route-conventions.mdc) · 검사: `npm run api:check`

- 라우트 수: **899**
- 도메인 그룹 수: **177** (평면 camelCase 라우트는 이름에서 동사를 뗀 첫 단어로 추정)
- 외부 호출(웹훅·크론): **22** — 경로 변경 금지

## 경로 변경 금지 (외부 등록·Vercel 크론)

| 경로 | 메서드 | 구분 |
|---|---|---|
| `/api/applyDuePriceSchedules` | POST, GET | cron `*/15 * * * *` |
| `/api/cron/auto-notices` | GET | cron `0 * * * *` |
| `/api/cron/marketing-ads-sync` | GET | cron `0 2 * * 1` |
| `/api/cron/saas-auto-suspend` | GET | cron `15 17 * * *` |
| `/api/member-portal/cron/expire-pending-payments` | GET | cron `*/10 * * * *` |
| `/api/member-portal/cron/reconcile-pending-payments` | GET | cron `*/15 * * * *` |
| `/api/members/cron/expire-points` | GET | cron `30 19 * * *` |
| `/api/members/line-import/cron` | GET | cron `5 18 * * *` |
| `/api/qr-table/cron/expire-sessions` | GET | cron `*/15 * * * *` |
| `/api/webhooks/grab/menu-sync-state` | POST | webhook |
| `/api/webhooks/grab/merchant/menu` | GET | webhook |
| `/api/webhooks/grab/oauth/token` | POST | webhook |
| `/api/webhooks/grab/order/state` | PUT | webhook |
| `/api/webhooks/grab/orders` | POST | webhook |
| `/api/webhooks/grab/pushGrabMenu` | POST | webhook |
| `/api/webhooks/grab/pushIntegrationStatus` | POST | webhook |
| `/api/webhooks/kbank/[...path]` | OPTIONS, GET, POST | webhook |
| `/api/webhooks/shopeefood/[indicator]/gettoken` | POST | webhook |
| `/api/webhooks/shopeefood/[indicator]/menu/notification/result` | POST | webhook |
| `/api/webhooks/shopeefood/[indicator]/order/status` | POST | webhook |
| `/api/webhooks/shopeefood/[indicator]/orders` | POST | webhook |
| `/api/webhooks/shopeefood/[indicator]/vendor-menu` | GET | webhook |

## 도메인별

- [pos](#pos) (126)
- [member-portal](#member-portal) (56)
- [interior](#interior) (41)
- [store](#store) (26)
- [marketing](#marketing) (25)
- [qr-table](#qr-table) (24)
- [bank](#bank) (20)
- [members](#members) (17)
- [crm](#crm) (16)
- [grab](#grab) (16)
- [lineOa](#lineoa) (15)
- [saas](#saas) (15)
- [accounting](#accounting) (14)
- [attendance](#attendance) (13)
- [expense](#expense) (13)
- [ai](#ai) (12)
- [notice](#notice) (11)
- [work](#work) (11)
- [company](#company) (10)
- [evaluation](#evaluation) (10)
- [order](#order) (10)
- [admin](#admin) (9)
- [card](#card) (9)
- [daily](#daily) (9)
- [item](#item) (9)
- [payroll](#payroll) (9)
- [petty](#petty) (9)
- [purchase](#purchase) (9)
- [income](#income) (8)
- [meta](#meta) (8)
- [my](#my) (8)
- [receivable](#receivable) (8)
- [inbound](#inbound) (7)
- [leave](#leave) (7)
- [tax](#tax) (7)
- [webhooks/grab](#webhooksgrab) (7)
- [invoice](#invoice) (6)
- [tiktok](#tiktok) (6)
- [debug](#debug) (5)
- [fixed](#fixed) (5)
- [hr](#hr) (5)
- [ops](#ops) (5)
- [outbound](#outbound) (5)
- [price](#price) (5)
- [vendors](#vendors) (5)
- [warning](#warning) (5)
- [webhooks/shopeefood](#webhooksshopeefood) (5)
- [checklist](#checklist) (4)
- [cron](#cron) (4)
- [employee](#employee) (4)
- [items](#items) (4)
- [kt20k](#kt20k) (4)
- [member](#member) (4)
- [pp30](#pp30) (4)
- [today](#today) (4)
- [validate](#validate) (4)
- [account](#account) (3)
- [check](#check) (3)
- [complaint](#complaint) (3)
- [corporate](#corporate) (3)
- [member-tiers](#member-tiers) (3)
- [menu](#menu) (3)
- [payable](#payable) (3)
- [po](#po) (3)
- [posPrintJobs](#posprintjobs) (3)
- [push](#push) (3)
- [repair](#repair) (3)
- [sauces](#sauces) (3)
- [stock](#stock) (3)
- [till](#till) (3)
- [unlinked](#unlinked) (3)
- [vat](#vat) (3)
- [warehouse](#warehouse) (3)
- [all](#all) (2)
- [balance](#balance) (2)
- [depreciation](#depreciation) (2)
- [etax](#etax) (2)
- [execute](#execute) (2)
- [extract](#extract) (2)
- [force](#force) (2)
- [franchisee](#franchisee) (2)
- [head](#head) (2)
- [hq](#hq) (2)
- [linkpos](#linkpos) (2)
- [login](#login) (2)
- [manual](#manual) (2)
- [next](#next) (2)
- [open](#open) (2)
- [pnd54](#pnd54) (2)
- [pnd91](#pnd91) (2)
- [posClose](#posclose) (2)
- [pp36](#pp36) (2)
- [public](#public) (2)
- [routine](#routine) (2)
- [schedule](#schedule) (2)
- [setup](#setup) (2)
- [uploadCompanyHybridDocument](#uploadcompanyhybriddocument) (2)
- [uploadInteriorFile](#uploadinteriorfile) (2)
- [vendor](#vendor) (2)
- [withholding](#withholding) (2)
- [adjust](#adjust) (1)
- [adjustment](#adjustment) (1)
- [app](#app) (1)
- [approved](#approved) (1)
- [attach](#attach) (1)
- [audit](#audit) (1)
- [auto](#auto) (1)
- [borrowing](#borrowing) (1)
- [calculate](#calculate) (1)
- [cleanup](#cleanup) (1)
- [collab](#collab) (1)
- [combined](#combined) (1)
- [correct](#correct) (1)
- [cost](#cost) (1)
- [customer](#customer) (1)
- [due](#due) (1)
- [employees](#employees) (1)
- [estimate](#estimate) (1)
- [from](#from) (1)
- [health](#health) (1)
- [image](#image) (1)
- [influencer](#influencer) (1)
- [ingredient](#ingredient) (1)
- [line](#line) (1)
- [linked](#linked) (1)
- [logout](#logout) (1)
- [management](#management) (1)
- [manager](#manager) (1)
- [member-coupons](#member-coupons) (1)
- [member-points](#member-points) (1)
- [member-stamps](#member-stamps) (1)
- [migrate](#migrate) (1)
- [no](#no) (1)
- [notification](#notification) (1)
- [oaplus](#oaplus) (1)
- [office](#office) (1)
- [online](#online) (1)
- [password](#password) (1)
- [patch](#patch) (1)
- [pay](#pay) (1)
- [platform](#platform) (1)
- [pnd1](#pnd1) (1)
- [pnd53](#pnd53) (1)
- [pos-printer-settings](#pos-printer-settings) (1)
- [publish](#publish) (1)
- [rd](#rd) (1)
- [reconcile](#reconcile) (1)
- [remind](#remind) (1)
- [replace](#replace) (1)
- [revoke](#revoke) (1)
- [safety](#safety) (1)
- [sent](#sent) (1)
- [session](#session) (1)
- [sso](#sso) (1)
- [subledger](#subledger) (1)
- [summarize](#summarize) (1)
- [thai](#thai) (1)
- [translate](#translate) (1)
- [trial](#trial) (1)
- [uploadComplaintPhoto](#uploadcomplaintphoto) (1)
- [uploadCustomerDisplayMedia](#uploadcustomerdisplaymedia) (1)
- [uploadEtaxEvidence](#uploadetaxevidence) (1)
- [uploadExpenseAttachment](#uploadexpenseattachment) (1)
- [uploadMarketingMaterialInstallPhoto](#uploadmarketingmaterialinstallphoto) (1)
- [uploadMemberPortalContentImage](#uploadmemberportalcontentimage) (1)
- [uploadNoticeAttachment](#uploadnoticeattachment) (1)
- [uploadPoQuotation](#uploadpoquotation) (1)
- [uploadPosMenuImage](#uploadposmenuimage) (1)
- [uploadSsoEvidence](#uploadssoevidence) (1)
- [uploadStoreActionPhoto](#uploadstoreactionphoto) (1)
- [uploadStoreCheckPhoto](#uploadstorecheckphoto) (1)
- [uploadStoreRepairPhoto](#uploadstorerepairphoto) (1)
- [uploadWarningLetterRegistry](#uploadwarningletterregistry) (1)
- [usage](#usage) (1)
- [user](#user) (1)
- [webhooks/kbank](#webhookskbank) (1)
- [weekly](#weekly) (1)

### pos

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/applyPosMenuCategoryPresets` | POST |  |
| `/api/clearPosMainDevice` | POST |  |
| `/api/deletePosCoupon` | POST |  |
| `/api/deletePosLinkposTenderRule` | POST |  |
| `/api/deletePosMenu` | POST |  |
| `/api/deletePosMenuBoard` | POST |  |
| `/api/deletePosMenuIngredient` | POST |  |
| `/api/deletePosMenuOption` | POST |  |
| `/api/deletePosOptionGroup` | POST |  |
| `/api/deletePosOptionGroupItem` | POST |  |
| `/api/deletePosPaymentMethodItem` | POST |  |
| `/api/deletePosPromo` | POST |  |
| `/api/deletePosPromoItem` | POST |  |
| `/api/getPosBusinessOpenStatus` | GET |  |
| `/api/getPosChannelSettlementGross` | GET |  |
| `/api/getPosChannelSettlements` | GET |  |
| `/api/getPosCollabCampaigns` | GET |  |
| `/api/getPosComplianceReconciliation` | GET |  |
| `/api/getPosCostAnalysisAudit` | GET |  |
| `/api/getPosCostSalesWeighted` | GET |  |
| `/api/getPosCoupons` | GET |  |
| `/api/getPosDeliveryAppPolicies` | GET |  |
| `/api/getPosDeliveryApps` | GET |  |
| `/api/getPosDepositHistory` | GET |  |
| `/api/getPosDevices` | GET |  |
| `/api/getPosLinkposTenderRules` | GET |  |
| `/api/getPosMenuBoards` | GET |  |
| `/api/getPosMenuCategories` | GET |  |
| `/api/getPosMenuCostAnalysis` | GET |  |
| `/api/getPosMenuIngredients` | GET |  |
| `/api/getPosMenuOptions` | GET |  |
| `/api/getPosMenuPackagingChecklist` | GET |  |
| `/api/getPosMenus` | GET |  |
| `/api/getPosMenuScreenConfig` | GET |  |
| `/api/getPosOpenTableTotals` | GET |  |
| `/api/getPosOptionGroups` | GET |  |
| `/api/getPosOrderAuditTrail` | GET |  |
| `/api/getPosOrders` | GET |  |
| `/api/getPosPackagingChecklistByOrder` | GET |  |
| `/api/getPosPaymentAttempts` | GET |  |
| `/api/getPosPaymentMethodItems` | GET |  |
| `/api/getPosPaymentSettings` | GET |  |
| `/api/getPosPrinterSettings` | GET |  |
| `/api/getPosPromoItems` | GET |  |
| `/api/getPosPromos` | GET |  |
| `/api/getPosPromosWithItems` | GET |  |
| `/api/getPosReversalJournals` | GET |  |
| `/api/getPosSettlement` | GET |  |
| `/api/getPosStoreNormalCost` | GET |  |
| `/api/getPosTableLayout` | GET |  |
| `/api/getPosTodaySales` | GET |  |
| `/api/importPosChannelSettlements` | POST |  |
| `/api/importPosMenus` | POST |  |
| `/api/markPosOrderItemServed` | POST |  |
| `/api/pos/kbank/cancel-qr` | OPTIONS, POST |  |
| `/api/pos/kbank/check-status` | OPTIONS, POST |  |
| `/api/pos/kbank/generate-qr` | OPTIONS, POST |  |
| `/api/pos/kbank/settlement` | OPTIONS, POST |  |
| `/api/pos/kbank/void-for-order` | OPTIONS, POST |  |
| `/api/pos/kbank/void-payment` | OPTIONS, POST |  |
| `/api/pos/member-tier-rates` | GET |  |
| `/api/posAdvanceCheckIn` | POST |  |
| `/api/posBusinessDaySettings` | GET, POST |  |
| `/api/posCancelReasonSummary` | GET |  |
| `/api/posCardReconcile` | GET |  |
| `/api/posCashReconcile` | GET |  |
| `/api/posCryptoAttempt` | GET, POST |  |
| `/api/posCryptoPaymentSettings` | GET, POST |  |
| `/api/posDeliveryAppReconcile` | GET |  |
| `/api/posDepositDispose` | POST |  |
| `/api/posDepositReceive` | POST |  |
| `/api/posDineInTableActions` | POST |  |
| `/api/posKbankQrReconcile` | GET |  |
| `/api/posMenuCategories` | GET, POST |  |
| `/api/posMenuImageProxy` | GET |  |
| `/api/posPromoSchemaStatus` | GET |  |
| `/api/posRealtimeRevenueDashboard` | GET |  |
| `/api/posSalesByChannel` | GET |  |
| `/api/posSalesByDeliveryApp` | GET |  |
| `/api/posSalesByMenu` | GET |  |
| `/api/posSalesByMenuHierarchy` | GET |  |
| `/api/posSalesByPayment` | GET |  |
| `/api/posSalesByPaymentBreakdown` | GET |  |
| `/api/posSalesByPeriod` | GET |  |
| `/api/posSalesByPromo` | GET |  |
| `/api/posSalesByStore` | GET |  |
| `/api/posSalesByStoreChannel` | GET |  |
| `/api/posSalesDiscountDrillDown` | GET |  |
| `/api/posSalesFilterOptions` | GET |  |
| `/api/posSalesImports` | GET, DELETE |  |
| `/api/posTaxInvoiceRecipients` | GET, POST, PATCH |  |
| `/api/processPosStockDeduction` | POST |  |
| `/api/registerPosDevice` | POST |  |
| `/api/registerPosMainDevice` | POST |  |
| `/api/savePosChannelSettlement` | POST |  |
| `/api/savePosCoupon` | POST |  |
| `/api/savePosDeliveryAppPolicies` | POST |  |
| `/api/savePosDeliveryApps` | POST |  |
| `/api/savePosDeviceRoleLimits` | POST |  |
| `/api/savePosDrawerPin` | POST |  |
| `/api/savePosLinkposTenderRule` | POST |  |
| `/api/savePosMenu` | POST |  |
| `/api/savePosMenuBoard` | POST |  |
| `/api/savePosMenuIngredient` | POST |  |
| `/api/savePosMenuOption` | POST |  |
| `/api/savePosMenuOptionGroupLinks` | POST |  |
| `/api/savePosMenuOptionsBulk` | POST |  |
| `/api/savePosMenuPackagingChecklist` | POST |  |
| `/api/savePosMenuScreenConfig` | POST |  |
| `/api/savePosMenuSortOrders` | POST |  |
| `/api/savePosOptionGroup` | POST |  |
| `/api/savePosOrder` | POST |  |
| `/api/savePosPaymentMethodItem` | POST |  |
| `/api/savePosPaymentSettings` | POST |  |
| `/api/savePosPrinterSettings` | POST |  |
| `/api/savePosPromo` | POST |  |
| `/api/savePosPromoItem` | POST |  |
| `/api/savePosSettlement` | POST |  |
| `/api/savePosTableLayout` | POST |  |
| `/api/setPosMainDevice` | POST |  |
| `/api/syncPosMenuImageCrossChannels` | POST |  |
| `/api/updatePosDeviceDisplayLabel` | POST |  |
| `/api/updatePosMenuSoldOut` | POST |  |
| `/api/updatePosOrder` | POST |  |
| `/api/updatePosOrderStatus` | POST |  |
| `/api/verifyPosDrawerPin` | POST |  |

### member-portal

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/member-portal/admin/content` | GET, POST, DELETE |  |
| `/api/member-portal/admin/settings/contact-links` | GET, POST |  |
| `/api/member-portal/admin/settings/delivery-links` | GET, POST |  |
| `/api/member-portal/admin/settings/design` | GET, POST |  |
| `/api/member-portal/admin/settings/home-privileges` | GET, POST |  |
| `/api/member-portal/admin/settings/pickup` | GET, POST |  |
| `/api/member-portal/admin/settings/prepay` | GET, POST |  |
| `/api/member-portal/admin/settings/prepay/stats` | GET |  |
| `/api/member-portal/admin/settings/signup-benefits` | GET, POST |  |
| `/api/member-portal/admin/settings/signup-stores/goals` | GET, POST |  |
| `/api/member-portal/admin/settings/signup-stores/stats` | GET |  |
| `/api/member-portal/admin/settings/signup-stores/stats/export` | GET |  |
| `/api/member-portal/admin/settings/stamp-card` | GET, POST |  |
| `/api/member-portal/admin/settings/stamp-card/adjust` | POST |  |
| `/api/member-portal/admin/settings/stamp-card/stats` | GET, POST |  |
| `/api/member-portal/admin/settings/stamp-food-image` | GET, POST |  |
| `/api/member-portal/admin/stores` | GET, POST, DELETE |  |
| `/api/member-portal/auth/line/callback` | GET |  |
| `/api/member-portal/auth/line/start` | GET |  |
| `/api/member-portal/auth/logout` | POST |  |
| `/api/member-portal/auth/phone-birth` | GET, POST |  |
| `/api/member-portal/auth/request-otp` | POST |  |
| `/api/member-portal/auth/signup` | POST |  |
| `/api/member-portal/auth/verify-otp` | POST |  |
| `/api/member-portal/content` | GET |  |
| `/api/member-portal/cron/expire-pending-payments` | GET | cron `*/10 * * * *` |
| `/api/member-portal/cron/reconcile-pending-payments` | GET | cron `*/15 * * * *` |
| `/api/member-portal/delivery-links` | GET |  |
| `/api/member-portal/me` | GET |  |
| `/api/member-portal/me/complaints` | GET, POST |  |
| `/api/member-portal/me/complaints/photo/presign` | POST |  |
| `/api/member-portal/me/coupon-offers` | GET |  |
| `/api/member-portal/me/coupons` | GET |  |
| `/api/member-portal/me/coupons/claim` | POST |  |
| `/api/member-portal/me/coupons/redeem-code` | POST |  |
| `/api/member-portal/me/dashboard` | GET |  |
| `/api/member-portal/me/join-store` | POST |  |
| `/api/member-portal/me/link-phone-birth` | POST |  |
| `/api/member-portal/me/points` | GET |  |
| `/api/member-portal/me/stamps` | GET |  |
| `/api/member-portal/me/stamps/history` | GET |  |
| `/api/member-portal/me/visits` | GET |  |
| `/api/member-portal/orders` | GET, POST |  |
| `/api/member-portal/orders/[id]` | GET |  |
| `/api/member-portal/orders/[id]/pay/qr` | POST |  |
| `/api/member-portal/orders/[id]/pay/status` | GET |  |
| `/api/member-portal/orders/[id]/reorder-items` | GET |  |
| `/api/member-portal/orders/checkout-preview` | POST |  |
| `/api/member-portal/preferences/favorite-store` | GET, POST |  |
| `/api/member-portal/public-config` | GET |  |
| `/api/member-portal/public/complaints` | POST |  |
| `/api/member-portal/public/complaints/photo/presign` | POST |  |
| `/api/member-portal/register` | POST |  |
| `/api/member-portal/signup-stores` | GET |  |
| `/api/member-portal/stores` | GET |  |
| `/api/member-portal/tiers` | GET |  |

### interior

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/deleteInteriorDirectPurchase` | POST |  |
| `/api/deleteInteriorExpenseItem` | POST |  |
| `/api/deleteInteriorFile` | POST |  |
| `/api/deleteInteriorKitchenItem` | POST |  |
| `/api/deleteInteriorLayoutItem` | POST |  |
| `/api/deleteInteriorMaterialSpec` | POST |  |
| `/api/deleteInteriorProject` | POST |  |
| `/api/deleteInteriorScheduleItem` | POST |  |
| `/api/deleteInteriorSpecification` | POST |  |
| `/api/deleteInteriorVendorDirectory` | POST |  |
| `/api/deleteInteriorVendorTrack` | POST |  |
| `/api/deleteInteriorWorkPackage` | POST |  |
| `/api/getInteriorDashboardSummary` | GET |  |
| `/api/getInteriorDirectPurchases` | GET |  |
| `/api/getInteriorExpenseItems` | GET |  |
| `/api/getInteriorFiles` | GET |  |
| `/api/getInteriorKitchenItems` | GET |  |
| `/api/getInteriorLayoutEditorPrefs` | GET |  |
| `/api/getInteriorLayoutItems` | GET |  |
| `/api/getInteriorLayoutZoneBackground` | GET |  |
| `/api/getInteriorMaterialSpecs` | GET |  |
| `/api/getInteriorProjects` | GET |  |
| `/api/getInteriorSchedule` | GET |  |
| `/api/getInteriorSpecifications` | GET |  |
| `/api/getInteriorVendorDirectory` | GET |  |
| `/api/getInteriorVendorTracks` | GET |  |
| `/api/getInteriorWorkPackages` | GET |  |
| `/api/saveInteriorDirectPurchase` | POST |  |
| `/api/saveInteriorExpenseItem` | POST |  |
| `/api/saveInteriorKitchenItem` | POST |  |
| `/api/saveInteriorLayoutEditorPrefs` | POST |  |
| `/api/saveInteriorLayoutItem` | POST |  |
| `/api/saveInteriorLayoutZoneBackground` | POST |  |
| `/api/saveInteriorMaterialSpec` | POST |  |
| `/api/saveInteriorProject` | POST |  |
| `/api/saveInteriorProjectFile` | POST |  |
| `/api/saveInteriorScheduleItem` | POST |  |
| `/api/saveInteriorSpecification` | POST |  |
| `/api/saveInteriorVendorDirectory` | POST |  |
| `/api/saveInteriorVendorTrack` | POST |  |
| `/api/saveInteriorWorkPackage` | POST |  |

### store

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/addStoreRepairProgressLog` | POST |  |
| `/api/deleteStorePurchaseJournal` | POST |  |
| `/api/getStoreActionAssignees` | GET |  |
| `/api/getStoreActionItems` | GET |  |
| `/api/getStoreActionLogs` | GET |  |
| `/api/getStoreActionScorecard` | GET |  |
| `/api/getStoreGpsCheck` | GET |  |
| `/api/getStoreJobHeadcount` | GET |  |
| `/api/getStoreList` | OPTIONS, GET |  |
| `/api/getStoreOpsAlertSummary` | GET |  |
| `/api/getStorePurchaseJournal` | GET |  |
| `/api/getStoreRepairProgressLogs` | GET |  |
| `/api/getStoreRepairTicketList` | GET |  |
| `/api/getStoreVisitHistory` | GET |  |
| `/api/getStoreVisitRecords` | GET |  |
| `/api/getStoreVisitStats` | GET |  |
| `/api/getStoreVisitTodaySnapshot` | GET |  |
| `/api/saveStoreActionItem` | POST |  |
| `/api/saveStoreActionItems` | POST |  |
| `/api/saveStoreJobHeadcount` | POST |  |
| `/api/saveStoreRepairTicket` | POST |  |
| `/api/storeActionDailyPlan` | GET, POST |  |
| `/api/storeTaxFilingProfiles` | GET, POST |  |
| `/api/submitStoreVisit` | POST |  |
| `/api/updateStoreActionItem` | POST |  |
| `/api/updateStoreRepairTicket` | POST |  |

### marketing

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/deleteMarketingAd` | POST |  |
| `/api/deleteMarketingCampaign` | POST |  |
| `/api/deleteMarketingInfluencer` | POST |  |
| `/api/deleteMarketingInfluencerProfile` | POST |  |
| `/api/deleteMarketingMaterial` | POST |  |
| `/api/deleteMarketingMaterialDeployment` | POST |  |
| `/api/deleteMarketingMaterialGift` | POST |  |
| `/api/exportMarketingMaterialGifts` | GET |  |
| `/api/importMarketingExcel` | POST |  |
| `/api/marketingAds` | GET, POST |  |
| `/api/marketingCampaignCollabDetail` | POST |  |
| `/api/marketingCampaignCollabManagementToggle` | POST |  |
| `/api/marketingCampaignCosts` | GET |  |
| `/api/marketingCampaignDesignDates` | POST |  |
| `/api/marketingCampaignResults` | GET |  |
| `/api/marketingCampaigns` | GET, POST |  |
| `/api/marketingInfluencerProfiles` | GET, POST |  |
| `/api/marketingInfluencers` | GET, POST |  |
| `/api/marketingInfluencerSalesLift` | GET |  |
| `/api/marketingInfluencersLinkCampaign` | POST |  |
| `/api/marketingMaterialDeployments` | GET, POST |  |
| `/api/marketingMaterialGifts` | GET, POST |  |
| `/api/marketingMaterialLookup` | GET |  |
| `/api/marketingMaterials` | GET, POST |  |
| `/api/marketingMaterialStoreChecks` | GET, POST |  |

### qr-table

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/qr-table/admin` | OPTIONS, GET, PUT, POST |  |
| `/api/qr-table/bill/pay/qr` | OPTIONS, POST |  |
| `/api/qr-table/bill/pay/status` | OPTIONS, GET |  |
| `/api/qr-table/cart/submit` | OPTIONS, POST |  |
| `/api/qr-table/cron/expire-sessions` | GET | cron `*/15 * * * *` |
| `/api/qr-table/entry/pay/qr` | OPTIONS, POST |  |
| `/api/qr-table/entry/pay/status` | OPTIONS, GET |  |
| `/api/qr-table/extras/pay/qr` | OPTIONS, POST |  |
| `/api/qr-table/extras/pay/status` | OPTIONS, GET |  |
| `/api/qr-table/member/link` | OPTIONS, POST |  |
| `/api/qr-table/menus` | OPTIONS, GET |  |
| `/api/qr-table/order` | OPTIONS, GET |  |
| `/api/qr-table/session` | OPTIONS, GET |  |
| `/api/qr-table/session/call-staff` | OPTIONS, POST |  |
| `/api/qr-table/session/claim` | OPTIONS, POST |  |
| `/api/qr-table/session/open` | OPTIONS, POST |  |
| `/api/qr-table/staff/ack-call` | OPTIONS, POST |  |
| `/api/qr-table/staff/adjust-guests` | OPTIONS, POST |  |
| `/api/qr-table/staff/confirm-entry-postpay` | OPTIONS, POST |  |
| `/api/qr-table/staff/open-session` | OPTIONS, POST |  |
| `/api/qr-table/staff/print-table-qr` | OPTIONS, POST |  |
| `/api/qr-table/staff/rotate-token` | OPTIONS, POST |  |
| `/api/qr-table/staff/session-by-table` | OPTIONS, GET |  |
| `/api/qr-table/staff/sessions-map` | OPTIONS, GET |  |

### bank

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/addBankTransaction` | POST |  |
| `/api/addBankTransactionsBulk` | POST |  |
| `/api/deleteBankAccount` | POST |  |
| `/api/deleteBankMemoRule` | POST |  |
| `/api/getBankAccountAuditLogs` | GET |  |
| `/api/getBankAccounts` | GET |  |
| `/api/getBankMemoMappingRules` | GET |  |
| `/api/getBankMemoRules` | GET |  |
| `/api/getBankTransactionInboundLinks` | GET |  |
| `/api/getBankTransactions` | GET |  |
| `/api/getBankWithdrawalsForCardBillQueueMark` | GET |  |
| `/api/getBankWithdrawalsForPettyQueueMark` | GET |  |
| `/api/lookupBankTransaction` | GET |  |
| `/api/markBankTransactionForCardBill` | POST |  |
| `/api/markBankTransactionForPettyCash` | POST |  |
| `/api/saveBankAccount` | POST |  |
| `/api/saveBankMemoRule` | POST |  |
| `/api/saveBankTransactionInboundLinks` | POST |  |
| `/api/updateBankTransaction` | POST |  |
| `/api/updateBankTransactionInvoice` | POST |  |

### members

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/members` | GET, POST |  |
| `/api/members/[id]` | GET, PATCH |  |
| `/api/members/[id]/link-line` | POST |  |
| `/api/members/[id]/merge` | POST |  |
| `/api/members/[id]/unlink-line` | POST |  |
| `/api/members/cron/expire-points` | GET | cron `30 19 * * *` |
| `/api/members/cursor` | GET |  |
| `/api/members/line` | GET |  |
| `/api/members/line-import` | POST |  |
| `/api/members/line-import/cron` | GET | cron `5 18 * * *` |
| `/api/members/line-messaging-status` | GET |  |
| `/api/members/line-reach-stats` | GET |  |
| `/api/members/line-register` | POST |  |
| `/api/members/line-reset` | POST |  |
| `/api/members/line-sync` | POST |  |
| `/api/members/point-line-notify` | GET, POST |  |
| `/api/members/points-search` | GET |  |

### crm

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/crm/campaigns` | GET, POST |  |
| `/api/crm/campaigns/[id]/results` | GET |  |
| `/api/crm/campaigns/[id]/run` | POST |  |
| `/api/crm/campaigns/preview` | POST |  |
| `/api/crm/coupon-promo-codes` | GET, POST |  |
| `/api/crm/coupon-promo-codes/[id]` | PATCH, DELETE |  |
| `/api/crm/coupon-stats` | GET |  |
| `/api/crm/line-targets` | GET |  |
| `/api/crm/member-notes` | GET, POST |  |
| `/api/crm/member-visit-analysis` | GET |  |
| `/api/crm/referrals` | POST |  |
| `/api/crm/rfm` | GET |  |
| `/api/crm/segment-counts` | GET |  |
| `/api/crm/segments` | GET |  |
| `/api/crm/store-stats` | GET |  |
| `/api/crm/summary` | GET |  |

### grab

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getGrabStoreIntegrations` | GET |  |
| `/api/grab/cancelOrder` | PUT |  |
| `/api/grab/cancelOrderByStore` | PUT |  |
| `/api/grab/cancelPromoCampaign` | POST |  |
| `/api/grab/createSelfServeJourney` | POST |  |
| `/api/grab/debugEnvConfig` | GET |  |
| `/api/grab/debugMenuPromoPricing` | GET |  |
| `/api/grab/debugMenuSyncState` | GET |  |
| `/api/grab/debugPromoCampaigns` | GET |  |
| `/api/grab/editOrder` | PUT |  |
| `/api/grab/getStoreStatus` | GET |  |
| `/api/grab/listOrders` | GET |  |
| `/api/grab/markOrderReady` | POST |  |
| `/api/grab/pauseStore` | PUT |  |
| `/api/grab/updateMenuNotification` | POST |  |
| `/api/grab/updateMenuRecord` | PUT |  |

### lineOa

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/lineOa/group-v2/groups` | GET, POST |  |
| `/api/lineOa/group-v2/groups/[id]` | GET, PATCH, DELETE |  |
| `/api/lineOa/group-v2/groups/[id]/grouped-users` | POST |  |
| `/api/lineOa/group-v2/groups/[id]/grouped-users/[requestId]/result` | GET |  |
| `/api/lineOa/groups` | GET, POST |  |
| `/api/lineOa/groups/[id]` | GET, PATCH, DELETE |  |
| `/api/lineOa/groups/[id]/users/associate` | POST |  |
| `/api/lineOa/groups/[id]/users/dissociate` | POST |  |
| `/api/lineOa/groups/[id]/users/operations/[requestId]` | GET |  |
| `/api/lineOa/segments` | GET |  |
| `/api/lineOa/segments/[segmentId]` | GET |  |
| `/api/lineOa/segments/[segmentId]/create-oa-audience` | POST |  |
| `/api/lineOa/segments/[segmentId]/create-oa-audience/[id]` | GET |  |
| `/api/lineOa/segments/[segmentId]/user-list-csv` | POST |  |
| `/api/lineOa/segments/[segmentId]/user-list-csv/[id]` | GET |  |

### saas

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getSaasTenantSettings` | GET |  |
| `/api/saas/enabled-modules` | GET |  |
| `/api/saasAdminDevices` | GET, POST, DELETE |  |
| `/api/saasAdminEmployees` | GET, PATCH, POST |  |
| `/api/saasAdminIntegrations` | GET, POST |  |
| `/api/saasAdminModuleInvoice` | GET, POST |  |
| `/api/saasAdminModulePricingCatalog` | GET, POST |  |
| `/api/saasAdminOnboardingStatus` | GET, POST |  |
| `/api/saasAdminPartners` | GET, POST |  |
| `/api/saasAdminPartnerSettlement` | GET, POST |  |
| `/api/saasAdminScope` | GET |  |
| `/api/saasAdminStores` | GET, PATCH, POST |  |
| `/api/saasAdminTenantExport` | GET |  |
| `/api/saasBootstrapTenantLogin` | POST |  |
| `/api/saveSaasTenantSettings` | POST |  |

### accounting

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/accounting/backfill` | POST |  |
| `/api/exportAccountingComplianceAuditCsv` | GET |  |
| `/api/getAccountingComplianceAuditLogs` | GET |  |
| `/api/getAccountingComplianceAuditTrend` | GET |  |
| `/api/getAccountingFilingPreferences` | GET |  |
| `/api/getAccountingPeriodCloseStatus` | GET |  |
| `/api/getAccountingPeriods` | GET |  |
| `/api/getAccountingReconcile` | GET |  |
| `/api/getAccountingReconciliation` | GET |  |
| `/api/getAccountingWorkflowReminders` | GET |  |
| `/api/getAccountingWorkflowStatus` | GET |  |
| `/api/saveAccountingFilingPreferences` | POST |  |
| `/api/saveAccountingWorkflowStatus` | POST |  |
| `/api/setAccountingPeriodClosed` | POST |  |

### attendance

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/checkAttendanceQrDevice` | GET |  |
| `/api/createAttendanceFromSchedule` | POST |  |
| `/api/getAttendanceList` | GET |  |
| `/api/getAttendanceNoRecordList` | GET |  |
| `/api/getAttendancePendingList` | GET |  |
| `/api/getAttendanceQrDevices` | GET |  |
| `/api/getAttendanceQrDisplay` | GET |  |
| `/api/getAttendanceQrMode` | GET |  |
| `/api/getAttendanceRecordsAdmin` | GET |  |
| `/api/processAttendanceApproval` | POST |  |
| `/api/registerAttendanceQrDevice` | POST, OPTIONS |  |
| `/api/saveAttendanceQrMode` | POST |  |
| `/api/submitAttendance` | POST |  |

### expense

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/addExpenseAccrual` | POST |  |
| `/api/approveExpenseAccrual` | POST |  |
| `/api/deleteExpenseAccrualsWithoutStore` | POST |  |
| `/api/deleteExpenseRegisterItem` | POST |  |
| `/api/getExpensePaymentPlan` | GET |  |
| `/api/getExpenseRegisterList` | GET |  |
| `/api/getExpenseSearchOverview` | GET |  |
| `/api/registerExpenseFromBankTransaction` | POST |  |
| `/api/syncExpenseInputVatLedgers` | POST |  |
| `/api/updateExpenseAccrual` | POST |  |
| `/api/updateExpenseAccrualInvoice` | POST |  |
| `/api/updateExpenseAccrualPayeeBank` | POST |  |
| `/api/updateExpenseRegisterItem` | POST |  |

### ai

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/ai/actions/approve` | POST |  |
| `/api/ai/actions/history` | GET |  |
| `/api/ai/actions/propose` | POST |  |
| `/api/ai/ask` | POST |  |
| `/api/ai/ask/stream` | POST |  |
| `/api/ai/conversations` | GET, POST |  |
| `/api/ai/drafts` | GET |  |
| `/api/ai/external/sync` | POST |  |
| `/api/ai/health` | GET |  |
| `/api/ai/metrics` | GET |  |
| `/api/ai/module-status` | GET |  |
| `/api/ai/store-ops` | GET |  |

### notice

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/applyNoticeUnreadAllowanceExclusion` | GET, POST |  |
| `/api/confirmNoticeRead` | POST |  |
| `/api/deleteNoticeAdmin` | POST |  |
| `/api/getNoticeOptions` | GET |  |
| `/api/getNoticeReadDetail` | GET |  |
| `/api/getNoticeReaderStats` | GET |  |
| `/api/getNoticeSenders` | GET |  |
| `/api/getNoticeUnreadForEmployee` | GET |  |
| `/api/noticeTemplates` | GET, POST, DELETE |  |
| `/api/sendNotice` | POST |  |
| `/api/updateNoticeAdmin` | POST |  |

### work

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/deleteWorkLogItem` | POST |  |
| `/api/getWorkLogAudit` | GET |  |
| `/api/getWorkLogData` | GET |  |
| `/api/getWorkLogEmployeeInsights` | GET |  |
| `/api/getWorkLogManagerReport` | GET |  |
| `/api/getWorkLogOfficeOptions` | GET |  |
| `/api/getWorkLogPeriodSummary` | GET |  |
| `/api/getWorkLogStaffList` | GET |  |
| `/api/getWorkLogWeekly` | GET |  |
| `/api/saveWorkLogData` | POST |  |
| `/api/updateWorkLogPriority` | POST |  |

### company

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/deleteCompanyHybridDocument` | POST |  |
| `/api/deleteCompanyHybridDocumentCategory` | POST |  |
| `/api/getCompanyHybridDocumentCategories` | GET |  |
| `/api/getCompanyHybridDocumentEvents` | GET |  |
| `/api/getCompanyHybridDocuments` | GET |  |
| `/api/getCompanyHybridDocumentsSummary` | GET |  |
| `/api/issueCompanyHybridDocumentWatermark` | POST |  |
| `/api/recordCompanyHybridDocumentView` | POST |  |
| `/api/saveCompanyHybridDocument` | POST |  |
| `/api/saveCompanyHybridDocumentCategory` | POST |  |

### evaluation

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/addEvaluationItem` | POST |  |
| `/api/deleteEvaluationItem` | POST |  |
| `/api/deleteEvaluationResult` | POST |  |
| `/api/getEvaluationAnalytics` | GET |  |
| `/api/getEvaluationDistinctStores` | GET |  |
| `/api/getEvaluationHistory` | GET |  |
| `/api/getEvaluationItems` | GET |  |
| `/api/getEvaluationResultById` | GET |  |
| `/api/saveEvaluationResult` | POST |  |
| `/api/updateEvaluationItems` | POST |  |

### order

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getOrderFilterOptions` | GET |  |
| `/api/getOrderReceivePhoto` | GET |  |
| `/api/processOrder` | POST |  |
| `/api/processOrderDecision` | POST |  |
| `/api/processOrderReceive` | POST |  |
| `/api/syncOrderReceivable` | POST |  |
| `/api/syncOrderReceivableFromOutbound` | POST |  |
| `/api/updateOrderCart` | POST |  |
| `/api/updateOrderDeliveryDates` | POST |  |
| `/api/updateOrderDeliveryStatus` | POST |  |

### admin

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/adminHelpHandover` | GET, POST |  |
| `/api/deleteAdminEmployee` | POST |  |
| `/api/getAdminDashboardStats` | GET |  |
| `/api/getAdminDataLimits` | GET |  |
| `/api/getAdminEmployeeList` | GET |  |
| `/api/getAdminEmployeeMedia` | GET |  |
| `/api/getAdminOrders` | GET |  |
| `/api/getAdminRecentActivity` | GET |  |
| `/api/saveAdminEmployee` | POST |  |

### card

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/deleteCardAccount` | POST |  |
| `/api/deleteCardTransaction` | POST |  |
| `/api/getCardAccounts` | GET |  |
| `/api/getCardBillAllocation` | GET |  |
| `/api/getCardTransactions` | GET |  |
| `/api/registerCardExpenseFromBankTransaction` | POST |  |
| `/api/saveCardAccount` | POST |  |
| `/api/saveCardBillAllocation` | POST |  |
| `/api/saveCardTransaction` | POST |  |

### daily

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/closeDailyPlan` | POST |  |
| `/api/dailyPlanVisits` | GET, POST |  |
| `/api/generateDailyPlans` | POST |  |
| `/api/getDailyPlanBoard` | GET |  |
| `/api/getDailyPlanTimeSummary` | GET |  |
| `/api/getDailyPlanWeek` | GET |  |
| `/api/saveDailyPlanAssignment` | POST |  |
| `/api/submitDailyClose` | POST |  |
| `/api/updateDailyPlanItem` | POST |  |

### item

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/deleteItem` | POST |  |
| `/api/deleteItemCategory` | POST |  |
| `/api/getItemCategories` | GET |  |
| `/api/getItemCategorySettings` | GET |  |
| `/api/getItemVendors` | GET |  |
| `/api/saveItem` | POST |  |
| `/api/saveItemCategory` | POST |  |
| `/api/saveItemVendors` | POST |  |
| `/api/updateItemOrderDisabled` | POST |  |

### payroll

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getPayrollCalc` | GET |  |
| `/api/getPayrollPreview` | GET |  |
| `/api/getPayrollRecords` | GET |  |
| `/api/getPayrollWhtTinGaps` | GET |  |
| `/api/payrollCycle` | GET, POST |  |
| `/api/payrollHazGradeRules` | GET, POST |  |
| `/api/savePayroll` | POST |  |
| `/api/sendPayrollStatementEmail` | POST |  |
| `/api/syncPayrollSsoExpenseAccruals` | POST |  |

### petty

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/addPettyCashTransaction` | POST |  |
| `/api/deletePettyCashTransaction` | POST |  |
| `/api/getPettyCashList` | GET |  |
| `/api/getPettyCashMonthDetail` | GET |  |
| `/api/getPettyCashOptions` | GET |  |
| `/api/getPettyCashSummary` | GET |  |
| `/api/registerPettyReplenishFromBankTransaction` | POST |  |
| `/api/updatePettyCashTransaction` | POST |  |
| `/api/updatePettyCashTransactionInvoice` | POST |  |

### purchase

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/deletePurchaseAccrualsByVendor` | POST |  |
| `/api/getPurchaseLocations` | GET |  |
| `/api/getPurchaseOrders` | GET |  |
| `/api/processPurchaseOrderApproval` | POST |  |
| `/api/processPurchaseOrderCancel` | POST |  |
| `/api/purchaseTaxInvoices` | GET, POST |  |
| `/api/registerPurchaseFromBankTransaction` | POST |  |
| `/api/savePurchaseOrder` | POST |  |
| `/api/updatePurchaseOrderInvoice` | POST |  |

### income

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/exportIncomeExpenseClosingAuditCsv` | GET |  |
| `/api/getIncomeExpenseClosingPreview` | GET |  |
| `/api/getIncomeStatement` | GET |  |
| `/api/getIncomeStatementExpenseDrillDown` | GET |  |
| `/api/getIncomeStatementPurchaseDrillDown` | GET |  |
| `/api/incomeStatementOverrides` | GET, POST |  |
| `/api/postIncomeExpenseClosing` | POST |  |
| `/api/saveIncomeExpenseClosingDraft` | POST |  |

### meta

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/meta/ad-accounts` | GET, POST |  |
| `/api/meta/auto-map` | POST |  |
| `/api/meta/connection` | GET |  |
| `/api/meta/disconnect` | POST |  |
| `/api/meta/oauth/callback` | GET |  |
| `/api/meta/oauth/start` | GET |  |
| `/api/meta/pages` | GET, POST |  |
| `/api/meta/sync` | POST |  |

### my

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getMyAttendanceSummary` | GET |  |
| `/api/getMyDailyPlan` | GET |  |
| `/api/getMyHrPolicies` | GET, POST |  |
| `/api/getMyLeaveInfo` | GET |  |
| `/api/getMyNotices` | GET, POST |  |
| `/api/getMyOrderHistory` | GET |  |
| `/api/getMyPayroll` | GET |  |
| `/api/getMyUsageHistory` | GET |  |

### receivable

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/addReceivableStoreCredit` | POST |  |
| `/api/getReceivableOrders` | GET |  |
| `/api/getReceivablePayableList` | GET |  |
| `/api/getReceivablePayableSummary` | GET |  |
| `/api/linkReceivableFromBankTransaction` | POST |  |
| `/api/registerReceivableSurplusFromBankTx` | POST |  |
| `/api/unlinkReceivableFromBankTransaction` | POST |  |
| `/api/updateReceivableReceiveCheck` | POST |  |

### inbound

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/deleteInboundBatch` | POST |  |
| `/api/getInboundBatch` | GET |  |
| `/api/getInboundBatchesForLink` | GET |  |
| `/api/getInboundForStore` | GET |  |
| `/api/getInboundHistory` | GET |  |
| `/api/registerInboundBatch` | POST |  |
| `/api/updateInboundBatch` | POST |  |

### leave

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getLeaveApprovers` | GET |  |
| `/api/getLeavePendingList` | GET |  |
| `/api/getLeaveStats` | GET |  |
| `/api/processLeaveApproval` | POST |  |
| `/api/requestLeave` | POST |  |
| `/api/saveLeaveApprovers` | POST, OPTIONS |  |
| `/api/uploadLeaveCertificate` | POST |  |

### tax

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getTaxBookEntries` | GET |  |
| `/api/getTaxEntityScopes` | GET |  |
| `/api/getTaxInvoiceDepositSeq` | OPTIONS, GET, POST |  |
| `/api/getTaxManagementBridge` | GET |  |
| `/api/getTaxReadinessChecklist` | GET |  |
| `/api/postTaxBookEntry` | POST |  |
| `/api/updateTaxBookVoucherLines` | POST |  |

### webhooks/grab

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/webhooks/grab/menu-sync-state` | POST | webhook |
| `/api/webhooks/grab/merchant/menu` | GET | webhook |
| `/api/webhooks/grab/oauth/token` | POST | webhook |
| `/api/webhooks/grab/order/state` | PUT | webhook |
| `/api/webhooks/grab/orders` | POST | webhook |
| `/api/webhooks/grab/pushGrabMenu` | POST | webhook |
| `/api/webhooks/grab/pushIntegrationStatus` | POST | webhook |

### invoice

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getInvoiceData` | GET |  |
| `/api/getInvoiceOrderBillToCandidates` | OPTIONS, POST |  |
| `/api/getInvoicePrintOverrides` | POST |  |
| `/api/getInvoiceSettings` | GET |  |
| `/api/updateInvoicePrintOverrides` | POST |  |
| `/api/updateInvoiceSettings` | POST |  |

### tiktok

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/tiktok/advertisers` | GET, POST |  |
| `/api/tiktok/connection` | GET |  |
| `/api/tiktok/disconnect` | POST |  |
| `/api/tiktok/oauth/callback` | GET |  |
| `/api/tiktok/oauth/start` | GET |  |
| `/api/tiktok/sync` | POST |  |

### debug

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/debug-sauces` | GET |  |
| `/api/debugPrintProbe` | POST |  |
| `/api/debugPushStatus` | GET |  |
| `/api/debugSauces` | GET |  |
| `/api/debugSupabaseKey` | GET |  |

### fixed

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/deleteFixedExpense` | POST |  |
| `/api/getFixedAssets` | GET |  |
| `/api/getFixedExpenses` | GET |  |
| `/api/saveFixedAsset` | POST |  |
| `/api/saveFixedExpense` | POST |  |

### hr

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/confirmHrPolicyRead` | POST |  |
| `/api/getHrPolicies` | GET |  |
| `/api/getHrPolicyReadDetail` | GET |  |
| `/api/getHrPolicyReaderStats` | GET |  |
| `/api/saveHrPolicy` | POST |  |

### ops

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/ops/alerts` | GET |  |
| `/api/ops/hq-summary` | GET |  |
| `/api/ops/intercompany-vat-reconcile` | GET |  |
| `/api/ops/kpi` | GET |  |
| `/api/ops/pos-health-alert` | POST |  |

### outbound

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/deleteOutbound` | POST, OPTIONS |  |
| `/api/getOutboundByWarehouse` | GET |  |
| `/api/getOutboundStoreItemSummary` | GET |  |
| `/api/getOutboundStoreMonthMatrix` | GET |  |
| `/api/markOutboundInvoicesPrinted` | POST |  |

### price

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/backfillPriceHistory` | POST |  |
| `/api/cancelPriceSchedule` | POST |  |
| `/api/getPriceHistory` | GET |  |
| `/api/getPriceSchedules` | GET |  |
| `/api/savePriceSchedule` | POST |  |

### vendors

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getVendors` | GET |  |
| `/api/getVendorsForPurchase` | GET |  |
| `/api/getVendorsForRelated` | GET |  |
| `/api/getVendorsForSales` | GET |  |
| `/api/importVendorsFromCsv` | POST |  |

### warning

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/deleteWarningLetterRegistry` | POST |  |
| `/api/getWarningLetterRegistry` | GET |  |
| `/api/getWarningLettersFromEvaluations` | GET |  |
| `/api/saveWarningLetterRegistry` | POST |  |
| `/api/warningLetterRegistryAction` | POST |  |

### webhooks/shopeefood

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/webhooks/shopeefood/[indicator]/gettoken` | POST | webhook |
| `/api/webhooks/shopeefood/[indicator]/menu/notification/result` | POST | webhook |
| `/api/webhooks/shopeefood/[indicator]/order/status` | POST | webhook |
| `/api/webhooks/shopeefood/[indicator]/orders` | POST | webhook |
| `/api/webhooks/shopeefood/[indicator]/vendor-menu` | GET | webhook |

### checklist

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/addChecklistItem` | POST |  |
| `/api/deleteChecklistItem` | POST |  |
| `/api/getChecklistItems` | GET |  |
| `/api/updateChecklistItems` | POST |  |

### cron

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/cron/auto-notices` | GET | cron `0 * * * *` |
| `/api/cron/marketing-ads-sync` | GET | cron `0 2 * * 1` |
| `/api/cron/saas-auto-suspend` | GET | cron `15 17 * * *` |
| `/api/cron/work-log-reminders` | GET |  |

### employee

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/employeeJobCatalog` | GET, POST |  |
| `/api/getEmployeeInputAudit` | GET |  |
| `/api/getEmployeeLatestGrades` | GET |  |
| `/api/getEmployeeSalaryHistory` | GET |  |

### items

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getItems` | GET |  |
| `/api/getItemsByVendor` | GET |  |
| `/api/importItemsFromCsv` | POST |  |
| `/api/importItemsFromExcel` | POST |  |

### kt20k

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/exportKt20kCsv` | GET |  |
| `/api/getKt20kSettings` | GET |  |
| `/api/getKt20kSummary` | GET |  |
| `/api/saveKt20kSettings` | POST |  |

### member

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/member-coupons` | GET, POST |  |
| `/api/member-points` | GET |  |
| `/api/member-tiers` | GET, POST |  |
| `/api/member-visits` | GET |  |

### pp30

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/exportPp30RdPrepTxt` | GET |  |
| `/api/getPp30ChannelSales` | GET |  |
| `/api/getPp30SalesAdjustment` | GET |  |
| `/api/savePp30SalesAdjustment` | POST |  |

### today

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getTodayAttendanceSummary` | GET |  |
| `/api/getTodayAttendanceTypes` | GET |  |
| `/api/getTodayMyVisits` | GET, POST |  |
| `/api/getTodaySchedule` | GET |  |

### validate

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/validatePnd1RdPrep` | GET |  |
| `/api/validatePnd3Pnd53` | GET |  |
| `/api/validatePosCoupon` | GET |  |
| `/api/validatePosCoupons` | POST |  |

### account

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/deleteAccountSubject` | POST |  |
| `/api/getAccountSubjects` | GET |  |
| `/api/saveAccountSubject` | POST |  |

### check

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/deleteCheckHistory` | POST |  |
| `/api/getCheckHistory` | GET |  |
| `/api/saveCheckResult` | POST |  |

### complaint

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getComplaintLogList` | GET |  |
| `/api/saveComplaintLog` | POST |  |
| `/api/updateComplaintLog` | POST |  |

### corporate

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/exportCorporateTaxPackageCsv` | GET |  |
| `/api/getCorporateTaxComputation` | GET |  |
| `/api/saveCorporateTaxAdjustments` | POST |  |

### member-tiers

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/member-tiers/policy` | GET, POST |  |
| `/api/member-tiers/recalculate` | POST |  |
| `/api/member-tiers/recalculate-batch` | POST |  |

### menu

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getMenuCost` | GET |  |
| `/api/getMenuPermission` | GET |  |
| `/api/setMenuPermission` | POST |  |

### payable

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getPayableTransactionItems` | GET |  |
| `/api/linkPayableSettlement` | POST, OPTIONS |  |
| `/api/unlinkPayableSettlement` | POST, OPTIONS |  |

### po

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getPoBillingDraft` | GET |  |
| `/api/getPoBillingSettings` | GET |  |
| `/api/savePoBillingSettings` | POST |  |

### posPrintJobs

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/posPrintJobs/claimKitchen` | POST |  |
| `/api/posPrintJobs/claimTableQr` | POST |  |
| `/api/posPrintJobs/markKitchen` | POST |  |

### push

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/checkPushToken` | GET |  |
| `/api/deletePushToken` | POST |  |
| `/api/savePushToken` | POST |  |

### repair

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/repairForceOutboundReceivables` | POST |  |
| `/api/repairGrabPosOrdersFromWebhook` | POST |  |
| `/api/repairGrabPosOrderStoreCodes` | POST |  |

### sauces

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/sauces` | GET, POST |  |
| `/api/sauces/delete` | POST |  |
| `/api/sauces/recalculate` | POST |  |

### stock

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getStockStores` | GET |  |
| `/api/getStockTakeKpi` | GET |  |
| `/api/getStockUsageAggregate` | GET |  |

### till

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/addTillTransaction` | POST |  |
| `/api/deleteTillTransaction` | POST |  |
| `/api/getTillList` | GET |  |

### unlinked

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getUnlinkedBankWithdrawals` | GET |  |
| `/api/getUnlinkedBankWithdrawalsForCard` | GET |  |
| `/api/getUnlinkedBankWithdrawalsForPetty` | GET |  |

### vat

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/exportVatLedgerCsv` | GET |  |
| `/api/getVatLedgerStoreNameGaps` | GET |  |
| `/api/vatLedger` | GET, POST, DELETE |  |

### warehouse

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/deleteWarehouseLocation` | POST |  |
| `/api/getWarehouseLocations` | GET |  |
| `/api/saveWarehouseLocation` | POST |  |

### all

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/syncAllOrderReceivables` | POST |  |
| `/api/syncAllOrderReceivablesFromOutbound` | POST |  |

### balance

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/addBalanceTransaction` | POST |  |
| `/api/getBalanceSheet` | GET |  |

### depreciation

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getDepreciationEntries` | GET |  |
| `/api/runDepreciation` | GET, POST |  |

### etax

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/exportEtaxTimestampAuditCsv` | GET |  |
| `/api/generateEtaxXml` | POST |  |

### execute

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/executeExpensePayment` | POST |  |
| `/api/executeWithdrawal` | POST |  |

### extract

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/extractExpenseDocument` | POST |  |
| `/api/extractInteriorQuoteAmount` | POST |  |

### force

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/forceOutboundBatch` | POST |  |
| `/api/updateForceOutboundReceived` | POST |  |

### franchisee

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/franchiseeMultiStoreRoster` | GET, POST |  |
| `/api/franchiseeMultiStoreSettings` | GET, POST |  |

### head

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getHeadOfficeInfo` | GET |  |
| `/api/saveHeadOfficeInfo` | POST |  |

### hq

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getHqStockByLocation` | GET |  |
| `/api/getHqWarehouseDailyStockMatrix` | GET |  |

### linkpos

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/linkpos/pay` | POST |  |
| `/api/linkpos/relay` | POST |  |

### login

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getLoginData` | GET |  |
| `/api/loginCheck` | POST |  |

### manual

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/deleteManualBalanceTransaction` | POST, OPTIONS |  |
| `/api/updateManualBalanceTransaction` | POST, OPTIONS |  |

### next

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getNextPosMenuCode` | GET |  |
| `/api/getNextPosPromoCode` | GET |  |

### open

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getOpenReceivablesForBankTx` | GET |  |
| `/api/getOpenStoreActionsByStore` | GET |  |

### pnd54

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/exportPnd54LedgerCsv` | GET |  |
| `/api/pnd54Ledger` | GET, POST, DELETE |  |

### pnd91

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/exportPnd91AnnualCsv` | GET |  |
| `/api/getPnd91AnnualSummary` | GET |  |

### posClose

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/posClose/finalize` | POST |  |
| `/api/posClose/validate` | POST |  |

### pp36

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/exportPp36LedgerCsv` | GET |  |
| `/api/pp36Ledger` | GET, POST, DELETE |  |

### public

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getPublicHolidays` | GET |  |
| `/api/savePublicHoliday` | POST |  |

### routine

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getRoutineTemplates` | GET |  |
| `/api/saveRoutineTemplate` | POST |  |

### schedule

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getScheduleEditLog` | GET |  |
| `/api/saveSchedule` | POST |  |

### setup

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/setupPayrollDB` | GET |  |
| `/api/setupPublicHolidays` | GET |  |

### uploadCompanyHybridDocument

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/uploadCompanyHybridDocument/complete` | POST |  |
| `/api/uploadCompanyHybridDocument/presign` | POST |  |

### uploadInteriorFile

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/uploadInteriorFile/complete` | POST |  |
| `/api/uploadInteriorFile/presign` | POST |  |

### vendor

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/deleteVendor` | POST |  |
| `/api/saveVendor` | POST |  |

### withholding

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/exportWithholdingTaxLedgerCsv` | GET |  |
| `/api/withholdingTaxLedger` | GET, POST, DELETE |  |

### adjust

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/adjustStock` | POST |  |

### adjustment

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getAdjustmentHistory` | GET |  |

### app

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getAppData` | GET |  |

### approved

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getApprovedExpenseAccrualsForBankTx` | GET |  |

### attach

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/attachPosOrderMember` | POST |  |

### audit

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/auditOfficePayrollManagers` | GET, OPTIONS |  |

### auto

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/autoNoticeSettings` | OPTIONS, GET, POST |  |

### borrowing

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getBorrowingLedger` | GET |  |

### calculate

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/calculatePayroll` | GET |  |

### cleanup

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/cleanupTransactionalData` | POST |  |

### collab

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/collabDiscountUsage` | OPTIONS, GET |  |

### combined

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getCombinedOutboundHistory` | GET |  |

### correct

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/correctPosOrderPayment` | POST |  |

### cost

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/costSettings` | GET, POST |  |

### customer

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/uploadCustomerDisplayMedia` | POST |  |

### due

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/applyDuePriceSchedules` | POST, GET | cron `*/15 * * * *` |

### employees

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/importEmployeesFromCsv` | POST |  |

### estimate

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/estimateNoticeRecipients` | POST |  |

### from

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/restoreFromPriceHistory` | POST |  |

### health

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/health` | GET |  |

### image

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/imageProxy` | GET |  |

### influencer

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/importInfluencerProfilesXlsx` | POST |  |

### ingredient

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getIngredientUsageVariance` | GET |  |

### line

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/line/webhook` | POST |  |

### linked

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getLinkedReceivablesForBankTx` | GET |  |

### logout

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/logout` | POST, OPTIONS |  |

### management

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getManagementMarginBridge` | GET |  |

### manager

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/updateManagerCheck` | POST |  |

### member-coupons

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/member-coupons/cancel` | POST |  |

### member-points

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/member-points/adjust` | POST |  |

### member-stamps

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/member-stamps/summary` | GET |  |

### migrate

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/migratePosMenuOptionsToGroupLinks` | POST |  |

### no

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/approveNoClockOut` | POST |  |

### notification

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/notificationSettings` | GET, POST |  |

### oaplus

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/oaplus/health` | GET |  |

### office

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getOfficePayrollAccess` | GET, OPTIONS |  |

### online

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/online-probe` | GET |  |

### password

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/changePassword` | POST |  |

### patch

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/patchStockLogInvoiceUnitPrice` | POST |  |

### pay

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/payInteriorExpense` | POST |  |

### platform

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/backfillPlatformDiscountReason` | POST |  |

### pnd1

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/exportPnd1RdPrepTxt` | GET |  |

### pnd53

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/exportPnd53RdFilingTxt` | GET |  |

### pos-printer-settings

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/pos-printer-settings/apply-membership-qr-all` | POST |  |

### publish

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/publishPayroll` | POST |  |

### rd

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/searchRdVatCompany` | GET, POST |  |

### reconcile

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/reconcilePosSettlementCash` | POST |  |

### remind

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/remindNoticeUnread` | POST |  |

### replace

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/replacePosMenuIngredients` | POST |  |

### revoke

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/revokePosDevice` | POST |  |

### safety

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/saveSafetyStock` | POST |  |

### sent

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getSentNotices` | GET |  |

### session

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/refreshSession` | POST, OPTIONS |  |

### sso

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getSsoSubmissionHistory` | GET |  |

### subledger

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getSubledgerGlReconciliation` | GET |  |

### summarize

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/summarizeEvaluationAnalytics` | POST |  |

### thai

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getThaiTaxFilingSummary` | GET |  |

### translate

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/translate` | POST |  |

### trial

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getTrialBalance` | GET |  |

### uploadComplaintPhoto

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/uploadComplaintPhoto/presign` | POST |  |

### uploadCustomerDisplayMedia

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/uploadCustomerDisplayMedia/presign` | POST |  |

### uploadEtaxEvidence

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/uploadEtaxEvidence/presign` | POST |  |

### uploadExpenseAttachment

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/uploadExpenseAttachment/presign` | POST |  |

### uploadMarketingMaterialInstallPhoto

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/uploadMarketingMaterialInstallPhoto/presign` | POST |  |

### uploadMemberPortalContentImage

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/uploadMemberPortalContentImage/presign` | POST |  |

### uploadNoticeAttachment

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/uploadNoticeAttachment/presign` | POST |  |

### uploadPoQuotation

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/uploadPoQuotation/presign` | POST |  |

### uploadPosMenuImage

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/uploadPosMenuImage/presign` | POST |  |

### uploadSsoEvidence

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/uploadSsoEvidence/presign` | POST |  |

### uploadStoreActionPhoto

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/uploadStoreActionPhoto/presign` | POST |  |

### uploadStoreCheckPhoto

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/uploadStoreCheckPhoto/presign` | POST |  |

### uploadStoreRepairPhoto

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/uploadStoreRepairPhoto/presign` | POST |  |

### uploadWarningLetterRegistry

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/uploadWarningLetterRegistry/presign` | POST |  |

### usage

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/processUsage` | POST |  |

### user

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/checkUserVisitStatus` | GET, POST |  |

### webhooks/kbank

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/webhooks/kbank/[...path]` | OPTIONS, GET, POST | webhook |

### weekly

| 경로 | 메서드 | 비고 |
|---|---|---|
| `/api/getWeeklySchedule` | GET |  |
