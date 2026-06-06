import type { LangCode } from '@/lib/lang-context'

export type MemberPortalKey =
  | 'premiumMembership'
  | 'loginSubtitle'
  | 'lineLoginTitle'
  | 'lineLoginDesc'
  | 'lineLoginBtn'
  | 'lineLoginPreparing'
  | 'phoneBirthTitle'
  | 'phoneBirthDesc'
  | 'phoneLabel'
  | 'birthDateLabel'
  | 'loginBtn'
  | 'loginChecking'
  | 'footerPrivacy'
  | 'footerContactUs'
  | 'footerLegalIntro'
  | 'footerTerms'
  | 'footerPrivacyPolicy'
  | 'contactMenuTitle'
  | 'contactViaFacebook'
  | 'contactViaInstagram'
  | 'contactViaLineOfficial'
  | 'contactMenuClose'
  | 'profileContactTitle'
  | 'profileContactSub'
  | 'memberLounge'
  | 'logout'
  | 'tierNext'
  | 'tierMax'
  | 'tierProgress'
  | 'tierProgressPoints'
  | 'tierGuideTitle'
  | 'tierGuideDesc'
  | 'tierGuideViewBtn'
  | 'tierBenefitsTitle'
  | 'tierBenefitsDesc'
  | 'tierBenefitsEmpty'
  | 'tierCurrentBadge'
  | 'tierEarnRate'
  | 'statLifetime'
  | 'homeFeatureLabel'
  | 'homeFeatureEmpty'
  | 'homeFeatureTap'
  | 'homePromoTitle'
  | 'homePromoThisMonth'
  | 'homePromoEmpty'
  | 'homePromoPrevMonth'
  | 'homePromoNextMonth'
  | 'statVisits'
  | 'statAvgTicket'
  | 'statCoupons'
  | 'statPointsEarned'
  | 'referTitle'
  | 'referDesc'
  | 'copyCode'
  | 'shareText'
  | 'copy'
  | 'copied'
  | 'recentPoints'
  | 'noRecords'
  | 'tabHome'
  | 'tabOrder'
  | 'tabLocation'
  | 'tabPrivilege'
  | 'tabMe'
  | 'orderTitle'
  | 'orderDesc'
  | 'orderPickupBtn'
  | 'orderDeliveryBtn'
  | 'orderPickupHubDesc'
  | 'orderDeliveryHubDesc'
  | 'orderDeliveryDesc'
  | 'orderDeliveryNote'
  | 'orderBack'
  | 'orderPickupSavingsDesc'
  | 'orderSelectStore'
  | 'orderSelectStorePh'
  | 'orderSelectStoreFirst'
  | 'orderPickupTime'
  | 'orderPickupTimeHint'
  | 'orderPickupContinue'
  | 'orderPickupSetupBack'
  | 'orderPickupSummary'
  | 'orderPickupTooSoon'
  | 'orderMemberNoticeTitle'
  | 'orderMemberNoticeBody'
  | 'orderMemberNoticeOk'
  | 'orderMenuLoadFail'
  | 'orderMenuEmpty'
  | 'orderMenuOptionsNote'
  | 'orderCategoryAll'
  | 'orderMainCategory'
  | 'orderSubCategory'
  | 'orderSelectSubCategory'
  | 'orderClearCart'
  | 'orderCartConfirmTitle'
  | 'orderCartConfirmBody'
  | 'orderCartConfirmBtn'
  | 'orderPayAtPickup'
  | 'orderViewCart'
  | 'orderItemCount'
  | 'orderSelectOption'
  | 'orderOptionBack'
  | 'orderOptionStep'
  | 'orderBanbanNote'
  | 'orderAdd'
  | 'orderCartTitle'
  | 'orderCartTotal'
  | 'orderSubmit'
  | 'orderSubmitSuccess'
  | 'orderSubmitFail'
  | 'pickup_too_soon'
  | 'empty_cart'
  | 'store_required'
  | 'invalid_pickup_time'
  | 'locationTitle'
  | 'locationDesc'
  | 'locationComing'
  | 'locationEmpty'
  | 'locationSearchPh'
  | 'locationNoResult'
  | 'locationOpenMap'
  | 'locationOpenGoogleMaps'
  | 'locationCode'
  | 'locationFavorite'
  | 'locationFavoriteSet'
  | 'locationFavoriteSaved'
  | 'locationFavoriteRemoved'
  | 'quickOrderTitle'
  | 'quickOrderDesc'
  | 'quickOrderPickup'
  | 'quickOrderDelivery'
  | 'quickOrderStoreHint'
  | 'privilegeTitle'
  | 'privilegeDesc'
  | 'couponsTitle'
  | 'couponsSub'
  | 'noCoupons'
  | 'issuedAt'
  | 'historyTitle'
  | 'historySub'
  | 'recentOrders'
  | 'noOrders'
  | 'store'
  | 'pointsHistory'
  | 'noPoints'
  | 'profileTitle'
  | 'profileSub'
  | 'nameLabel'
  | 'emailLabel'
  | 'genderLabel'
  | 'genderMale'
  | 'genderFemale'
  | 'nationalityLabel'
  | 'nationalityPlaceholder'
  | 'referralInputLabel'
  | 'consentMarketing'
  | 'consentMarketingSignupHint'
  | 'consentMarketingCouponHint'
  | 'signup_success_created_with_coupon'
  | 'saveProfile'
  | 'saveProfileChanges'
  | 'profileReferralLocked'
  | 'myReferralCode'
  | 'saving'
  | 'memberNo'
  | 'joined'
  | 'lastVisit'
  | 'points'
  | 'memberNoShort'
  | 'membership'
  | 'lineFriendAdded'
  | 'lineFriendConnected'
  | 'loginFailed'
  | 'saveFailed'
  | 'showQr'
  | 'hideQr'
  | 'scanAtCounter'
  | 'membershipQrHint'
  | 'membershipQrReady'
  | 'copyMemberNo'
  | 'memberNoCopied'
  | 'showCouponQr'
  | 'couponQrTitle'
  | 'couponQrHint'
  | 'scanCouponAtStore'
  | 'pwaInstallTitle'
  | 'pwaInstallDesc'
  | 'pwaInstallBtn'
  | 'pwaInstallDismiss'
  | 'pwaInstallIosHint'
  | 'pwaInstallAndroidHint'
  | 'greetingMorning'
  | 'greetingAfternoon'
  | 'greetingEvening'
  | 'homeWelcomeSub'
  | 'homeQuickOrder'
  | 'homeQuickStores'
  | 'homeQuickCoupons'
  | 'homeQuickProfile'
  | 'err_line_not_configured'
  | 'err_line_bad_channel_id'
  | 'err_line_state_mismatch'
  | 'err_access_denied'
  | 'pointKind_earn'
  | 'pointKind_use'
  | 'pointKind_adjust'
  | 'pointKind_expire'
  | 'coupon_issued'
  | 'coupon_used'
  | 'coupon_expired'
  | 'coupon_restored'
  | 'coupon_cancelled'
  | 'couponExpiresAt'
  | 'couponCampaign'
  | 'couponCondition'
  | 'couponScope'
  | 'couponBenefit'
  | 'couponMinOrder'
  | 'couponStackRule'
  | 'langLabel'
  | 'birthDayLabel'
  | 'birthMonthLabel'
  | 'birthYearLabel'
  | 'birthDayPlaceholder'
  | 'birthMonthPlaceholder'
  | 'birthYearPlaceholder'
  | 'birthDateHint'
  | 'month1'
  | 'month2'
  | 'month3'
  | 'month4'
  | 'month5'
  | 'month6'
  | 'month7'
  | 'month8'
  | 'month9'
  | 'month10'
  | 'month11'
  | 'month12'
  | 'login_missing_phone'
  | 'login_missing_birth'
  | 'login_rate_limited'
  | 'login_not_found'
  | 'login_inactive'
  | 'signupTitle'
  | 'signupDesc'
  | 'signupNameLabel'
  | 'signupBtn'
  | 'signupChecking'
  | 'signup_or'
  | 'signup_success_created'
  | 'signup_success_existing'
  | 'signup_missing_name'
  | 'signup_missing_gender'
  | 'signup_exists_other_birth'
  | 'lineBtnWithLogo'
  | 'bgPresetLabel'
  | 'bgPresetSoft'
  | 'bgPresetChic'

