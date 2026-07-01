/** 마케팅 허브·연동 UI — ko · en · th · mm · la · kh · vi · ms */
export const I18N_MARKETING_HUB_KO: Record<string, string> = {
  adminMarketingIntegrationsDesc: 'LINE OA, Meta(IG/FB), TikTok 등 외부 API 연동을 위한 설정입니다.',
  marketingSubnavAria: '마케팅 관리 메뉴',
  marketingHomeTitle: '마케팅 허브',
  marketingHomeDesc: '진행 중 캠페인·예산·일정을 한눈에 보고 광고·프로모·리포트로 바로 이동합니다.',
  marketingHomeBangkokBadge: '방콕 기준',
  marketingHomeStatOngoing: '진행 중 캠페인',
  marketingHomeStatToday: '오늘 해당 기간',
  marketingHomeStatTotal: '전체 캠페인',
  marketingHomeStatOverBudget: '예산 초과(샘플)',
  marketingHomeQuickLinks: '빠른 이동',
  marketingHomeRecentOngoing: '진행 중 캠페인',
  marketingHomeViewAll: '전체 보기',
  marketingHomeNoOngoing: '진행 중인 캠페인이 없습니다.',
  marketingHeroDescCampaigns: '캠페인 기본정보·비용·허브 연결의 중심입니다. 광고·인플루언서·프로모션 세트로 이어집니다.',
  marketingHeroDescCollab: '제휴·협업 캠페인의 할인 범위·증빙·현장 운영을 캠페인별로 관리합니다.',
  marketingHeroDescPromos: 'POS·Grab과 연동되는 프로모션 세트를 캠페인 단위로 구성·조회합니다. 저장 로직은 POS와 동일합니다.',
  marketingHeroDescAds: 'SNS·부스트 광고 집행·실비를 캠페인에 연결하고 ROAS 분석에 반영합니다.',
  marketingHeroDescInfluencers: '인플루언서 섭외·제공 메뉴·게시 일정을 캠페인별로 관리합니다.',
  marketingHeroDescMaterials: '홍보물 제작·매장 배치·사은품 재고를 캠페인과 연결해 추적합니다.',
  marketingHeroDescCalendar: '캠페인·광고·프로모·인플루언서·홍보물 일정을 방콕 기준 한 달력에서 봅니다.',
  marketingHeroDescReport: '월간 비용·KPI 성과·통합 캘린더·예산 대비 실비를 한 허브에서 봅니다.',
  marketingHeroDescIntegrations: 'LINE OA·Meta·TikTok 등 외부 API 연결 상태와 테스트 도구입니다.',
  marketingCostsHubNoteLead: '통장·Petty 등',
  marketingCostsHubNoteBold: '캠페인 ID',
  marketingCostsHubNoteTrail: '로 연결된 실비입니다. 차트는 실비·예산이 있는 상위 캠페인만 표시합니다.',
  marketingIntegrationStatusConfigured: '환경 변수 설정됨',
  marketingIntegrationStatusUnknown: '미확인 · 테스트 필요',
  marketingIntegrationStatusDocs: '개발자 문서',
  marketingIntegrationEnvLabel: 'env',
  marketingIntegrationLineSubtitle: 'Messaging API, LIFF, Broadcast → 생일 쿠폰, 타겟 푸시, 회원 CRM',
  marketingIntegrationTestSegmentBtn: 'Segment 목록 테스트',
  marketingIntegrationTestGroupBtn: 'Group 목록 테스트',
  marketingIntegrationTestGroupV2Btn: 'Group V2 목록 테스트',
  marketingIntegrationLineConsoleBtn: 'LINE Developers Console',
  marketingIntegrationMetaSubtitle: 'Marketing API → Actual Spent, 도달, 클릭 자동 수집 (ROAS 시트 자동화)',
  marketingIntegrationMetaDevBtn: 'Meta for Developers',
  marketingIntegrationTikTokSubtitle: 'TikTok Marketing API → 실비·성과 자동 동기화',
  marketingIntegrationTikTokDevBtn: 'TikTok for Business API',
  marketingIntegrationMetaEnvLine1: '• META_APP_ID, META_APP_SECRET, META_ACCESS_TOKEN',
  marketingIntegrationMetaEnvLine2: '• 광고 계정 ID 연동 필요',
  marketingIntegrationTikTokEnvLine1: '• TIKTOK_ACCESS_TOKEN, TIKTOK_ADS_ACCOUNT_ID',
  marketingIntegrationTikTokEnvLine2: '• OAuth 인증 플로우 구현 필요',
  marketingIntegrationLineEnvDoc:
    '• 메시징: `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` (기존 /api/line/webhook)\n' +
    '• 회원 포털 LINE 로그인: `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET` (미설정 시 `LINE_CHANNEL_SECRET` 폴백). **Channel ID는 숫자만** (예: 2004403638) — LINE Login 채널 Basic settings 값. **U로 시작하는 사용자 ID는 사용 불가**\n' +
    '• LINE Developers → LINE Login 채널 → Callback URL에 `/api/member-portal/auth/line/callback` 등록. Basic settings → Linked LINE Official Account에서 OA 연결 후 로그인 동의 화면에 친구 추가 옵션 표시\n' +
    '• (선택) `LINE_LOGIN_BOT_PROMPT` — `normal`(기본, 동의 화면에 친구 추가 체크) / `aggressive`(별도 친구 추가 화면) / `off`\n' +
    '• OAPlus Public API: 베이스 `https://developers-oaplus.line.biz` — 아래 URL env에 경로 포함. 키는 OAPlus 관리자 Settings → API keys에서 발급 → `X-API-KEY` 로 전송 (서버 프록시가 대신 붙임)\n' +
    '• (선택) `LINE_OAPLUS_USER_AGENT` — 미설정 시 `CM-ERP OAPlus` (문서 권장 예: 서비스명/회사명)\n' +
    '• 기타 API 레이트 리밋(문서): 시간당 5,000 / 초당 500 — 초과 시 429\n' +
    '• Segment API (X-API-KEY): `LINE_OA_SEGMENT_LIST_URL` — 문서의「세그먼트 목록 GET」전체 URL(쿼리 제외)\n' +
    '• `LINE_OA_SEGMENT_X_API_KEY` — 발급받은 X-API-KEY\n' +
    '• (선택) `LINE_OA_SEGMENT_DETAIL_URL` — 세그먼트 상세 GET URL. 미설정 시 LIST URL 뒤에 /{segmentId} 자동 추가\n' +
    '• `LINE_OA_SEGMENT_CREATE_AUDIENCE_URL` — OA Audience 생성 POST URL (권장: {segmentId} 포함)\n' +
    '• `LINE_OA_SEGMENT_CREATE_AUDIENCE_RESULT_URL` — OA Audience 상태/이름 조회 GET URL (권장: {segmentId}, {id} 포함)\n' +
    '• `LINE_OA_SEGMENT_USER_LIST_CSV_URL` — 세그먼트 사용자 CSV 생성 POST URL (권장: {segmentId} 포함). 일부 세그먼트(전체 친구·캠페인 등)는 보내기 불가 → SGM.1.V.2.10 등\n' +
    '• `LINE_OA_SEGMENT_USER_LIST_EXPORT_STATUS_URL` — CSV 보내기 상태·다운로드 URL GET (권장: {segmentId}, {id}). 완료 후 결과는 약 3일, 다운로드 URL은 응답 후 약 10분 유효\n' +
    '• 쿼리 page·size는 정수, sort는 id|friendCount|updatedAt 과 asc|desc (예: id:asc) — 잘못 넣으면 SGM.1.V.* 검증 오류\n' +
    '# Group API (Deprecated, /audience/v1/group/groups)\n' +
    '• `LINE_OA_GROUP_API_BASE_URL` — 호스트 + /audience/v1/group/groups 까지 (끝 슬래시 없음)\n' +
    '• `LINE_OA_GROUP_X_API_KEY` — 없으면 `LINE_OA_SEGMENT_X_API_KEY`와 동일 키 사용\n' +
    '• 목록 sort: id, name, followerCount, updatedAt, source, validUntil + asc|desc (기본 size 20)\n' +
    '# Group API V2 (/audience/v2/group/groups)\n' +
    '• `LINE_OA_GROUP_V2_API_BASE_URL` — …/audience/v2/group/groups 까지 (끝 슬래시 없음)\n' +
    '• `LINE_OA_GROUP_V2_X_API_KEY` — 없으면 V1·Segment 키 순으로 대체\n' +
    '• 목록 sort: id, name, friendCount, updatedAt, source, validUntil. 생성은 201, grouped-users CSV는 202 후 …/grouped-users/{requestId}/result 로 상태·URL (결과 약 7일, URL 약 10분)',
  helpSum_admin_marketing: '마케팅 KPI·진행 캠페인·예산 알림과 하위 메뉴 바로가기 허브입니다.',
  helpHow_admin_marketing:
    '① 상단 KPI에서 진행 중·오늘 해당·예산 초과 건수를 확인합니다.\n② 빠른 이동으로 캠페인·프로모·광고·캘린더·성과 리포트로 이동합니다.\n③ 하위 서브메뉴에서 세부 업무 화면을 고릅니다.',
  helpSum_admin_marketing_campaigns: '마케팅 캠페인 등록·수정·목록·A/B 비교와 비용·허브 연결의 중심 화면입니다.',
  helpHow_admin_marketing_campaigns:
    '① 등록·수정: 캠페인 기본정보·기간·매장·비용·KPI를 저장합니다.\n② 목록: 검색·필터로 캠페인을 찾고 허브 링크(광고·인플루언서·프로모)로 이동합니다.\n③ A/B 비교: 기간·매장 기준 캠페인 성과를 나란히 봅니다.',
  helpSum_admin_marketing_collab_menus: '협업·제휴 캠페인의 POS 할인·증빙·적용 범위를 관리합니다.',
  helpHow_admin_marketing_collab_menus:
    '① 캠페인을 고른 뒤 「협업 관리 목록에 포함」을 켭니다.\n② 협업 상세에서 제휴사·증빙·메뉴 범위·할인을 저장합니다.\n③ 협업 조회 탭에서 기간·제휴사별 목록을 봅니다.',
  helpSum_admin_marketing_promos: 'POS·Grab 연동 프로모션 세트를 캠페인 단위로 구성·조회합니다.',
  helpHow_admin_marketing_promos:
    '① 상단에서 캠페인을 선택합니다.\n② 편집·구성: 메뉴를 골라 세트를 만들고 저장합니다(POS와 동일 로직).\n③ 목록 조회: 활성·기간 필터로 세트를 보고 편집 탭으로 이동합니다.',
  helpSum_admin_marketing_ads: 'SNS·부스트 광고 집행·실비를 캠페인에 연결합니다.',
  helpHow_admin_marketing_ads:
    '① 캠페인을 선택한 뒤 플랫폼·주제·집행 기간·예산·실비를 저장합니다.\n② 실비는 지출 관리와 연동될 수 있습니다.\n③ 전체 조회 탭에서 기간·플랫폼별 광고 목록을 봅니다.',
  helpSum_admin_marketing_influencers: '인플루언서 섭외·제공 메뉴·게시 일정을 관리합니다.',
  helpHow_admin_marketing_influencers:
    '① 캠페인을 선택하고 인플루언서 정보·제공 메뉴·게시일을 등록합니다.\n② 디렉터리·조회 탭에서 전체 목록을 검색합니다.',
  helpSum_admin_marketing_materials: '홍보물·제작 완료·매장 수령/설치 확인·사은품을 캠페인과 연결해 관리합니다.',
  helpHow_admin_marketing_materials:
    '① 캠페인별 홍보물을 등록하고 매장 배치·수량을 기록합니다.\n② 체크리스트 탭: 본사는 스탠디/포스터 제작 완료일, 매장은 수령→설치(사진 첨부 가능) 2단계 확인.\n③ 사은품 탭에서 배정·배포·재고 불일치를 점검합니다.',
  marketingMaterialChecklistTab: '체크리스트',
  marketingMaterialChecklistNeedCampaign: '체크리스트를 보려면 캠페인을 선택하세요.',
  marketingMaterialChecklistAllTypes: '스탠디/포스터 외 전체 종류 포함',
  marketingMaterialChecklistShowDone: '완료 항목 표시',
  marketingMaterialChecklistHint:
    '본사: 제작 완료일을 입력하면 매장에서 수령·설치 확인이 가능합니다. 매장: 제작 완료 후 수령 → 설치 순으로 확인하세요.',
  marketingMaterialChecklistEmpty: '체크리스트 대상 홍보물이 없습니다. (스탠디·포스터, 배포 매장 지정)',
  marketingMaterialChecklistStoreTasks: '확인할 홍보물',
  marketingMaterialChecklistStoreEmpty: '확인할 항목이 없습니다.',
  marketingMaterialChecklistWaitingProduction: '본사 제작 대기',
  marketingMaterialChecklistDone: '완료',
  marketingMaterialChecklistConfirmReceived: '수령 확인',
  marketingMaterialChecklistConfirmInstalled: '설치 확인',
  marketingMaterialChecklistInstallPhoto: '설치 사진',
  marketingMaterialChecklistInstallPhotoHint: '현장에 게시한 모습을 촬영해 올려 주세요. 본사에서 체크리스트에서 확인할 수 있습니다.',
  marketingMaterialChecklistInstallPhotoOptional: '선택',
  helpSum_admin_marketing_calendar: '마케팅 관련 일정을 방콕 기준 통합 캘린더로 봅니다.',
  helpHow_admin_marketing_calendar:
    '① 레이어(캠페인·광고·프로모 등)를 켜고 끕니다.\n② 날짜를 클릭해 당일 이벤트 상세를 봅니다.\n③ 캠페인·매장 필터로 범위를 좁힙니다.',
  helpSum_admin_marketing_report: '월간 리포트·KPI 성과·비용·캘린더를 한 허브에서 봅니다.',
  helpHow_admin_marketing_report:
    '① 월간: 선택 월·캠페인별 비용 요약과 CSV 다운로드.\n② 성과: KPI 목표 대비 POS 주문 실적 차트.\n③ 비용: 예산 대비 실비·초과 알림.\n④ 캘린더: 리포트 허브 내 통합 일정.',
  helpSum_admin_marketing_integrations: 'LINE OA·Meta·TikTok 등 마케팅 API 연동 설정·테스트 화면입니다.',
  helpHow_admin_marketing_integrations:
    '① LINE Segment/Group API 테스트 버튼으로 연결을 확인합니다.\n② Meta·TikTok은 env 변수 안내와 개발자 콘솔 링크를 참고합니다.\n③ 운영 반영 전 스테이징에서 키·URL을 검증하세요.',
}