type Dict = Partial<Record<LangCode, string>> & { en: string; th: string; ko: string }

const MS: Record<MemberPortalKey, Dict> = {
  premiumMembership: {
    en: 'Premium Membership',
    th: 'สมาชิกพรีเมียม',
    ko: '프리미엄 멤버십',
  },
  loginSubtitle: {
    en: 'A lovely K-style membership lounge for points, coupons, and your visit story.',
    th: 'เลานจ์สมาชิกสไตล์เกาหลีสุดละมุน สำหรับแต้ม คูปอง และทุกเรื่องราวการมาใช้บริการ',
    ko: '감성적인 K-스타일 멤버십 라운지에서 포인트, 쿠폰, 이용 스토리를 한 번에 확인하세요.',
  },
  lineLoginTitle: { en: 'LINE Login', th: 'LINE Login', ko: 'LINE 로그인' },
  lineLoginDesc: {
    en: 'Recommended · Fast · No SMS cost · Add LINE OA as friend',
    th: 'แนะนำ · รวดเร็ว · ไม่เสียค่า SMS · เพิ่ม LINE OA เป็นเพื่อนได้',
    ko: '추천 · 빠름 · SMS 비용 없음 · LINE 공식계정 친구 추가 가능',
  },
  lineLoginBtn: { en: 'Sign in with LINE', th: 'เข้าสู่ระบบด้วย LINE', ko: 'LINE으로 로그인' },
  lineLoginPreparing: {
    en: 'LINE Login is being set up',
    th: 'LINE Login กำลังเตรียมพร้อม',
    ko: 'LINE 로그인 준비 중',
  },
  phoneBirthTitle: { en: 'Phone + birth date', th: 'เบอร์โทร + วันเกิด', ko: '전화번호 + 생년월일' },
  phoneBirthDesc: {
    en: 'For members already registered in our system',
    th: 'สำหรับสมาชิกที่ลงทะเบียนในระบบแล้ว',
    ko: '이미 등록된 회원용',
  },
  phoneLabel: { en: 'Phone number', th: 'เบอร์โทรศัพท์', ko: '전화번호' },
  birthDateLabel: { en: 'Birth date', th: 'วันเกิด', ko: '생년월일' },
  loginBtn: { en: 'Login', th: 'เข้าสู่ระบบ', ko: '로그인' },
  loginChecking: { en: 'Verifying…', th: 'กำลังตรวจสอบ...', ko: '확인 중…' },
  footerPrivacy: {
    en: 'Your data is stored securely · Choongman Chicken Thailand',
    th: 'ข้อมูลสมาชิกถูกเก็บรักษาอย่างปลอดภัย · Choongman Chicken Thailand',
    ko: '회원 정보는 안전하게 보관됩니다 · Choongman Chicken Thailand',
  },
  footerContactUs: {
    en: 'Contact us',
    th: 'ติดต่อเรา',
    ko: '문의하기',
  },
  footerLegalIntro: {
    en: "By using this app, you confirm that you're at least 18 and accept our",
    th: 'การใช้แอปนี้ถือว่าคุณมีอายุอย่างน้อย 18 ปี และยอมรับ',
    ko: '이 앱을 사용하면 만 18세 이상이며 다음 내용에 동의하는 것으로 간주됩니다:',
  },
  footerTerms: {
    en: 'Terms',
    th: 'ข้อกำหนดการใช้งาน',
    ko: '이용약관',
  },
  footerPrivacyPolicy: {
    en: 'Privacy Policy',
    th: 'นโยบายความเป็นส่วนตัว',
    ko: '개인정보처리방침',
  },
  contactMenuTitle: {
    en: 'Choose contact channel',
    th: 'เลือกช่องทางติดต่อ',
    ko: '문의 채널 선택',
  },
  contactViaFacebook: {
    en: 'Contact via Facebook',
    th: 'ติดต่อผ่าน Facebook',
    ko: 'Facebook으로 문의',
  },
  contactViaInstagram: {
    en: 'Contact via Instagram',
    th: 'ติดต่อผ่าน Instagram',
    ko: 'Instagram으로 문의',
  },
  contactViaLineOfficial: {
    en: 'LINE Official',
    th: 'LINE Official',
    ko: 'LINE 공식',
  },
  contactMenuClose: {
    en: 'Close',
    th: 'ปิด',
    ko: '닫기',
  },
  memberLounge: { en: 'Member Lounge', th: 'Member Lounge', ko: 'Member Lounge' },
  logout: { en: 'Logout', th: 'ออกจากระบบ', ko: '로그아웃' },
  tierNext: { en: 'Next tier', th: 'ระดับสมาชิกถัดไป', ko: '다음 등급' },
  tierMax: { en: 'You are at the highest tier', th: 'คุณอยู่ในระดับสูงสุดแล้ว', ko: '최고 등급입니다' },
  tierProgress: {
    en: '{amount} more to {tier}',
    th: 'อีก {amount} ถึง {tier}',
    ko: '{tier}까지 {amount} 남음',
  },
  tierProgressPoints: {
    en: '{amount} more to {tier}',
    th: 'อีก {amount} ถึง {tier}',
    ko: '{tier}까지 {amount} 남음',
  },
  tierGuideTitle: {
    en: 'Membership levels',
    th: 'ระดับสมาชิก',
    ko: '회원 등급',
  },
  tierGuideDesc: {
    en: 'Levels follow store policy (points or spend). Benefits may change anytime.',
    th: 'ระดับสมาชิกตามนโยบายร้าน (แต้มหรือยอดใช้จ่าย) สิทธิประโยชน์อาจเปลี่ยนแปลงได้',
    ko: '매장 정책(포인트 또는 누적금액)에 따라 등급이 정해집니다. 혜택은 수시로 변경될 수 있습니다.',
  },
  tierGuideViewBtn: {
    en: 'View membership levels',
    th: 'ดูระดับสมาชิก',
    ko: '회원 등급 안내',
  },
  tierBenefitsTitle: {
    en: 'Benefits by tier',
    th: 'สิทธิประโยชน์ตามระดับ',
    ko: '등급별 혜택',
  },
  tierBenefitsDesc: {
    en: 'Benefits provided at each membership level. Content may change without notice.',
    th: 'สิทธิประโยชน์ตามระดับสมาชิก เนื้อหาอาจเปลี่ยนแปลงได้',
    ko: '회원 등급별로 제공되는 혜택입니다. 내용은 변경될 수 있습니다.',
  },
  tierBenefitsEmpty: {
    en: 'No benefits listed for this tier yet.',
    th: 'ยังไม่มีสิทธิประโยชน์สำหรับระดับนี้',
    ko: '등록된 혜택이 없습니다.',
  },
  tierCurrentBadge: { en: 'Current', th: 'ระดับปัจจุบัน', ko: '현재 등급' },
  tierEarnRate: { en: 'Point earn rate', th: 'อัตราแต้มสะสม', ko: '포인트 적립율' },
  statLifetime: { en: 'Lifetime spend', th: 'ยอดใช้จ่ายสะสม', ko: '누적 이용 금액' },
  homeFeatureLabel: { en: 'New & promo', th: 'เมนูใหม่·โปร', ko: '신메뉴·프로모션' },
  homeFeatureEmpty: { en: 'Coming soon', th: 'เร็วๆ นี้', ko: '곧 공개' },
  homeFeatureTap: { en: 'Tap for details', th: 'แตะเพื่อดูรายละเอียด', ko: '탭하여 자세히 보기' },
  homePromoTitle: {
    en: 'Monthly promotions',
    th: 'โปรโมชั่นประจำเดือน',
    ko: '이달의 프로모션',
  },
  homePromoThisMonth: {
    en: 'This month',
    th: 'เดือนนี้',
    ko: '이번 달',
  },
  homePromoEmpty: {
    en: 'No promotions for this month.',
    th: 'ยังไม่มีโปรโมชั่นในเดือนนี้',
    ko: '이 달에 등록된 프로모션이 없습니다.',
  },
  homePromoPrevMonth: {
    en: 'Previous month',
    th: 'เดือนก่อนหน้า',
    ko: '이전 달',
  },
  homePromoNextMonth: {
    en: 'Next month',
    th: 'เดือนถัดไป',
    ko: '다음 달',
  },
  statVisits: { en: 'Visits', th: 'จำนวนครั้งที่มา', ko: '방문 횟수' },
  statAvgTicket: { en: 'Avg.', th: 'เฉลี่ย', ko: '평균' },
  statCoupons: { en: 'Coupons ready', th: 'คูปองพร้อมใช้', ko: '사용 가능 쿠폰' },
  statPointsEarned: { en: 'Points earned', th: 'แต้มที่ได้รับรวม', ko: '총 적립 포인트' },
  referTitle: { en: 'Refer a friend', th: 'ชวนเพื่อน รับแต้ม', ko: '친구 초대' },
  referDesc: {
    en: 'Share your referral code when friends sign up',
    th: 'แชร์รหัสแนะนำของคุณให้เพื่อนกรอกตอนสมัคร',
    ko: '친구가 가입할 때 추천 코드를 공유하세요',
  },
  copyCode: { en: 'Copy Code', th: 'Copy Code', ko: '코드 복사' },
  shareText: { en: 'Share Text', th: 'Share Text', ko: '공유 문구' },
  copy: { en: 'Copy', th: 'Copy', ko: '복사' },
  copied: { en: 'Copied!', th: 'Copied!', ko: '복사됨!' },
  recentPoints: { en: 'Recent points', th: 'ประวัติแต้มล่าสุด', ko: '최근 포인트' },
  noRecords: { en: 'No records yet', th: 'ยังไม่มีรายการ', ko: '내역 없음' },
  tabHome: { en: 'Home', th: 'หน้าแรก', ko: '홈' },
  tabOrder: { en: 'Order', th: 'สั่งซื้อ', ko: '주문' },
  tabLocation: { en: 'Location', th: 'สาขา', ko: '매장' },
  tabPrivilege: { en: 'Privilege', th: 'สิทธิพิเศษ', ko: '혜택' },
  tabMe: { en: 'Me', th: 'ฉัน', ko: '내정보' },
  orderTitle: { en: 'Order now', th: 'สั่งซื้อเลย', ko: '지금 주문' },
  orderDesc: {
    en: 'Pickup at store (member price) or order via delivery apps.',
    th: 'รับที่ร้านในราคาสมาชิก หรือสั่งผ่านแอปเดลิเวอรี',
    ko: '매장 픽업(회원가) 또는 배달앱 주문을 선택하세요.',
  },
  orderPickupBtn: { en: 'Pickup order', th: 'รับที่ร้าน', ko: '픽업 주문' },
  orderDeliveryBtn: { en: 'Delivery order', th: 'เดลิเวอรี', ko: '배달 주문' },
  orderPickupHubDesc: {
    en: 'Order for pickup at your store — about 10% cheaper than delivery apps.',
    th: 'สั่งรับที่ร้าน — ราคาถูกกว่าแอปเดลิเวอรีประมาณ 10%',
    ko: '매장 픽업 주문 — 배달앱보다 약 10% 저렴',
  },
  orderDeliveryHubDesc: {
    en: 'Open Grab, LINE MAN, or ShopeeFood to order delivery.',
    th: 'เปิด Grab, LINE MAN หรือ ShopeeFood เพื่อสั่งเดลิเวอรี',
    ko: 'Grab · LINE MAN · ShopeeFood 배달앱으로 주문',
  },
  orderDeliveryDesc: {
    en: 'Choose your preferred delivery platform.',
    th: 'เลือกแพลตฟอร์มเดลิเวอรีที่ต้องการ',
    ko: '원하는 배달앱을 선택해 주세요.',
  },
  orderDeliveryNote: {
    en: 'Delivery fees and promotions follow each app. Member pickup orders are cheaper via the pickup menu.',
    th: 'ค่าส่งและโปรโมชันตามแต่ละแอป รับที่ร้านผ่านเมนูสมาชิกจะถูกกว่า',
    ko: '배달비·프로모션은 각 앱 기준입니다. 회원 픽업은 앱 내 픽업 메뉴가 더 저렴합니다.',
  },
  orderBack: { en: 'Back', th: 'กลับ', ko: '뒤로' },
  orderPickupSavingsDesc: {
    en: 'Order pickup at about 10% lower than delivery app prices. Pay at the store when you pick up.',
    th: 'สั่งรับที่ร้างราคาถูกกว่าแอปเดลิเวอรีประมาณ 10% ชำระที่ร้านเมื่อมารับ',
    ko: '배달앱보다 약 10% 저렴한 가격에 픽업 주문할 수 있습니다. 픽업 시 매장에서 결제합니다.',
  },
  orderSelectStore: { en: 'Store', th: 'สาขา', ko: '매장' },
  orderSelectStorePh: { en: 'Select a store', th: 'เลือกสาขา', ko: '매장을 선택하세요' },
  orderSelectStoreFirst: { en: 'Please select a store first.', th: 'กรุณาเลือกสาขาก่อน', ko: '먼저 매장을 선택해 주세요.' },
  orderPickupTime: { en: 'Pickup time', th: 'เวลารับ', ko: '픽업 희망 시간' },
  orderPickupTimeHint: {
    en: 'Earliest pickup is 30 minutes from now (Bangkok time).',
    th: 'รับได้เร็วสุด 30 นาทีจากนี้ (เวลากรุงเทพ)',
    ko: '최소 현재 시간 30분 이후부터 선택 가능 (방콕 시간)',
  },
  orderPickupContinue: { en: 'Choose menu', th: 'เลือกเมนู', ko: '메뉴 선택' },
  orderPickupSetupBack: { en: 'Change store/time', th: 'เปลี่ยนสาขา/เวลา', ko: '매장·시간 변경' },
  orderPickupSummary: {
    en: '{store} · Pickup {time}',
    th: '{store} · รับ {time}',
    ko: '{store} · 픽업 {time}',
  },
  orderPickupTooSoon: {
    en: 'Pickup must be at least 30 minutes from now.',
    th: 'เวลารับต้องอย่างน้อย 30 นาทีจากนี้',
    ko: '픽업 시간은 현재 시각 기준 30분 이후여야 합니다.',
  },
  orderMemberNoticeTitle: { en: 'Member order', th: 'คำสั่งซื้อสมาชิก', ko: '회원 주문입니다' },
  orderMemberNoticeBody: {
    en: 'This order is linked to your membership and sent to the store POS as pickup (takeout).',
    th: 'คำสั่งซื้อนี้ผูกกับสมาชิกและส่งไป POS ร้านเป็นรับที่ร้าน',
    ko: '회원 정보와 연결되어 해당 매장 POS 포장 주문으로 접수됩니다.',
  },
  orderMemberNoticeOk: { en: 'Start ordering', th: 'เริ่มสั่ง', ko: '주문 시작' },
  orderMenuLoadFail: { en: 'Could not load menu.', th: 'โหลดเมนูไม่สำเร็จ', ko: '메뉴를 불러오지 못했습니다.' },
  orderMenuEmpty: { en: 'No pickup items available.', th: 'ไม่มีเมนูพร้อมสั่ง', ko: '주문 가능한 메뉴가 없습니다.' },
  orderMenuOptionsNote: {
    en: 'Half-and-half (banban) menus — please order at the store.',
    th: 'เมนูครึ่งๆ — สั่งที่ร้าน',
    ko: '반반 메뉴는 매장에서 주문해 주세요.',
  },
  orderCategoryAll: { en: 'All', th: 'ทั้งหมด', ko: '전체' },
  orderMainCategory: { en: 'Main', th: 'หมวดหลัก', ko: '대분류' },
  orderSubCategory: { en: 'Category', th: 'หมวดย่อย', ko: '카테고리' },
  orderSelectSubCategory: {
    en: 'Choose a category below.',
    th: 'เลือกหมวดย่อยด้านล่าง',
    ko: '아래에서 카테고리를 선택해 주세요.',
  },
  orderClearCart: { en: 'Clear cart', th: 'ล้างตะกร้า', ko: '장바구니 비우기' },
  orderCartConfirmTitle: { en: 'Place pickup order?', th: 'ยืนยันสั่งรับที่ร้าน?', ko: '픽업 주문을 접수할까요?' },
  orderCartConfirmBody: {
    en: 'Your order goes to the store POS. Pay when you pick up.',
    th: 'คำสั่งซื้อจะส่งไป POS ร้าน ชำระเมื่อมารับ',
    ko: '주문은 매장 POS로 전달됩니다. 픽업 시 매장에서 결제해 주세요.',
  },
  orderCartConfirmBtn: { en: 'Confirm order', th: 'ยืนยันสั่ง', ko: '주문 확정' },
  orderPayAtPickup: {
    en: 'Pay at store on pickup',
    th: 'ชำระที่ร้านเมื่อมารับ',
    ko: '픽업 시 매장 결제',
  },
  orderViewCart: { en: 'View cart', th: 'ดูตะกร้า', ko: '장바구니 보기' },
  orderItemCount: {
    en: '{count} items',
    th: '{count} รายการ',
    ko: '{count}개',
  },
  orderSelectOption: { en: 'Choose option', th: 'เลือกตัวเลือก', ko: '옵션 선택' },
  orderOptionBack: { en: 'Back', th: 'ย้อนกลับ', ko: '이전' },
  orderOptionStep: {
    en: 'Step {step}/{total}',
    th: 'ขั้นที่ {step}/{total}',
    ko: '{step}/{total} 단계',
  },
  orderBanbanNote: {
    en: 'Half-and-half menu — order at the store.',
    th: 'เมนูครึ่งๆ — สั่งที่ร้าน',
    ko: '반반 메뉴는 매장 주문만 가능합니다.',
  },
  orderAdd: { en: 'Add', th: 'เพิ่ม', ko: '담기' },
  orderCartTitle: { en: 'Cart', th: 'ตะกร้า', ko: '장바구니' },
  orderCartTotal: { en: 'Subtotal', th: 'ยอดรวม', ko: '합계' },
  orderSubmit: { en: 'Place pickup order', th: 'ยืนยันรับที่ร้าน', ko: '픽업 주문하기' },
  orderSubmitSuccess: {
    en: 'Order placed ({orderNo}). Pay at pickup.',
    th: 'สั่งแล้ว ({orderNo}) ชำระเมื่อมารับ',
    ko: '주문 접수됨 ({orderNo}). 픽업 시 결제해 주세요.',
  },
  orderSubmitFail: { en: 'Order failed. Try again.', th: 'สั่งไม่สำเร็จ', ko: '주문에 실패했습니다.' },
  pickup_too_soon: {
    en: 'Pickup must be at least 30 minutes from now.',
    th: 'เวลารับต้องอย่างน้อย 30 นาทีจากนี้',
    ko: '픽업 시간은 30분 이후여야 합니다.',
  },
  empty_cart: { en: 'Cart is empty.', th: 'ตะกร้าว่าง', ko: '장바구니가 비어 있습니다.' },
  store_required: { en: 'Store is required.', th: 'ต้องเลือกสาขา', ko: '매장을 선택해 주세요.' },
  invalid_pickup_time: { en: 'Invalid pickup time.', th: 'เวลารับไม่ถูกต้อง', ko: '픽업 시간이 올바르지 않습니다.' },
  locationTitle: { en: 'Store locations', th: 'ที่ตั้งสาขา', ko: '매장 위치' },
  locationDesc: {
    en: 'Find nearby stores and choose your favorite branch.',
    th: 'ค้นหาสาขาใกล้คุณและเลือกสาขาประจำ',
    ko: '가까운 매장을 찾아 단골 지점을 선택하세요.',
  },
  locationComing: {
    en: 'Map view will be enabled in the next phase.',
    th: 'แผนที่จะเปิดใช้งานในเฟสถัดไป',
    ko: '지도 보기 기능은 다음 단계에서 제공됩니다.',
  },
  locationEmpty: {
    en: 'No stores are registered yet. Add stores in ERP → Member app → Store info.',
    th: 'ยังไม่มีสาขาที่ลงทะเบียน กรุณาเพิ่มใน ERP',
    ko: '등록된 매장이 없습니다. ERP 회원앱 운영 → 매장 정보에서 등록해 주세요.',
  },
  locationSearchPh: {
    en: 'Search store name',
    th: 'ค้นหาชื่อสาขา',
    ko: '매장명 검색',
  },
  locationNoResult: {
    en: 'No matching store found.',
    th: 'ไม่พบสาขาที่ตรงกับคำค้นหา',
    ko: '검색 결과가 없습니다.',
  },
  locationOpenMap: {
    en: 'Open in map',
    th: 'เปิดแผนที่',
    ko: '지도에서 보기',
  },
  locationOpenGoogleMaps: {
    en: 'Open in Google Maps',
    th: 'เปิดใน Google Maps',
    ko: 'Google Maps에서 열기',
  },
  locationCode: {
    en: 'Store code',
    th: 'รหัสสาขา',
    ko: '매장코드',
  },
  locationFavorite: {
    en: 'Favorite',
    th: 'สาขาประจำ',
    ko: '즐겨찾기',
  },
  locationFavoriteSet: {
    en: 'Set as favorite',
    th: 'ตั้งเป็นสาขาประจำ',
    ko: '단골 매장으로 설정',
  },
  locationFavoriteSaved: {
    en: 'Favorite store saved.',
    th: 'บันทึกสาขาประจำแล้ว',
    ko: '즐겨찾는 매장을 저장했습니다.',
  },
  locationFavoriteRemoved: {
    en: 'Removed from favorites.',
    th: 'นำออกจากสาขาประจำแล้ว',
    ko: '즐겨찾기를 해제했습니다.',
  },
  quickOrderTitle: {
    en: 'Quick order',
    th: 'สั่งซื้อด่วน',
    ko: '빠른 주문',
  },
  quickOrderDesc: {
    en: 'Jump straight to POS order with one tap.',
    th: 'ไปหน้าสั่งซื้อได้ทันทีในคลิกเดียว',
    ko: '한 번에 POS 주문으로 이동하세요.',
  },
  quickOrderPickup: {
    en: 'Quick pickup',
    th: 'รับที่ร้านทันที',
    ko: '픽업 바로주문',
  },
  quickOrderDelivery: {
    en: 'Quick delivery',
    th: 'เดลิเวอรีทันที',
    ko: '배달 바로주문',
  },
  quickOrderStoreHint: {
    en: 'Favorite store: {store}',
    th: 'สาขาประจำ: {store}',
    ko: '즐겨찾는 매장: {store}',
  },
  privilegeTitle: { en: 'My privilege', th: 'สิทธิพิเศษของฉัน', ko: '내 혜택' },
  privilegeDesc: {
    en: 'Membership levels, coupons, points, and visit history in one place.',
    th: 'ระดับสมาชิก คูปอง แต้ม และประวัติการใช้บริการในหน้าเดียว',
    ko: '등급·혜택, 쿠폰, 포인트, 이용 내역을 한 화면에서 확인하세요.',
  },
  couponsTitle: { en: 'My coupons', th: 'คูปองของฉัน', ko: '내 쿠폰' },
  couponsSub: {
    en: 'Show the code at the counter when ordering',
    th: 'แสดงรหัสที่เคาน์เตอร์เมื่อสั่งซื้อ',
    ko: '주문 시 카운터에서 코드를 보여주세요',
  },
  noCoupons: { en: 'No coupons yet', th: 'ยังไม่มีคูปอง', ko: '쿠폰 없음' },
  issuedAt: { en: 'Issued', th: 'ออกให้', ko: '발급' },
  historyTitle: { en: 'Activity history', th: 'ประวัติการใช้บริการ', ko: '이용 내역' },
  historySub: { en: 'Orders and points', th: 'คำสั่งซื้อและการสะสมแต้ม', ko: '주문 및 포인트 적립' },
  recentOrders: { en: 'Recent orders', th: 'การสั่งซื้อล่าสุด', ko: '최근 주문' },
  noOrders: { en: 'No orders yet', th: 'ยังไม่มีประวัติการสั่งซื้อ', ko: '주문 내역 없음' },
  store: { en: 'Store', th: 'Store', ko: '매장' },
  pointsHistory: { en: 'Points history', th: 'ประวัติแต้ม', ko: '포인트 내역' },
  noPoints: { en: 'No points history', th: 'ยังไม่มีประวัติแต้ม', ko: '포인트 내역 없음' },
  profileTitle: { en: 'Member profile', th: 'โปรไฟล์สมาชิก', ko: '회원 프로필' },
  profileContactTitle: {
    en: 'Contact & social',
    th: 'ติดต่อ & โซเชียล',
    ko: '문의 · SNS',
  },
  profileContactSub: {
    en: 'Reach us on official channels',
    th: 'ติดต่อเราผ่านช่องทางทางการ',
    ko: '공식 채널로 문의하세요',
  },
  profileSub: {
    en: 'Your saved details appear below. Update and save changes.',
    th: 'ข้อมูลที่บันทึกไว้จะแสดงด้านล่าง แก้ไขแล้วกดบันทึก',
    ko: '등록된 정보가 자동으로 채워집니다. 수정 후 저장하세요.',
  },
  nameLabel: { en: 'Name', th: 'ชื่อ', ko: '이름' },
  emailLabel: { en: 'Email', th: 'อีเมล', ko: '이메일' },
  genderLabel: { en: 'Gender', th: 'เพศ', ko: '성별' },
  genderMale: { en: 'Male', th: 'ชาย', ko: '남성' },
  genderFemale: { en: 'Female', th: 'หญิง', ko: '여성' },
  nationalityLabel: { en: 'Nationality', th: 'สัญชาติ', ko: '국적' },
  nationalityPlaceholder: {
    en: 'Select nationality',
    th: 'เลือกสัญชาติ',
    ko: '국적 선택',
  },
  referralInputLabel: { en: 'Referral code (optional)', th: 'รหัสผู้แนะนำ (ถ้ามี)', ko: '추천 코드 (선택)' },
  consentMarketing: {
    en: 'I agree to receive news and promotions',
    th: 'ยินยอมรับข่าวสารและโปรโมชัน',
    ko: '마케팅 수신에 동의합니다',
  },
  consentMarketingSignupHint: {
    en: 'Keep this checked and sign up to receive your welcome coupon.',
    th: 'คงติ๊กไว้แล้วสมัครสมาชิกเพื่อรับคูปองต้อนรับ',
    ko: '체크를 유지한 채 가입하시면 웰컴 쿠폰을 드립니다.',
  },
  consentMarketingCouponHint: {
    en: 'Unchecking means you will not receive the welcome coupon.',
    th: 'ถ้ายกเลิกติ๊กจะไม่ได้รับคูปองต้อนรับ',
    ko: '체크를 해제하면 웰컴 쿠폰을 받을 수 없습니다.',
  },
  saveProfile: { en: 'Save profile', th: 'บันทึกข้อมูล', ko: '저장' },
  saveProfileChanges: { en: 'Save changes', th: 'บันทึกการเปลี่ยนแปลง', ko: '변경사항 저장' },
  profileReferralLocked: {
    en: 'Referral code was already registered and cannot be changed.',
    th: 'ลงทะเบียนรหัสแนะนำแล้ว ไม่สามารถแก้ไขได้',
    ko: '추천인 코드는 이미 등록되어 변경할 수 없습니다.',
  },
  myReferralCode: { en: 'My referral code', th: 'รหัสแนะนำของฉัน', ko: '내 추천 코드' },
  saving: { en: 'Saving…', th: 'กำลังบันทึก...', ko: '저장 중…' },
  memberNo: { en: 'Member No.', th: 'Member No.', ko: '회원번호' },
  joined: { en: 'Joined', th: 'Joined', ko: '가입일' },
  lastVisit: { en: 'Last visit', th: 'Last visit', ko: '최근 방문' },
  points: { en: 'Points', th: 'Points', ko: '포인트' },
  memberNoShort: { en: 'Member No.', th: 'Member No.', ko: '회원번호' },
  membership: { en: 'Choongman Membership', th: 'Choongman Membership', ko: 'Choongman Membership' },
  lineFriendAdded: {
    en: 'Thanks for adding Choongman Chicken on LINE!',
    th: 'ขอบคุณที่เพิ่ม Choongman Chicken เป็นเพื่อนใน LINE แล้ว',
    ko: 'LINE에서 Choongman Chicken을 친구 추가해 주셔서 감사합니다!',
  },
  lineFriendConnected: {
    en: 'You are already friends with Choongman Chicken on LINE',
    th: 'คุณเป็นเพื่อนกับ Choongman Chicken ใน LINE แล้ว',
    ko: '이미 LINE에서 Choongman Chicken과 친구입니다',
  },
  loginFailed: { en: 'Sign-in failed', th: 'เข้าสู่ระบบไม่สำเร็จ', ko: '로그인에 실패했습니다' },
  saveFailed: { en: 'Save failed', th: 'บันทึกไม่สำเร็จ', ko: '저장에 실패했습니다' },
  showQr: { en: 'Show QR', th: 'Show QR', ko: 'QR 보기' },
  hideQr: { en: 'Hide QR', th: 'Hide QR', ko: 'QR 숨기기' },
  scanAtCounter: {
    en: 'Scan at the counter',
    th: 'สแกนที่เคาน์เตอร์',
    ko: '카운터에서 스캔',
  },
  membershipQrHint: {
    en: 'Present this screen at checkout for staff to scan',
    th: 'แสดงหน้านี้ที่เคาน์เตอร์เพื่อให้พนักงานสแกน',
    ko: '결제 시 이 화면을 카운터에 보여 주세요',
  },
  membershipQrReady: {
    en: 'Ready to scan',
    th: 'พร้อมสแกน',
    ko: '스캔 준비 완료',
  },
  copyMemberNo: {
    en: 'Copy member no.',
    th: 'คัดลอกหมายเลขสมาชิก',
    ko: '회원번호 복사',
  },
  memberNoCopied: {
    en: 'Copied',
    th: 'คัดลอกแล้ว',
    ko: '복사됨',
  },
  showCouponQr: { en: 'Show QR', th: 'แสดง QR', ko: 'QR 보기' },
  couponQrTitle: { en: 'Coupon QR', th: 'QR คูปอง', ko: '쿠폰 QR' },
  couponQrHint: {
    en: 'Show this at the counter for checkout',
    th: 'แสดงที่เคาน์เตอร์เพื่อชำระเงิน',
    ko: '결제 시 카운터에서 보여 주세요',
  },
  scanCouponAtStore: {
    en: 'Staff will scan this QR at POS payment',
    th: 'พนักงานจะสแกน QR นี้ตอนชำระเงินที่ POS',
    ko: '매장 POS 결제 화면에서 QR을 스캔합니다',
  },
  pwaInstallTitle: {
    en: 'Install as app',
    th: 'ติดตั้งเป็นแอป',
    ko: '앱으로 설치하기',
  },
  pwaInstallDesc: {
    en: 'Add to your home screen for quick access to points, coupons, and orders.',
    th: 'เพิ่มไปหน้าจอหลักเพื่อใช้แต้ม คูปอง และสั่งอาหารได้เร็วขึ้น',
    ko: '홈 화면에 추가하면 포인트·쿠폰·주문을 앱처럼 바로 이용할 수 있습니다.',
  },
  pwaInstallBtn: {
    en: 'Install',
    th: 'ติดตั้ง',
    ko: '설치',
  },
  pwaInstallDismiss: {
    en: 'Dismiss',
    th: 'ปิด',
    ko: '닫기',
  },
  pwaInstallIosHint: {
    en: 'Tap Share, then “Add to Home Screen”',
    th: 'แตะ Share แล้วเลือก “Add to Home Screen”',
    ko: '공유(↑) → “홈 화면에 추가”를 선택하세요',
  },
  pwaInstallAndroidHint: {
    en: 'Browser menu (⋮) → Install app or Add to Home screen',
    th: 'เมนูเบราว์เซอร์ (⋮) → ติดตั้งแอป หรือ เพิ่มไปหน้าจอหลัก',
    ko: '브라우저 메뉴(⋮) → 앱 설치 또는 홈 화면에 추가',
  },
  greetingMorning: { en: 'Good morning', th: 'สวัสดีตอนเช้า', ko: '좋은 아침이에요' },
  greetingAfternoon: { en: 'Good afternoon', th: 'สวัสดีตอนบ่าย', ko: '좋은 오후예요' },
  greetingEvening: { en: 'Good evening', th: 'สวัสดีตอนเย็น', ko: '좋은 저녁이에요' },
  homeWelcomeSub: {
    en: 'Your premium membership experience',
    th: 'ประสบการณ์สมาชิกระดับพรีเมียม',
    ko: '프리미엄 멤버십을 경험해 보세요',
  },
  homeQuickOrder: { en: 'Order', th: 'สั่ง', ko: '주문' },
  homeQuickStores: { en: 'Stores', th: 'สาขา', ko: '매장' },
  homeQuickCoupons: { en: 'Coupons', th: 'คูปอง', ko: '쿠폰' },
  homeQuickProfile: { en: 'Profile', th: 'โปรไฟล์', ko: '내정보' },
  err_line_not_configured: {
    en: 'LINE Login is not ready. Please contact the store.',
    th: 'LINE Login ยังไม่พร้อมใช้งาน กรุณาติดต่อร้านค้า',
    ko: 'LINE 로그인이 아직 설정되지 않았습니다. 매장에 문의해 주세요.',
  },
  err_line_bad_channel_id: {
    en: 'LINE Login is misconfigured (invalid Channel ID). Please contact the store.',
    th: 'LINE Login ตั้งค่าไม่ถูกต้อง (Channel ID ผิด) กรุณาติดต่อร้านค้า',
    ko: 'LINE 로그인 설정 오류(Channel ID 잘못됨). 매장에 문의해 주세요.',
  },
  err_line_state_mismatch: {
    en: 'LINE Login expired. Please try again.',
    th: 'LINE Login หมดอายุ กรุณาลองใหม่อีกครั้ง',
    ko: 'LINE 로그인이 만료되었습니다. 다시 시도해 주세요.',
  },
  err_access_denied: {
    en: 'LINE sign-in was cancelled',
    th: 'ยกเลิกการเข้าสู่ระบบ LINE',
    ko: 'LINE 로그인이 취소되었습니다',
  },
  pointKind_earn: { en: 'Earned', th: 'สะสม', ko: '적립' },
  pointKind_use: { en: 'Used', th: 'ใช้', ko: '사용' },
  pointKind_adjust: { en: 'Adjust', th: 'ปรับ', ko: '조정' },
  pointKind_expire: { en: 'Expired', th: 'หมดอายุ', ko: '만료' },
  coupon_issued: { en: 'Ready', th: 'พร้อมใช้', ko: '사용 가능' },
  coupon_used: { en: 'Used', th: 'ใช้แล้ว', ko: '사용됨' },
  coupon_expired: { en: 'Expired', th: 'หมดอายุ', ko: '만료' },
  coupon_restored: { en: 'Restored', th: 'คืนสิทธิ์แล้ว', ko: '복원됨' },
  coupon_cancelled: { en: 'Cancelled', th: 'ยกเลิก', ko: '취소됨' },
  couponExpiresAt: { en: 'Expires', th: 'หมดอายุ', ko: '만료일' },
  couponCampaign: { en: 'Campaign', th: 'แคมเปญ', ko: '캠페인' },
  couponCondition: { en: 'Condition', th: 'เงื่อนไข', ko: '조건' },
  couponScope: { en: 'Store scope', th: 'สาขาที่ใช้ได้', ko: '사용 가능 매장' },
  couponBenefit: { en: 'Benefit', th: 'สิทธิ์', ko: '혜택' },
  couponMinOrder: { en: 'Min order', th: 'ขั้นต่ำ', ko: '최소주문' },
  couponStackRule: { en: 'Stack rule', th: 'กฎการซ้อน', ko: '중복규칙' },
  langLabel: { en: 'Language', th: 'ภาษา', ko: '언어' },
  birthDayLabel: { en: 'Day', th: 'วัน', ko: '일' },
  birthMonthLabel: { en: 'Month', th: 'เดือน', ko: '월' },
  birthYearLabel: { en: 'Year', th: 'ปี', ko: '년' },
  birthDayPlaceholder: { en: 'Day', th: 'วัน', ko: '일' },
  birthMonthPlaceholder: { en: 'Month', th: 'เดือน', ko: '월' },
  birthYearPlaceholder: { en: 'Year', th: 'ปี (ค.ศ.)', ko: '년도' },
  birthDateHint: {
    en: 'Select day, month, and year (Christian era, e.g. 1984-09-28).',
    th: 'เลือกวัน เดือน ปี (ค.ศ.) เช่น 28 / ก.ย. / 1984',
    ko: '일·월·년(서기)을 선택하세요. 예: 1984년 9월 28일',
  },
  month1: { en: 'Jan', th: 'ม.ค.', ko: '1월' },
  month2: { en: 'Feb', th: 'ก.พ.', ko: '2월' },
  month3: { en: 'Mar', th: 'มี.ค.', ko: '3월' },
  month4: { en: 'Apr', th: 'เม.ย.', ko: '4월' },
  month5: { en: 'May', th: 'พ.ค.', ko: '5월' },
  month6: { en: 'Jun', th: 'มิ.ย.', ko: '6월' },
  month7: { en: 'Jul', th: 'ก.ค.', ko: '7월' },
  month8: { en: 'Aug', th: 'ส.ค.', ko: '8월' },
  month9: { en: 'Sep', th: 'ก.ย.', ko: '9월' },
  month10: { en: 'Oct', th: 'ต.ค.', ko: '10월' },
  month11: { en: 'Nov', th: 'พ.ย.', ko: '11월' },
  month12: { en: 'Dec', th: 'ธ.ค.', ko: '12월' },
  login_missing_phone: {
    en: 'Please enter your phone number.',
    th: 'กรุณากรอกเบอร์โทรศัพท์',
    ko: '전화번호를 입력해 주세요.',
  },
  login_missing_birth: {
    en: 'Please select your birth date.',
    th: 'กรุณาเลือกวันเกิด',
    ko: '생년월일을 선택해 주세요.',
  },
  login_rate_limited: {
    en: 'Too many attempts. Please try again in 15 minutes.',
    th: 'ลองบ่อยเกินไป กรุณารอ 15 นาทีแล้วลองใหม่',
    ko: '시도 횟수를 초과했습니다. 15분 후 다시 시도해 주세요.',
  },
  login_not_found: {
    en: 'No matching member. Check your phone and birth date, or sign in with LINE.',
    th: 'ไม่พบข้อมูลสมาชิก ตรวจเบอร์และวันเกิด หรือเข้าสู่ระบบด้วย LINE',
    ko: '일치하는 회원이 없습니다. 전화번호·생년월일을 확인하거나 LINE 로그인을 이용해 주세요.',
  },
  login_inactive: {
    en: 'This membership is inactive. Please contact the store.',
    th: 'บัญชีสมาชิกถูกระงับ กรุณาติดต่อร้าน',
    ko: '비활성화된 회원입니다. 매장에 문의해 주세요.',
  },
  signupTitle: {
    en: 'New member sign up',
    th: 'สมัครสมาชิกใหม่',
    ko: '신규 회원가입',
  },
  signupDesc: {
    en: 'First time here? Create your membership in 10 seconds.',
    th: 'ครั้งแรกใช่ไหม สมัครสมาชิกได้ใน 10 วินาที',
    ko: '처음 방문하셨다면 10초 만에 회원가입하세요.',
  },
  signupNameLabel: {
    en: 'Name',
    th: 'ชื่อ',
    ko: '이름',
  },
  signupBtn: {
    en: 'Create a New Account',
    th: 'สร้างบัญชีใหม่',
    ko: '새 계정 만들기',
  },
  signupChecking: {
    en: 'Creating account…',
    th: 'กำลังสร้างบัญชี...',
    ko: '가입 처리 중…',
  },
  signup_or: {
    en: 'or',
    th: 'หรือ',
    ko: '또는',
  },
  signup_success_created: {
    en: 'Welcome! Your membership is ready.',
    th: 'ยินดีต้อนรับ! สมัครสมาชิกเรียบร้อยแล้ว',
    ko: '환영합니다! 회원가입이 완료되었습니다.',
  },
  signup_success_created_with_coupon: {
    en: 'Welcome! Your membership is ready — check My Benefits for your welcome coupon.',
    th: 'ยินดีต้อนรับ! สมัครสำเร็จแล้ว — ดูคูปองต้อนรับได้ที่สิทธิประโยชน์ของฉัน',
    ko: '환영합니다! 가입이 완료되었고 웰컴 쿠폰이 지급되었습니다. 「내 혜택」에서 확인하세요.',
  },
  signup_success_existing: {
    en: 'Existing account found. Signed you in.',
    th: 'พบบัญชีเดิมและเข้าสู่ระบบให้แล้ว',
    ko: '기존 계정을 찾아 바로 로그인했습니다.',
  },
  signup_missing_name: {
    en: 'Please enter your name.',
    th: 'กรุณากรอกชื่อ',
    ko: '이름을 입력해 주세요.',
  },
  signup_missing_gender: {
    en: 'Please select your gender.',
    th: 'กรุณาเลือกเพศ',
    ko: '성별을 선택해 주세요.',
  },
  signup_exists_other_birth: {
    en: 'Phone already exists with a different birth date. Please use existing sign-in.',
    th: 'เบอร์นี้มีอยู่แล้วแต่วันเกิดไม่ตรง กรุณาใช้การเข้าสู่ระบบเดิม',
    ko: '해당 번호는 이미 등록되어 있으나 생년월일이 다릅니다. 기존 로그인으로 진행해 주세요.',
  },
  lineBtnWithLogo: {
    en: 'Log in or sign up with LINE',
    th: 'เข้าสู่ระบบหรือสมัครด้วย LINE',
    ko: 'LINE으로 로그인/회원가입',
  },
  bgPresetLabel: {
    en: 'Mood',
    th: 'ธีมพื้นหลัง',
    ko: '배경 무드',
  },
  bgPresetSoft: {
    en: 'Soft',
    th: 'หวานละมุน',
    ko: '화사',
  },
  bgPresetChic: {
    en: 'Chic',
    th: 'หรูชิค',
    ko: '고급',
  },
}