export const I18N_MARKETING_HUB_EN: Record<string, string> = {
  adminMarketingIntegrationsDesc: 'Settings for LINE OA, Meta(IG/FB), TikTok API integration.',
  marketingSubnavAria: 'Marketing menu',
  marketingHomeTitle: 'Marketing hub',
  marketingHomeDesc: 'See active campaigns, budget alerts, and jump to ads, promos, and reports.',
  marketingHomeBangkokBadge: 'Bangkok time',
  marketingHomeStatOngoing: 'Ongoing campaigns',
  marketingHomeStatToday: 'Active today',
  marketingHomeStatTotal: 'All campaigns',
  marketingHomeStatOverBudget: 'Over budget (sample)',
  marketingHomeQuickLinks: 'Quick links',
  marketingHomeRecentOngoing: 'Ongoing campaigns',
  marketingHomeViewAll: 'View all',
  marketingHomeNoOngoing: 'No ongoing campaigns.',
  marketingHeroDescCampaigns: 'Central hub for campaign info, costs, and links to ads, influencers, and promo sets.',
  marketingHeroDescCollab: 'Manage partner discounts, ID proof, and menu scope per campaign.',
  marketingHeroDescPromos: 'Build and review POS·Grab-linked promo sets by campaign. Save logic matches POS.',
  marketingHeroDescAds: 'Track SNS/boost ads and actual spend linked to campaigns for ROAS.',
  marketingHeroDescInfluencers: 'Manage influencer hires, provided menus, and publish schedules.',
  marketingHeroDescMaterials: 'Track materials, store deployments, and gifts by campaign.',
  marketingHeroDescCalendar: 'View campaign, ad, promo, influencer, and material schedules (Bangkok).',
  marketingHeroDescReport: 'Monthly costs, KPI performance, calendar, and budget vs actual in one hub.',
  marketingHeroDescIntegrations: 'LINE OA, Meta, TikTok connection status and test tools.',
  marketingCostsHubNoteLead: 'Actual costs linked by',
  marketingCostsHubNoteBold: 'campaign ID',
  marketingCostsHubNoteTrail: ' from bank/Petty. Chart shows top campaigns with budget and spend.',
  marketingIntegrationStatusConfigured: 'Env configured',
  marketingIntegrationStatusUnknown: 'Unverified · run test',
  marketingIntegrationStatusDocs: 'Developer docs',
  marketingIntegrationEnvLabel: 'env',
  marketingIntegrationLineSubtitle: 'Messaging API, LIFF, Broadcast → birthday coupons, push, member CRM',
  marketingIntegrationTestSegmentBtn: 'Test Segment list',
  marketingIntegrationTestGroupBtn: 'Test Group list',
  marketingIntegrationTestGroupV2Btn: 'Test Group V2 list',
  marketingIntegrationLineConsoleBtn: 'LINE Developers Console',
  marketingIntegrationMetaSubtitle: 'Marketing API → actual spend, reach, clicks (ROAS automation)',
  marketingIntegrationMetaDevBtn: 'Meta for Developers',
  marketingIntegrationTikTokSubtitle: 'TikTok Marketing API → sync spend and performance',
  marketingIntegrationTikTokDevBtn: 'TikTok for Business API',
  marketingIntegrationMetaEnvLine1: '• META_APP_ID, META_APP_SECRET, META_ACCESS_TOKEN',
  marketingIntegrationMetaEnvLine2: '• Ad account ID linkage required',
  marketingIntegrationTikTokEnvLine1: '• TIKTOK_ACCESS_TOKEN, TIKTOK_ADS_ACCOUNT_ID',
  marketingIntegrationTikTokEnvLine2: '• OAuth authorization flow implementation required',
  marketingIntegrationLineEnvDoc:
    '• Messaging: `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` (existing /api/line/webhook)\n' +
    '• Member portal LINE login: `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET` (falls back to `LINE_CHANNEL_SECRET` if unset). **Channel ID must be numeric only** (e.g. 2004403638) — from LINE Login channel Basic settings. **User IDs starting with U cannot be used**\n' +
    '• LINE Developers → LINE Login channel → register Callback URL `/api/member-portal/auth/line/callback`. Link OA under Basic settings → Linked LINE Official Account to show add-friend option on consent screen\n' +
    '• (Optional) `LINE_LOGIN_BOT_PROMPT` — `normal` (default, add-friend checkbox on consent) / `aggressive` (separate add-friend screen) / `off`\n' +
    '• OAPlus Public API base `https://developers-oaplus.line.biz` — include path in URL env below. Issue key in OAPlus admin Settings → API keys → sent as `X-API-KEY` (server proxy attaches it)\n' +
    '• (Optional) `LINE_OAPLUS_USER_AGENT` — defaults to `CM-ERP OAPlus` (docs suggest service/company name)\n' +
    '• API rate limits (docs): 5,000/hour, 500/sec — 429 if exceeded\n' +
    '• Segment API (X-API-KEY): `LINE_OA_SEGMENT_LIST_URL` — full GET segment list URL from docs (excluding query)\n' +
    '• `LINE_OA_SEGMENT_X_API_KEY` — issued X-API-KEY\n' +
    '• (Optional) `LINE_OA_SEGMENT_DETAIL_URL` — segment detail GET URL. If unset, /{segmentId} is appended to LIST URL\n' +
    '• `LINE_OA_SEGMENT_CREATE_AUDIENCE_URL` — OA Audience create POST URL (prefer {segmentId} in path)\n' +
    '• `LINE_OA_SEGMENT_CREATE_AUDIENCE_RESULT_URL` — OA Audience status/name GET URL (prefer {segmentId}, {id})\n' +
    '• `LINE_OA_SEGMENT_USER_LIST_CSV_URL` — segment user CSV create POST URL (prefer {segmentId}). Some segments (all friends, campaigns) cannot export → SGM.1.V.2.10 etc.\n' +
    '• `LINE_OA_SEGMENT_USER_LIST_EXPORT_STATUS_URL` — CSV export status/download GET URL (prefer {segmentId}, {id}). Results ~3 days; download URL valid ~10 min after response\n' +
    '• Query page·size must be integers; sort id|friendCount|updatedAt with asc|desc (e.g. id:asc) — invalid values cause SGM.1.V.* validation errors\n' +
    '# Group API (Deprecated, /audience/v1/group/groups)\n' +
    '• `LINE_OA_GROUP_API_BASE_URL` — host + /audience/v1/group/groups (no trailing slash)\n' +
    '• `LINE_OA_GROUP_X_API_KEY` — if unset, uses `LINE_OA_SEGMENT_X_API_KEY`\n' +
    '• List sort: id, name, followerCount, updatedAt, source, validUntil + asc|desc (default size 20)\n' +
    '# Group API V2 (/audience/v2/group/groups)\n' +
    '• `LINE_OA_GROUP_V2_API_BASE_URL` — …/audience/v2/group/groups (no trailing slash)\n' +
    '• `LINE_OA_GROUP_V2_X_API_KEY` — if unset, falls back to V1 then Segment key\n' +
    '• List sort: id, name, friendCount, updatedAt, source, validUntil. Create returns 201; grouped-users CSV returns 202 then …/grouped-users/{requestId}/result for status/URL (results ~7 days, URL ~10 min)',
  helpSum_admin_marketing: 'Marketing KPI hub with shortcuts to campaigns, promos, ads, and reports.',
  helpHow_admin_marketing:
    '① Check KPI cards for ongoing, today-active, and over-budget counts.\n② Use quick links to open campaigns, promos, ads, calendar, or performance.\n③ Use the subnav for detailed screens.',
  helpSum_admin_marketing_campaigns: 'Create, edit, list, and A/B-compare marketing campaigns and hub links.',
  helpHow_admin_marketing_campaigns:
    '① Create/Edit: save basics, dates, stores, costs, and KPI.\n② List: search and open hub links (ads, influencers, promos).\n③ A/B Compare: side-by-side campaign results.',
  helpSum_admin_marketing_collab_menus: 'Manage partner/collab POS discounts, proof, and menu scope.',
  helpHow_admin_marketing_collab_menus:
    '① Pick a campaign and enable “Include in collab list”.\n② Save partner, proof, scope, and discount details.\n③ Overview tab for period and partner filters.',
  helpSum_admin_marketing_promos: 'Compose and review POS·Grab promo sets by campaign.',
  helpHow_admin_marketing_promos:
    '① Select a campaign at the top.\n② Compose: pick menus and save sets (same logic as POS).\n③ List: filter by active/period and open in compose tab.',
  helpSum_admin_marketing_ads: 'Link SNS/boost ads and actual spend to campaigns.',
  helpHow_admin_marketing_ads:
    '① Select campaign, platform, topic, schedule, budget, and actual spend.\n② Spend may sync to expense management.\n③ Inquiry tab for cross-campaign list.',
  helpSum_admin_marketing_influencers: 'Manage influencer hires, menus, and publish dates.',
  helpHow_admin_marketing_influencers:
    '① Select campaign and register influencer, menus, and dates.\n② Directory/overview tabs for search.',
  helpSum_admin_marketing_materials: 'Materials, production completion, store receive/install checks, and gifts.',
  helpHow_admin_marketing_materials:
    '① Register materials per campaign and store deployments.\n② Checklist tab: HQ sets production date; stores confirm receive then install (optional photo).\n③ Gifts tab for allocation and inventory checks.',
  marketingMaterialChecklistTab: 'Checklist',
  marketingMaterialChecklistNeedCampaign: 'Select a campaign to view the checklist.',
  marketingMaterialChecklistAllTypes: 'Include all material types (not only standee/poster)',
  marketingMaterialChecklistShowDone: 'Show completed items',
  marketingMaterialChecklistHint:
    'HQ: enter production completion date so stores can confirm. Stores: confirm receive, then install.',
  marketingMaterialChecklistEmpty: 'No checklist materials (standee/poster with assigned stores).',
  marketingMaterialChecklistStoreTasks: 'Items to confirm',
  marketingMaterialChecklistStoreEmpty: 'Nothing to confirm.',
  marketingMaterialChecklistWaitingProduction: 'Awaiting HQ production',
  marketingMaterialChecklistDone: 'Done',
  marketingMaterialChecklistConfirmReceived: 'Confirm received',
  marketingMaterialChecklistConfirmInstalled: 'Confirm installed',
  marketingMaterialChecklistInstallPhoto: 'Install photo',
  marketingMaterialChecklistInstallPhotoHint:
    'Take a photo of the display on site. HQ can review it on the checklist.',
  marketingMaterialChecklistInstallPhotoOptional: 'Optional',
  helpSum_admin_marketing_calendar: 'Integrated Bangkok calendar for marketing schedules.',
  helpHow_admin_marketing_calendar:
    '① Toggle layers (campaign, ad, promo, etc.).\n② Click a day for details.\n③ Filter by campaign or store.',
  helpSum_admin_marketing_report: 'Monthly report, KPI performance, costs, and calendar hub.',
  helpHow_admin_marketing_report:
    '① Monthly: cost summary and CSV.\n② Performance: KPI target vs POS orders.\n③ Costs: budget vs actual.\n④ Calendar tab inside report hub.',
  helpSum_admin_marketing_integrations: 'LINE OA, Meta, TikTok API settings and tests.',
  helpHow_admin_marketing_integrations:
    '① Test LINE Segment/Group APIs.\n② Meta/TikTok: follow env and developer console links.\n③ Verify keys on staging before production.',
}

export const I18N_MARKETING_HUB_TH: Record<string, string> = {
  adminMarketingIntegrationsDesc: 'ตั้งค่าสำหรับ LINE OA, Meta(IG/FB), TikTok API',
  marketingSubnavAria: 'เมนูการตลาด',
  marketingHomeTitle: 'ศูนย์การตลาด',
  marketingHomeDesc: 'ดูแคมเปญที่ดำเนินอยู่ งบประมาณ และไปยังโฆษณา โปรโมชัน รายงานได้ทันที',
  marketingHomeBangkokBadge: 'เวลากรุงเทพ',
  marketingHomeStatOngoing: 'แคมเปญที่ดำเนินอยู่',
  marketingHomeStatToday: 'อยู่ในช่วงวันนี้',
  marketingHomeStatTotal: 'แคมเปญทั้งหมด',
  marketingHomeStatOverBudget: 'เกินงบ (ตัวอย่าง)',
  marketingHomeQuickLinks: 'ลิงก์ด่วน',
  marketingHomeRecentOngoing: 'แคมเปญที่ดำเนินอยู่',
  marketingHomeViewAll: 'ดูทั้งหมด',
  marketingHomeNoOngoing: 'ไม่มีแคมเปญที่ดำเนินอยู่',
  marketingHeroDescCampaigns: 'ศูนย์กลางข้อมูลแคมเปญ ต้นทุน และลิงก์ไปโฆษณา อินฟลูเอนเซอร์ ชุดโปรโมชัน',
  marketingHeroDescCollab: 'จัดการส่วนลดพันธมิตร หลักฐาน และขอบเขตเมนูตามแคมเปญ',
  marketingHeroDescPromos: 'สร้างและดูชุดโปรโมชันเชื่อม POS·Grab ตามแคมเปญ (บันทึกเหมือน POS)',
  marketingHeroDescAds: 'เชื่อมโฆษณา SNS/บูสต์และค่าใช้จ่ายจริงกับแคมเปญสำหรับ ROAS',
  marketingHeroDescInfluencers: 'จัดการอินฟลูเอนเซอร์ เมนูที่ให้ และกำหนดเผยแพร่',
  marketingHeroDescMaterials: 'ติดตามสื่อ การติดตั้งร้าน และของแถมตามแคมเปญ',
  marketingHeroDescCalendar: 'ดูตารางแคมเปญ โฆษณา โปรโม อินฟลู สื่อ ตามเวลากรุงเทพ',
  marketingHeroDescReport: 'ต้นทุนรายเดือน KPI ปฏิทิน และงบเทียบค่าใช้จ่ายจริงในที่เดียว',
  marketingHeroDescIntegrations: 'สถานะและเครื่องมือทดสอบ LINE OA · Meta · TikTok',
  marketingCostsHubNoteLead: 'ค่าใช้จ่ายจริงเชื่อมด้วย',
  marketingCostsHubNoteBold: 'รหัสแคมเปญ',
  marketingCostsHubNoteTrail: ' จากธนาคาร/Petty แผนภูมิแสดงแคมเปญที่มีงบและค่าใช้จ่าย',
  marketingIntegrationStatusConfigured: 'ตั้งค่า env แล้ว',
  marketingIntegrationStatusUnknown: 'ยังไม่ยืนยัน · ทดสอบ',
  marketingIntegrationStatusDocs: 'เอกสารนักพัฒนา',
  marketingIntegrationEnvLabel: 'env',
  marketingIntegrationLineSubtitle: 'Messaging API, LIFF, Broadcast → คูปองวันเกิด แจ้งเตือน สมาชิก CRM',
  marketingIntegrationTestSegmentBtn: 'ทดสอบรายการ Segment',
  marketingIntegrationTestGroupBtn: 'ทดสอบรายการ Group',
  marketingIntegrationTestGroupV2Btn: 'ทดสอบรายการ Group V2',
  marketingIntegrationLineConsoleBtn: 'LINE Developers Console',
  marketingIntegrationMetaSubtitle: 'Marketing API → ค่าใช้จริง การเข้าถึง คลิก (อัตomation ROAS)',
  marketingIntegrationMetaDevBtn: 'Meta for Developers',
  marketingIntegrationTikTokSubtitle: 'TikTok Marketing API → ซิงค์ค่าใช้จริงและผลงาน',
  marketingIntegrationTikTokDevBtn: 'TikTok for Business API',
  marketingIntegrationMetaEnvLine1: '• META_APP_ID, META_APP_SECRET, META_ACCESS_TOKEN',
  marketingIntegrationMetaEnvLine2: '• ต้องเชื่อมบัญชีโฆษณา',
  marketingIntegrationTikTokEnvLine1: '• TIKTOK_ACCESS_TOKEN, TIKTOK_ADS_ACCOUNT_ID',
  marketingIntegrationTikTokEnvLine2: '• ต้อง implement OAuth flow',
  marketingIntegrationLineEnvDoc:
    '• Messaging: `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` (/api/line/webhook เดิม)\n' +
    '• LINE login สมาชิก: `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET` (ไม่ตั้งจะ fallback `LINE_CHANNEL_SECRET`). **Channel ID ต้องเป็นตัวเลขเท่านั้น** — จาก Basic settings ของ LINE Login. **ห้ามใช้ User ID ขึ้นต้น U**\n' +
    '• LINE Developers → LINE Login → ลงทะเบียน Callback `/api/member-portal/auth/line/callback`. เชื่อม OA ใน Linked LINE Official Account\n' +
    '• (ทางเลือก) `LINE_LOGIN_BOT_PROMPT` — `normal` / `aggressive` / `off`\n' +
    '• OAPlus Public API: `https://developers-oaplus.line.biz` — ใส่ path ใน env URL. คีย์จาก OAPlus Settings → API keys → `X-API-KEY` (proxy แนบให้)\n' +
    '• (ทางเลือก) `LINE_OAPLUS_USER_AGENT` — ค่าเริ่ม `CM-ERP OAPlus`\n' +
    '• Rate limit: 5,000/ชม. 500/วิน. — เกินได้ 429\n' +
    '• Segment API: `LINE_OA_SEGMENT_LIST_URL`, `LINE_OA_SEGMENT_X_API_KEY`\n' +
    '• (ทางเลือก) `LINE_OA_SEGMENT_DETAIL_URL` — ไม่ตั้งจะต่อ /{segmentId} หลัง LIST URL\n' +
    '• `LINE_OA_SEGMENT_CREATE_AUDIENCE_URL`, `LINE_OA_SEGMENT_CREATE_AUDIENCE_RESULT_URL`\n' +
    '• `LINE_OA_SEGMENT_USER_LIST_CSV_URL`, `LINE_OA_SEGMENT_USER_LIST_EXPORT_STATUS_URL`\n' +
    '• page·size เป็นจำนวนเต็ม sort id|friendCount|updatedAt asc|desc\n' +
    '# Group API (Deprecated)\n' +
    '• `LINE_OA_GROUP_API_BASE_URL`, `LINE_OA_GROUP_X_API_KEY`\n' +
    '# Group API V2\n' +
    '• `LINE_OA_GROUP_V2_API_BASE_URL`, `LINE_OA_GROUP_V2_X_API_KEY`',
  helpSum_admin_marketing: 'ศูนย์ KPI การตลาดและลิงก์ด่วนไปแคมเปญ โปรโม โฆษณา รายงาน',
  helpHow_admin_marketing:
    '① ดู KPI ด้านบน: ดำเนินอยู่ วันนี้ เกินงบ\n② ใช้ลิงก์ด่วนไปแคมเปญ โปรโม โฆษณา ปฏิทิน ผลงาน\n③ ใช้เมนูย่อยสำหรับหน้าจอรายละเอียด',
  helpSum_admin_marketing_campaigns: 'สร้าง/แก้ไข/รายการ/A-B แคมเปญและลิงก์ศูนย์กลาง',
  helpHow_admin_marketing_campaigns:
    '① สร้าง/แก้ไข: บันทึกข้อมูลพื้นฐาน ช่วงเวลา ร้าน ต้นทุน KPI\n② รายการ: ค้นหาและเปิดลิงก์โฆษณา อินฟลู โปรโม\n③ A/B: เปรียบเทียบผลแคมเปญ',
  helpSum_admin_marketing_collab_menus: 'จัดการส่วนลด POS หลักฐาน และขอบเขตความร่วมมือ',
  helpHow_admin_marketing_collab_menus:
    '① เลือกแคมเปญและเปิด「รวมในรายการความร่วมมือ」\n② บันทึกพันธมิตร หลักฐาน ขอบเขต ส่วนลด\n③ แท็บภาพรวมสำหรับช่วงและพันธมิตร',
  helpSum_admin_marketing_promos: 'สร้างและดูชุดโปรโม POS·Grab ตามแคมเปญ',
  helpHow_admin_marketing_promos:
    '① เลือกแคมเปญด้านบน\n② แก้ไข/สร้าง: เลือกเมนูและบันทึกชุด (ตรรกะเดียวกับ POS)\n③ รายการ: กรองและเปิดในแท็บแก้ไข',
  helpSum_admin_marketing_ads: 'เชื่อมโฆษณา SNS/บูสต์และค่าใช้จริงกับแคมเปญ',
  helpHow_admin_marketing_ads:
    '① เลือกแคมเปญ แพลตฟอร์ม หัวข้อ ช่วงเวลา งบ ค่าใช้จริง\n② ค่าใช้จริงอาจซิงค์กับการจัดการค่าใช้จ่าย\n③ แท็บดูทั้งหมด',
  helpSum_admin_marketing_influencers: 'จัดการอินฟลู เมนูที่ให้ และวันเผยแพร่',
  helpHow_admin_marketing_influencers:
    '① เลือกแคมเปญและลงทะเบียนอินฟลู เมนู วันที่\n② ไดเรกทอรี/ภาพรวมสำหรับค้นหา',
  helpSum_admin_marketing_materials: 'สื่อ ผลิตเสร็จ รับ/ติดตั้งร้าน และของแถมตามแคมเปญ',
  helpHow_admin_marketing_materials:
    '① ลงทะเบียนสื่อและการติดตั้งร้าน\n② แท็บเช็กลิสต์: สำนักงานใหญ่บันทึกวันผลิตเสร็จ ร้านยืนยันรับแล้วติดตั้ง (แนบรูปได้)\n③ แท็บของแถมสำหรับการจัดสรรและสต็อก',
  marketingMaterialChecklistTab: 'เช็กลิสต์',
  marketingMaterialChecklistNeedCampaign: 'เลือกแคมเปญเพื่อดูเช็กลิสต์',
  marketingMaterialChecklistAllTypes: 'รวมทุกประเภทสื่อ (ไม่เฉพาะสแตนดี้/โปสเตอร์)',
  marketingMaterialChecklistShowDone: 'แสดงรายการที่เสร็จแล้ว',
  marketingMaterialChecklistHint:
    'สำนักงานใหญ่: กรอกวันผลิตเสร็จเพื่อให้ร้านยืนยันได้ ร้าน: ยืนยันรับแล้วติดตั้งตามลำดับ',
  marketingMaterialChecklistEmpty: 'ไม่มีสื่อในเช็กลิสต์ (สแตนดี้/โปสเตอร์ที่มีร้านกำหนด)',
  marketingMaterialChecklistStoreTasks: 'รายการที่ต้องยืนยัน',
  marketingMaterialChecklistStoreEmpty: 'ไม่มีรายการที่ต้องยืนยัน',
  marketingMaterialChecklistWaitingProduction: 'รอผลิตจากสำนักงานใหญ่',
  marketingMaterialChecklistDone: 'เสร็จแล้ว',
  marketingMaterialChecklistConfirmReceived: 'ยืนยันรับแล้ว',
  marketingMaterialChecklistConfirmInstalled: 'ยืนยันติดตั้งแล้ว',
  marketingMaterialChecklistInstallPhoto: 'รูปติดตั้ง',
  marketingMaterialChecklistInstallPhotoHint:
    'ถ่ายรูปหน้างานที่ติดตั้งแล้ว สำนักงานใหญ่ดูได้ในเช็กลิสต์',
  marketingMaterialChecklistInstallPhotoOptional: 'ไม่บังคับ',
  helpSum_admin_marketing_calendar: 'ปฏิทินรวมตารางการตลาด (เวลากรุงเทพ)',
  helpHow_admin_marketing_calendar:
    '① เปิด/ปิดเลเยอร์ (แคมเปญ โฆษณา โปรโม ฯลฯ)\n② คลิกวันที่ดูรายละเอียด\n③ กรองตามแคมเปญ/ร้าน',
  helpSum_admin_marketing_report: 'รายงานรายเดือน KPI ต้นทุน ปฏิทิน',
  helpHow_admin_marketing_report:
    '① รายเดือน: สรุปต้นทุนและ CSV\n② ผลงาน: KPI เทียบออเดอร์ POS\n③ ต้นทุน: งบเทียบจริง\n④ ปฏิทินในรายงาน',
  helpSum_admin_marketing_integrations: 'ตั้งค่าและทดสอบ API LINE OA · Meta · TikTok',
  helpHow_admin_marketing_integrations:
    '① ทดสอบ LINE Segment/Group API\n② Meta/TikTok: ดู env และลิงก์คอนโซล\n③ ตรวจสอบบน staging ก่อนใช้งานจริง',
}