export function memberPortalT(lang: LangCode, key: MemberPortalKey, vars?: Record<string, string>): string {
  const row = MS[key]
  let s = row[lang] || row.en || key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), v)
    }
  }
  return s
}

export function memberPortalLoginError(lang: LangCode, code: string): string {
  const loginKey = `login_${code}` as MemberPortalKey
  if (loginKey in MS) return memberPortalT(lang, loginKey)
  const signupKey = `signup_${code}` as MemberPortalKey
  if (signupKey in MS) return memberPortalT(lang, signupKey)
  const known = `err_${code}` as MemberPortalKey
  if (known in MS) return memberPortalT(lang, known)
  try {
    return decodeURIComponent(code)
  } catch {
    return code
  }
}

export function memberPortalDateLocale(lang: LangCode): string {
  if (lang === 'th') return 'th-TH'
  if (lang === 'ko') return 'ko-KR'
  if (lang === 'vi') return 'vi-VN'
  if (lang === 'ms') return 'ms-MY'
  return 'en-US'
}

export function memberPortalPointKindLabel(lang: LangCode, kind: string): string {
  const k = String(kind || '').toLowerCase()
  if (k === 'earn') return memberPortalT(lang, 'pointKind_earn')
  if (k === 'use') return memberPortalT(lang, 'pointKind_use')
  if (k === 'adjust') return memberPortalT(lang, 'pointKind_adjust')
  if (k === 'expire') return memberPortalT(lang, 'pointKind_expire')
  return kind || '-'
}

export function memberPortalCouponStatusLabel(lang: LangCode, status: string): string {
  const s = String(status || '').toLowerCase()
  if (s === 'issued') return memberPortalT(lang, 'coupon_issued')
  if (s === 'used') return memberPortalT(lang, 'coupon_used')
  if (s === 'expired') return memberPortalT(lang, 'coupon_expired')
  if (s === 'restored') return memberPortalT(lang, 'coupon_restored')
  if (s === 'cancelled') return memberPortalT(lang, 'coupon_cancelled')
  return status || '-'
}