/** mm · la · kh · vi · ms — UI 현지화 + LINE env(EN 기술 문서) */
function hubFromEn(overrides: Record<string, string>): Record<string, string> {
  return {
    ...I18N_MARKETING_HUB_EN,
    ...overrides,
    marketingIntegrationLineEnvDoc:
      overrides.marketingIntegrationLineEnvDoc ?? I18N_MARKETING_HUB_EN.marketingIntegrationLineEnvDoc,
  }
}

export const I18N_MARKETING_HUB_MM = hubFromEn({
  adminMarketingIntegrationsDesc: 'LINE OA, Meta(IG/FB), TikTok API ချိတ်ဆက်မှုအတွက် ပြင်ဆင်ချက်',
  marketingSubnavAria: 'စျေးကွက်ရှာဖွေရေးမီနူး',
  marketingHomeTitle: 'စျေးကွက်ရှာဖွေရေး hub',
  marketingHomeDesc: 'လက်ရှိကမ်ပိန်း၊ ဘတ်ဂျက်၊ အချိန်ဇယားကို တစ်ချက်ကြည့်ပြီး ကြော်ငြာ၊ ပရိုမို၊ အစီရင်ခံစာသို့ သွားပါ',
  marketingHomeBangkokBadge: 'ဘန်ကောက်အချိန်',
  marketingHomeStatOngoing: 'လက်ရှိကမ်ပိန်း',
  marketingHomeStatToday: 'ယနေ့အတွင်း',
  marketingHomeStatTotal: 'ကမ်ပိန်းအားလုံး',
  marketingHomeStatOverBudget: 'ဘတ်ဂျက်ကျော်သည် (နမူနာ)',
  marketingHomeQuickLinks: 'အမြန်လင့်ခ်',
  marketingHomeRecentOngoing: 'လက်ရှိကမ်ပိန်း',
  marketingHomeViewAll: 'အားလုံးကြည့်',
  marketingHomeNoOngoing: 'လက်ရှိကမ်ပိန်းမရှိပါ',
  marketingHeroDescCampaigns: 'ကမ်ပိန်းအချက်အလက်၊ ကုန်ကျစရိတ်နှင့် hub လင့်ခ်များ (ကြော်ငြာ၊ influencer၊ promo)',
  marketingHeroDescCollab: 'ပါတနာကမ်ပိန်းအတွက် လျှော့စျေး၊ အထောက်အထား၊ မီနူးအကန့်အသတ်ကို ကမ်ပိန်းအလိုက် စီမံခန့်ခွဲပါ',
  marketingHeroDescPromos: 'POS·Grab promo set များကို ကမ်ပိန်းအလိုက် ဖန်တီး/ကြည့်ရှုပါ (POS နှင့် တူညီသော သိမ်းဆည်းမှု)',
  marketingHeroDescAds: 'SNS/boost ကြော်ငြာနှင့် အမှန်တကယ် ကုန်ကျစရိတ်ကို ကမ်ပိန်းနှင့် ချိတ်ဆက် ROAS ခွဲခြမ်းစိတ်ဖြာ',
  marketingHeroDescInfluencers: 'Influencer ခန့်အပ်မှု၊ ပေးအပ်သော မီနူး၊ ထုတ်ဝေရက်စွဲ',
  marketingHeroDescMaterials: 'ပစ္စည်းများ၊ ဆိုင်တင်ဆက်မှု၊ လက်ဆောင်များကို ကမ်ပိန်းနှင့် ချိတ်ဆက်ခြေရာခံ',
  marketingHeroDescCalendar: 'ကမ်ပိန်း·ကြော်ငြာ·promo အချိန်ဇယားကို ဘန်ကောက်အချိန်ဖြင့် တစ်နေရာတည်း',
  marketingHeroDescReport: 'လစဉ်ကုန်ကျစရိတ်·KPI·ဘတ်ဂျက်နှိုင်းယှဉ် hub',
  marketingHeroDescIntegrations: 'LINE OA·Meta·TikTok ချိတ်ဆက်မှုအခြေအနေနှင့် စမ်းသပ်ကိရိယာ',
  marketingCostsHubNoteLead: 'အမှန်တကယ် ကုန်ကျစရိတ် ချိတ်ဆက်မှု',
  marketingCostsHubNoteBold: 'ကမ်ပိန်း ID',
  marketingCostsHubNoteTrail: ' (ဘဏ်/Petty). ဘတ်ဂျက်·ကုန်ကျစရိတ်ရှိသော ကမ်ပိန်းများသာ',
  marketingIntegrationStatusConfigured: 'Env သတ်မှတ်ပြီး',
  marketingIntegrationStatusUnknown: 'မအတည်ပြုရသေး · စမ်းသပ်ရန်',
  marketingIntegrationStatusDocs: 'developer docs',
  marketingIntegrationLineSubtitle: 'Messaging API, LIFF, Broadcast → မွေးနေ့ coupon, push, CRM',
  marketingIntegrationTestSegmentBtn: 'Segment စာရင်း စမ်းသပ်',
  marketingIntegrationTestGroupBtn: 'Group စာရင်း စမ်းသပ်',
  marketingIntegrationTestGroupV2Btn: 'Group V2 စာရင်း စမ်းသပ်',
  marketingIntegrationMetaSubtitle: 'Marketing API → actual spend, reach, click (ROAS)',
  marketingIntegrationTikTokSubtitle: 'TikTok Marketing API → sync spend and performance',
  marketingIntegrationMetaEnvLine2: 'ကြော်ငြာအကောင့် ID ချိတ်ဆက်ရန် လိုအပ်',
  marketingIntegrationTikTokEnvLine2: 'OAuth authorization flow လိုအပ်',
  helpSum_admin_marketing: 'စျေးကွက် KPI·လက်ရှိကမ်ပိန်း·ဘတ်ဂျက် hub',
  helpHow_admin_marketing:
    '① KPI ကတ်များ စစ်ဆေး ② အမြန်လင့်ခ် ③ submenu မှ အသေးစိတ်မျက်နှာပြင်',
  helpSum_admin_marketing_campaigns: 'ကမ်ပိန်း ဖန်တီး/ပြင်ဆင်/စာရင်း/A-B နှိုင်းယှဉ် hub',
  helpHow_admin_marketing_campaigns: '① ဖန်တီး/ပြင်ဆင် ② စာရင်း ③ A/B',
  helpSum_admin_marketing_collab_menus: 'ပူးပေါင်းမှု POS လျှော့စျေး',
  helpHow_admin_marketing_collab_menus: '① ရွေးချယ် ② သိမ်းဆည်း ③ ကြည့်',
  helpSum_admin_marketing_promos: 'POS·Grab promo set',
  helpHow_admin_marketing_promos: '① ရွေးချယ် ② ဖန်တီး ③ စာရင်း',
  helpSum_admin_marketing_ads: 'SNS ကြော်ငြာ',
  helpHow_admin_marketing_ads: '① သိမ်းဆည်း ② ကုန်ကျ ③ ကြည့်',
  helpSum_admin_marketing_influencers: 'Influencer, menu',
  helpHow_admin_marketing_influencers: '① မှတ်ပုံတင် ② ရှာဖွေ',
  helpSum_admin_marketing_materials: 'ပစ္စည်း၊ ဆိုင်တင်ဆက်မှု၊ လက်ဆောင်',
  helpHow_admin_marketing_materials: '① မှတ်ပုံတင် ② လက်ဆောင်',
  helpSum_admin_marketing_calendar: 'ဘန်ကောက် ပြက္ခဒိန်',
  helpHow_admin_marketing_calendar: '① layer ② ရက် ③ filter',
  helpSum_admin_marketing_report: 'လစဉ် KPI အစီရင်ခံ',
  helpHow_admin_marketing_report: '① လ ② KPI ③ ဘတ်ဂျက် ④ ပြက္ခဒိန်',
  helpSum_admin_marketing_integrations: 'LINE·Meta·TikTok API',
  helpHow_admin_marketing_integrations: '① API test ② env ③ staging',
})

export const I18N_MARKETING_HUB_LA = hubFromEn({
  adminMarketingIntegrationsDesc: 'ຕັ້ງຄ່າສຳລັບ LINE OA, Meta(IG/FB), TikTok API',
  marketingSubnavAria: 'ເມນູການຕະຫຼາດ',
  marketingHomeTitle: 'ສູນການຕະຫຼາດ',
  marketingHomeDesc: 'ເບິ່ງແຄມເປນທີ່ດຳເນີນຢູ່ ງົບປະມານ ແລະໄປຫາໂຄສະນາ ໂປຣໂມ ລາຍງານ',
  marketingHomeBangkokBadge: 'ເວລາກຸງເທพ',
  marketingHomeStatOngoing: 'ແຄມເປນທີ່ດຳເນີນຢູ່',
  marketingHomeStatToday: 'ຢູ່ໃນຊ່ວງມື້ນີ້',
  marketingHomeStatTotal: 'ແຄມເປນທັງໝົດ',
  marketingHomeStatOverBudget: 'ເກີນງົບ (ຕົວຢ່າງ)',
  marketingHomeQuickLinks: 'ລິ້ງດ່ວນ',
  marketingHomeRecentOngoing: 'ແຄມເປນທີ່ດຳເນີນຢູ່',
  marketingHomeViewAll: 'ເບິ່ງທັງໝົດ',
  marketingHomeNoOngoing: 'ບໍ່ມີແຄມເປນທີ່ດຳເນີນຢູ່',
  marketingHeroDescCampaigns: 'ສູນກາງແຄມເປນ ຕົ້ນທຶນ ແລະລິ້ງໂຄສະນາ ອິນຟລູ ໂປຣໂມ',
  marketingHeroDescCollab: 'ຈັດການສ່ວນຫຼຸດຄູ່ຮ່ວມງານ ຫຼັກຖານ ແລະຂອບເຂດເມນູ',
  marketingHeroDescPromos: 'ສ້າງ/ເບິ່ງຊຸດໂປຣໂມ POS·Grab (ບັນທຶກເທົ່າ POS)',
  marketingHeroDescAds: 'ເຊື່ອມໂຄສະນາ SNS/boost ແລະຄ່າໃຊ້ຈ່າຍຈິງ (ROAS)',
  marketingHeroDescInfluencers: 'ຈັດການອິນຟລູ ເມນູ ແລະວັນເຜີຍແພຣ',
  marketingHeroDescMaterials: 'ຕິດຕາມສື່ ການຕິດຕັ້ງຮ້ານ ແລະຂອງແຖມ',
  marketingHeroDescCalendar: 'ຕາຕະລາງແຄມເປນ ໂຄສະນາ ໂປຣໂມ (ເວລາກຸງເທพ)',
  marketingHeroDescReport: 'ຕົ້ນທຶນລາຍເດືອນ KPI ປະຕິທິນ ແລະງົບເທົ່າຈິງ',
  marketingHeroDescIntegrations: 'ສະຖານະ ແລະເຄື່ອງມືທົດສອບ LINE · Meta · TikTok',
  marketingCostsHubNoteLead: 'ຄ່າໃຊ້ຈ່າຍຈິງເຊື່ອມດ້ວຍ',
  marketingCostsHubNoteBold: 'ລະຫັດແຄມເປນ',
  marketingCostsHubNoteTrail: ' ຈາກທະນາຄານ/Petty',
  marketingIntegrationStatusConfigured: 'ຕັ້ງຄ່າ env ແລ້ວ',
  marketingIntegrationStatusUnknown: 'ຍັງບໍ່ຢືນຢັນ · ທົດສອບ',
  marketingIntegrationStatusDocs: 'ເອກະສານນັກພັດທະນາ',
  marketingIntegrationLineSubtitle: 'Messaging API, LIFF, Broadcast → ຄູປອງ CRM',
  marketingIntegrationTestSegmentBtn: 'ທົດສອບ Segment',
  marketingIntegrationTestGroupBtn: 'ທົດສອບ Group',
  marketingIntegrationTestGroupV2Btn: 'ທົດສອບ Group V2',
  marketingIntegrationMetaSubtitle: 'Marketing API → ຄ່າໃຊ້ຈິງ ROAS',
  marketingIntegrationTikTokSubtitle: 'TikTok Marketing API → ຊິງຄ໌ຄ່າໃຊ້ຈ່າຍ',
  marketingIntegrationMetaEnvLine2: 'ຕ້ອງເຊື່ອມບັນຊີໂຄສະນາ',
  marketingIntegrationTikTokEnvLine2: 'ຕ້ອງ implement OAuth',
  helpSum_admin_marketing: 'ສູນ KPI ການຕະຫຼາດ ແລະລິ້ງດ່ວນ',
  helpHow_admin_marketing: '① KPI ② ລິ້ງດ່ວນ ③ ເມນູຍ່ອຍ',
  helpSum_admin_marketing_campaigns: 'ສ້າງ/ແກ້ໄຂ/ລາຍການ/A-B ແຄມເປນ',
  helpHow_admin_marketing_campaigns: '① ສ້າງ/ແກ້ໄຂ ② ລາຍການ ③ A/B',
  helpSum_admin_marketing_collab_menus: 'ສ່ວນຫຼຸດ POS ຄູ່ຮ່ວມງານ',
  helpHow_admin_marketing_collab_menus: '① ເລືອก ② ບັນທຶก ③ ເບິ່ງ',
  helpSum_admin_marketing_promos: 'ຊຸດໂປຣໂມ POS·Grab',
  helpHow_admin_marketing_promos: '① ເລືອก ② ສ້າງ ③ ລາຍການ',
  helpSum_admin_marketing_ads: 'ໂຄສະນາ SNS ແລະຄ່າໃຊ້ຈ່າຍ',
  helpHow_admin_marketing_ads: '① ບັນທຶก ② ຄ່າໃຊ້ຈ່າຍ ③ ເບິ່ງ',
  helpSum_admin_marketing_influencers: 'ອິນຟລູ ເມນູ ວັນເຜີຍແພຣ',
  helpHow_admin_marketing_influencers: '① ລົງທະບຽນ ② ຄົ້ນຫາ',
  helpSum_admin_marketing_materials: 'ສື່ ຮ້ານ ຂອງແຖມ',
  helpHow_admin_marketing_materials: '① ລົງທະບຽນ ② ຂອງແຖມ',
  helpSum_admin_marketing_calendar: 'ປະຕິທິນລວມ (ກຸງເທพ)',
  helpHow_admin_marketing_calendar: '① ເລເຢີ ② ວັນທີ ③ ກອງ',
  helpSum_admin_marketing_report: 'ລາຍງານ KPI ຕົ້ນທຶນ',
  helpHow_admin_marketing_report: '① ເດືອນ ② KPI ③ ງົບ ④ ປະຕິທິນ',
  helpSum_admin_marketing_integrations: 'API LINE · Meta · TikTok',
  helpHow_admin_marketing_integrations: '① ທົດສອບ ② env ③ staging',
})

export const I18N_MARKETING_HUB_KH = hubFromEn({
  adminMarketingIntegrationsDesc: 'ការកំណត់សម្រាប់ LINE OA, Meta(IG/FB), TikTok API',
  marketingSubnavAria: 'ម៉ឺនុយទីផ្សារ',
  marketingHomeTitle: 'មជ្ឈមណ្ឌលទីផ្សារ',
  marketingHomeDesc: 'មើលយុទ្ធនាការកំពុងដំណើរការ ថវិកា ហើយទៅកាន់ពាណិជ្ជកម្ម ប្រូម៉ូ របាយការណ៍',
  marketingHomeBangkokBadge: 'ម៉ោងបាងកក',
  marketingHomeStatOngoing: 'យុទ្ធនាការកំពុងដំណើរការ',
  marketingHomeStatToday: 'សកម្មថ្ងៃនេះ',
  marketingHomeStatTotal: 'យុទ្ធនាការទាំងអស់',
  marketingHomeStatOverBudget: 'លើសថវិកា (គំរូ)',
  marketingHomeQuickLinks: 'តំណភ្ជាប់រហ័ស',
  marketingHomeRecentOngoing: 'យុទ្ធនាការកំពុងដំណើរការ',
  marketingHomeViewAll: 'មើលទាំងអស់',
  marketingHomeNoOngoing: 'គ្មានយុទ្ធនាការកំពុងដំណើរការ',
  marketingHeroDescCampaigns: 'មជ្ឈមណ្ឌលព័ត៌មានយុទ្ធនាការ ថ្លៃដើម និងតំណ hub',
  marketingHeroDescCollab: 'គ្រប់គ្រងបញ្ចុះតម្លៃដៃគូ ភស្តុតាង និងវិសាលភាពmenu',
  marketingHeroDescPromos: 'បង្កើត/មើល promo POS·Grab (រក្សាទុកដូច POS)',
  marketingHeroDescAds: 'ភ្ជាប់ពាណិជ្ជកម្ម SNS និងចំណាយពិត ROAS',
  marketingHeroDescInfluencers: 'គ្រប់គ្រង influencer menu និងកាលបរិច្ឆេទ',
  marketingHeroDescMaterials: 'តាមដានសម្ភារៈ ហាង និងអំណោយ',
  marketingHeroDescCalendar: 'ប្រតិទិនទីផ្សាររួម (បាងកក)',
  marketingHeroDescReport: 'ថ្លៃដើម KPI ប្រតិទិន និងថវិកាធៀបពិត',
  marketingHeroDescIntegrations: 'ស្ថានភាព LINE · Meta · TikTok',
  marketingCostsHubNoteLead: 'ចំណាយពិតភ្ជាប់ដោយ',
  marketingCostsHubNoteBold: 'លេខសម្គាល់យុទ្ធនាការ',
  marketingCostsHubNoteTrail: ' ពីធនាគារ/Petty',
  marketingIntegrationStatusConfigured: 'បានកំណត់ env',
  marketingIntegrationStatusUnknown: 'មិនទាន់បញ្ជាក់ · ធ្វើតេស្ត',
  marketingIntegrationStatusDocs: 'ឯកសារអ្នកអភិវឌ្ឍ',
  marketingIntegrationLineSubtitle: 'Messaging API, LIFF, Broadcast → CRM',
  marketingIntegrationTestSegmentBtn: 'ធ្វើតេស្ត Segment',
  marketingIntegrationTestGroupBtn: 'ធ្វើតេស្ត Group',
  marketingIntegrationTestGroupV2Btn: 'ធ្វើតេស្ត Group V2',
  marketingIntegrationMetaSubtitle: 'Marketing API → ROAS',
  marketingIntegrationTikTokSubtitle: 'TikTok Marketing API → ធ្វើសមកាលកម្ម',
  marketingIntegrationMetaEnvLine2: 'ត្រូវការភ្ជាប់លេខគណនីពាណិជ្ជកម្ម',
  marketingIntegrationTikTokEnvLine2: 'ត្រូវការ OAuth flow',
  helpSum_admin_marketing: 'មជ្ឈមណ្ឌល KPI ទីផ្សារ',
  helpHow_admin_marketing: '① KPI ② តំណរហ័ស ③ ម៉ឺនុយ',
  helpSum_admin_marketing_campaigns: 'បង្កើត/កែ/បញ្ជី/A-B',
  helpHow_admin_marketing_campaigns: '① បង្កើត ② បញ្ជី ③ A/B',
  helpSum_admin_marketing_collab_menus: 'បញ្ចុះតម្លៃ POS ដៃគូ',
  helpHow_admin_marketing_collab_menus: '① ជ្រើស ② រក្សាទុក ③ មើល',
  helpSum_admin_marketing_promos: 'Promo POS·Grab',
  helpHow_admin_marketing_promos: '① ជ្រើស ② បង្កើត ③ បញ្ជី',
  helpSum_admin_marketing_ads: 'ពាណិជ្ជកម្ម SNS',
  helpHow_admin_marketing_ads: '① រក្សាទុក ② ចំណាយ ③ មើល',
  helpSum_admin_marketing_influencers: 'Influencer menu',
  helpHow_admin_marketing_influencers: '① ចុះឈ្មោះ ② ស្វែងរក',
  helpSum_admin_marketing_materials: 'សម្ភារៈ ហាង អំណោយ',
  helpHow_admin_marketing_materials: '① ចុះឈ្មោះ ② អំណោយ',
  helpSum_admin_marketing_calendar: 'ប្រតិទិនរួម',
  helpHow_admin_marketing_calendar: '① ស្រទាប់ ② ថ្ងៃ ③ តម្រង',
  helpSum_admin_marketing_report: 'របាយការណ៍ KPI',
  helpHow_admin_marketing_report: '① ខែ ② KPI ③ ថវិកា ④ ប្រតិទិន',
  helpSum_admin_marketing_integrations: 'API LINE · Meta · TikTok',
  helpHow_admin_marketing_integrations: '① ធ្វើតេស្ត ② env ③ staging',
})

export const I18N_MARKETING_HUB_VI = hubFromEn({
  adminMarketingIntegrationsDesc: 'Cài đặt tích hợp LINE OA, Meta(IG/FB), TikTok API',
  marketingSubnavAria: 'Menu marketing',
  marketingHomeTitle: 'Trung tâm marketing',
  marketingHomeDesc: 'Xem chiến dịch đang chạy, ngân sách và chuyển nhanh tới quảng cáo, promo, báo cáo',
  marketingHomeBangkokBadge: 'Giờ Bangkok',
  marketingHomeStatOngoing: 'Chiến dịch đang chạy',
  marketingHomeStatToday: 'Hoạt động hôm nay',
  marketingHomeStatTotal: 'Tất cả chiến dịch',
  marketingHomeStatOverBudget: 'Vượt ngân sách (mẫu)',
  marketingHomeQuickLinks: 'Liên kết nhanh',
  marketingHomeRecentOngoing: 'Chiến dịch đang chạy',
  marketingHomeViewAll: 'Xem tất cả',
  marketingHomeNoOngoing: 'Không có chiến dịch đang chạy',
  marketingHeroDescCampaigns: 'Trung tâm thông tin chiến dịch, chi phí và liên kết hub',
  marketingHeroDescCollab: 'Quản lý giảm giá đối tác, chứng từ và phạm vi menu',
  marketingHeroDescPromos: 'Tạo/xem bộ promo POS·Grab (logic lưu giống POS)',
  marketingHeroDescAds: 'Liên kết quảng cáo SNS/boost và chi phí thực tế ROAS',
  marketingHeroDescInfluencers: 'Quản lý influencer, menu và lịch đăng',
  marketingHeroDescMaterials: 'Theo dõi tài liệu, triển khai cửa hàng và quà tặng',
  marketingHeroDescCalendar: 'Lịch marketing tổng hợp (Bangkok)',
  marketingHeroDescReport: 'Chi phí tháng, KPI, lịch và ngân sách so thực tế',
  marketingHeroDescIntegrations: 'Trạng thái và công cụ thử LINE · Meta · TikTok',
  marketingCostsHubNoteLead: 'Chi phí thực liên kết bằng',
  marketingCostsHubNoteBold: 'ID chiến dịch',
  marketingCostsHubNoteTrail: ' từ ngân hàng/Petty',
  marketingIntegrationStatusConfigured: 'Đã cấu hình env',
  marketingIntegrationStatusUnknown: 'Chưa xác minh · chạy thử',
  marketingIntegrationStatusDocs: 'Tài liệu nhà phát triển',
  marketingIntegrationLineSubtitle: 'Messaging API, LIFF, Broadcast → CRM',
  marketingIntegrationTestSegmentBtn: 'Thử danh sách Segment',
  marketingIntegrationTestGroupBtn: 'Thử danh sách Group',
  marketingIntegrationTestGroupV2Btn: 'Thử danh sách Group V2',
  marketingIntegrationMetaSubtitle: 'Marketing API → ROAS',
  marketingIntegrationTikTokSubtitle: 'TikTok Marketing API → đồng bộ chi phí',
  marketingIntegrationMetaEnvLine2: 'Cần liên kết ID tài khoản quảng cáo',
  marketingIntegrationTikTokEnvLine2: 'Cần triển khai luồng OAuth',
  helpSum_admin_marketing: 'Trung tâm KPI marketing',
  helpHow_admin_marketing: '① KPI ② Liên kết nhanh ③ Menu phụ',
  helpSum_admin_marketing_campaigns: 'Tạo/sửa/danh sách/A-B chiến dịch',
  helpHow_admin_marketing_campaigns: '① Tạo/sửa ② Danh sách ③ A/B',
  helpSum_admin_marketing_collab_menus: 'Giảm giá POS đối tác',
  helpHow_admin_marketing_collab_menus: '① Chọn ② Lưu ③ Xem',
  helpSum_admin_marketing_promos: 'Bộ promo POS·Grab',
  helpHow_admin_marketing_promos: '① Chọn ② Tạo ③ Danh sách',
  helpSum_admin_marketing_ads: 'Quảng cáo SNS',
  helpHow_admin_marketing_ads: '① Lưu ② Chi phí ③ Xem',
  helpSum_admin_marketing_influencers: 'Influencer, menu',
  helpHow_admin_marketing_influencers: '① Đăng ký ② Tìm kiếm',
  helpSum_admin_marketing_materials: 'Tài liệu, cửa hàng, quà',
  helpHow_admin_marketing_materials: '① Đăng ký ② Quà',
  helpSum_admin_marketing_calendar: 'Lịch tổng hợp (Bangkok)',
  helpHow_admin_marketing_calendar: '① Lớp ② Ngày ③ Lọc',
  helpSum_admin_marketing_report: 'Báo cáo KPI chi phí',
  helpHow_admin_marketing_report: '① Tháng ② KPI ③ Ngân sách ④ Lịch',
  helpSum_admin_marketing_integrations: 'API LINE · Meta · TikTok',
  helpHow_admin_marketing_integrations: '① Thử API ② env ③ staging',
})

export const I18N_MARKETING_HUB_MS = hubFromEn({
  adminMarketingIntegrationsDesc: 'Tetapan integrasi LINE OA, Meta(IG/FB), TikTok API',
  marketingSubnavAria: 'Menu pemasaran',
  marketingHomeTitle: 'Hab pemasaran',
  marketingHomeDesc: 'Lihat kempen aktif, bajet dan pergi ke iklan, promo, laporan',
  marketingHomeBangkokBadge: 'Waktu Bangkok',
  marketingHomeStatOngoing: 'Kempen berjalan',
  marketingHomeStatToday: 'Aktif hari ini',
  marketingHomeStatTotal: 'Semua kempen',
  marketingHomeStatOverBudget: 'Melebihi bajet (contoh)',
  marketingHomeQuickLinks: 'Pautan pantas',
  marketingHomeRecentOngoing: 'Kempen berjalan',
  marketingHomeViewAll: 'Lihat semua',
  marketingHomeNoOngoing: 'Tiada kempen berjalan',
  marketingHeroDescCampaigns: 'Hab maklumat kempen, kos dan pautan hub',
  marketingHeroDescCollab: 'Urus diskaun rakan kongsi, bukti dan skop menu',
  marketingHeroDescPromos: 'Bina/lihat set promo POS·Grab (logik simpan sama POS)',
  marketingHeroDescAds: 'Pautkan iklan SNS/boost dan perbelanjaan sebenar ROAS',
  marketingHeroDescInfluencers: 'Urus influencer, menu dan tarikh siaran',
  marketingHeroDescMaterials: 'Jejaki bahan, peletakan kedai dan hadiah',
  marketingHeroDescCalendar: 'Jadual pemasaran (waktu Bangkok)',
  marketingHeroDescReport: 'Kos bulanan, KPI, kalendar dan bajet vs sebenar',
  marketingHeroDescIntegrations: 'Status dan alat ujian LINE · Meta · TikTok',
  marketingCostsHubNoteLead: 'Kos sebenar dipautkan dengan',
  marketingCostsHubNoteBold: 'ID kempen',
  marketingCostsHubNoteTrail: ' dari bank/Petty',
  marketingIntegrationStatusConfigured: 'Env dikonfigurasi',
  marketingIntegrationStatusUnknown: 'Belum disahkan · uji',
  marketingIntegrationStatusDocs: 'Dokumentasi pembangun',
  marketingIntegrationLineSubtitle: 'Messaging API, LIFF, Broadcast → CRM',
  marketingIntegrationTestSegmentBtn: 'Uji senarai Segment',
  marketingIntegrationTestGroupBtn: 'Uji senarai Group',
  marketingIntegrationTestGroupV2Btn: 'Uji senarai Group V2',
  marketingIntegrationMetaSubtitle: 'Marketing API → ROAS',
  marketingIntegrationTikTokSubtitle: 'TikTok Marketing API → segerak perbelanjaan',
  marketingIntegrationMetaEnvLine2: 'Pautan ID akaun iklan diperlukan',
  marketingIntegrationTikTokEnvLine2: 'Aliran OAuth perlu dilaksanakan',
  helpSum_admin_marketing: 'Hab KPI pemasaran',
  helpHow_admin_marketing: '① KPI ② Pautan pantas ③ Submenu',
  helpSum_admin_marketing_campaigns: 'Cipta/sunting/senarai/A-B kempen',
  helpHow_admin_marketing_campaigns: '① Cipta/sunting ② Senarai ③ A/B',
  helpSum_admin_marketing_collab_menus: 'Diskaun POS rakan kongsi',
  helpHow_admin_marketing_collab_menus: '① Pilih ② Simpan ③ Lihat',
  helpSum_admin_marketing_promos: 'Set promo POS·Grab',
  helpHow_admin_marketing_promos: '① Pilih ② Bina ③ Senarai',
  helpSum_admin_marketing_ads: 'Iklan SNS',
  helpHow_admin_marketing_ads: '① Simpan ② Kos ③ Lihat',
  helpSum_admin_marketing_influencers: 'Influencer, menu',
  helpHow_admin_marketing_influencers: '① Daftar ② Cari',
  helpSum_admin_marketing_materials: 'Bahan, kedai, hadiah',
  helpHow_admin_marketing_materials: '① Daftar ② Hadiah',
  helpSum_admin_marketing_calendar: 'Kalendar disatukan (Bangkok)',
  helpHow_admin_marketing_calendar: '① Lapisan ② Hari ③ Tapis',
  helpSum_admin_marketing_report: 'Laporan KPI kos',
  helpHow_admin_marketing_report: '① Bulanan ② KPI ③ Bajet ④ Kalendar',
  helpSum_admin_marketing_integrations: 'API LINE · Meta · TikTok',
  helpHow_admin_marketing_integrations: '① Uji API ② env ③ staging',
})
