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
  | 'lineOaFriendBannerTitle'
  | 'lineOaFriendBannerSub'
  | 'lineOaFriendBannerBtn'
  | 'lineOaFriendBannerDismiss'
  | 'linePhoneLinkTitle'
  | 'linePhoneLinkDesc'
  | 'linePhoneLinkBtn'
  | 'linePhoneLinkSkip'
  | 'linePhoneLinkMergedNotice'
  | 'contactMenuClose'
  | 'contactViaInAppComplaint'
  | 'complaintSectionTitle'
  | 'complaintSectionSub'
  | 'complaintHomePromoTitle'
  | 'complaintHomePromoSub'
  | 'complaintHomePromoBtn'
  | 'complaintSubmitTitle'
  | 'complaintMyListTitle'
  | 'complaintMyListEmpty'
  | 'complaintListLoading'
  | 'complaintVisitPath'
  | 'complaintPathHall'
  | 'complaintPathDelivery'
  | 'complaintPathTakeout'
  | 'complaintType'
  | 'complaintTypeFood'
  | 'complaintTypeService'
  | 'complaintTypeEnv'
  | 'complaintTypePrice'
  | 'complaintTypeEtc'
  | 'complaintPlatform'
  | 'complaintMenu'
  | 'complaintMenuPh'
  | 'complaintTitle'
  | 'complaintTitlePh'
  | 'complaintContent'
  | 'complaintContentPh'
  | 'complaintPhoto'
  | 'complaintPhotoUpload'
  | 'complaintPhotoRemove'
  | 'complaintSubmitBtn'
  | 'complaintSubmitting'
  | 'complaintSubmitSuccess'
  | 'complaintSubmitFail'
  | 'complaintSelectStore'
  | 'complaintRequiredHint'
  | 'complaintActionLabel'
  | 'complaintReplyLabel'
  | 'complaintStatusRecv'
  | 'complaintStatusInv'
  | 'complaintStatusDone'
  | 'complaintStatusHold'
  | 'complaintStatusClosed'
  | 'complaintErr_invalid_store'
  | 'complaintErr_invalid_visit_path'
  | 'complaintErr_invalid_type'
  | 'complaintErr_invalid_platform'
  | 'complaintErr_platform_required'
  | 'complaintErr_title_required'
  | 'complaintErr_content_required'
  | 'complaintErr_text_too_long'
  | 'complaintErr_rate_limit'
  | 'complaintErr_name_required'
  | 'complaintErr_contact_required'
  | 'complaintPublicPageTitle'
  | 'complaintPublicPageSub'
  | 'complaintPublicSignupTitle'
  | 'complaintPublicSignupBody'
  | 'complaintPublicSignupBtn'
  | 'complaintPublicGuestHint'
  | 'complaintPublicSignupAfterSubmit'
  | 'complaintErr_upload_failed'
  | 'complaintErr_invalid_photo'
  | 'complaintLoginRequired'
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
  | 'tierBenefitsViewBtn'
  | 'tierBenefitsEmpty'
  | 'tierCurrentBadge'
  | 'tierEarnRate'
  | 'tierDiscountRate'
  | 'statLifetime'
  | 'homeFeatureLabel'
  | 'homeFeatureEmpty'
  | 'homeFeatureTap'
  | 'homeNewMenuTitle'
  | 'homeNewMenuThisMonth'
  | 'homeNewMenuEmpty'
  | 'homePromoTitle'
  | 'homePromoThisMonth'
  | 'homePromoEmpty'
  | 'homePromoPrevMonth'
  | 'homePromoNextMonth'
  | 'homePromoChannelDine'
  | 'homePromoChannelDelivery'
  | 'homeContentPrev'
  | 'homeContentNext'
  | 'statVisits'
  | 'statAvgTicket'
  | 'statCoupons'
  | 'statPointsEarned'
  | 'availablePoints'
  | 'cumulativeTierPoints'
  | 'cumulativeTierPointsHint'
  | 'tierPointExpiryPolicyTitle'
  | 'tierPointExpiryPolicyDesc'
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
  | 'orderPickupPreparingBadge'
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
  | 'orderOptionGroupSize'
  | 'orderOptionGroupPart'
  | 'orderPickSizeThenSide'
  | 'orderOptionDefault'
  | 'orderOptional'
  | 'orderSkip'
  | 'orderBackToSize'
  | 'orderOptionStepMismatchFallback'
  | 'orderAddWithoutOption'
  | 'orderCancelOption'
  | 'orderBanbanNote'
  | 'orderAdd'
  | 'orderCartTitle'
  | 'orderCartTotal'
  | 'orderSubmit'
  | 'orderSubmitSuccess'
  | 'orderSubmitFail'
  | 'orderSubmitSuccessPaid'
  | 'orderSubmitSuccessPoints'
  | 'orderCheckoutTitle'
  | 'orderCheckoutPointsLabel'
  | 'orderCheckoutPointsBalance'
  | 'orderCheckoutUseAllPoints'
  | 'orderCheckoutQrAmount'
  | 'orderCheckoutPayBtn'
  | 'orderCheckoutPayWithPoints'
  | 'orderCheckoutPayAtStore'
  | 'orderCheckoutPointEarnEstimate'
  | 'orderCheckoutPointEarnBirthday'
  | 'orderCheckoutQrTitle'
  | 'orderCheckoutQrHint'
  | 'orderCheckoutQrWaiting'
  | 'orderCheckoutQrCountdown'
  | 'orderCheckoutQrExpired'
  | 'orderCheckoutRestoreCart'
  | 'orderCheckoutPreviewFail'
  | 'orderCheckoutQrFail'
  | 'orderCheckoutPackaging'
  | 'orderCheckoutCouponLabel'
  | 'orderCheckoutCouponNone'
  | 'orderCheckoutCouponInvalid'
  | 'orderCheckoutCouponDiscount'
  | 'orderMyOrdersTitle'
  | 'orderMyOrdersEmpty'
  | 'orderMyOrdersResumePay'
  | 'orderMyOrdersReorder'
  | 'orderMyOrdersReorderDone'
  | 'orderDetailTitle'
  | 'orderDetailItems'
  | 'orderDetailNoItems'
  | 'orderDetailLoadFail'
  | 'orderPickupReadyBanner'
  | 'orderCheckoutCouponMinOrder'
  | 'orderStatusAwaitingPayment'
  | 'orderStatusPaid'
  | 'orderStatusCooking'
  | 'orderStatusReady'
  | 'orderStatusPending'
  | 'orderStatusCompleted'
  | 'orderStatusCancelled'
  | 'orderStatusExpired'
  | 'orderCheckoutOrderExpired'
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
  | 'stampCardTitle'
  | 'stampHomeTitle'
  | 'stampHomeSubtitle'
  | 'stampHomeCount'
  | 'stampCardDesc'
  | 'stampPreparingTitle'
  | 'stampPreparingDesc'
  | 'stampProgress'
  | 'stampNextReward'
  | 'stampTotalEarned'
  | 'stampMilestoneAchieved'
  | 'stampCelebrateEarn'
  | 'stampCelebrateMilestone'
  | 'stampViewCoupons'
  | 'stampViewCard'
  | 'stampHistoryBtn'
  | 'stampHistoryTitle'
  | 'stampHistoryRevoke'
  | 'stampHistoryAdjust'
  | 'stampExpiresAt'
  | 'stampCardSequence'
  | 'privilegeDesc'
  | 'privilegeTabCoupons'
  | 'privilegeTabBenefits'
  | 'privilegeTabHistory'
  | 'couponFilterActive'
  | 'couponFilterUsed'
  | 'couponFilterAll'
  | 'couponTabOffers'
  | 'couponTabWallet'
  | 'couponOffersAvailable'
  | 'noCouponOffers'
  | 'couponOfferCollect'
  | 'couponOfferRedeemPoints'
  | 'couponOfferNeedPoints'
  | 'couponOfferInWallet'
  | 'couponOfferMaxReached'
  | 'couponOfferPointCost'
  | 'couponClaimSuccess'
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
  | 'showCouponQr'
  | 'couponQrTitle'
  | 'couponQrHint'
  | 'scanCouponAtStore'
  | 'couponQrManualCodeLabel'
  | 'couponQrManualEntryHint'
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
  | 'homeQuickOrderTitle'
  | 'homeQuickDelivery'
  | 'homeQuickDeliveryTitle'
  | 'homeQuickPrivilegesTitle'
  | 'homeQuickPrivilegesSub'
  | 'homeQuickMyCouponsTitle'
  | 'homeQuickMyCoupons'
  | 'homeQuickMoreTitle'
  | 'homeQuickMore'
  | 'homeQuickMenuAria'
  | 'homeQuickStores'
  | 'homeQuickCoupons'
  | 'homeQuickProfile'
  | 'homeSpecialPrivileges'
  | 'homeViewAll'
  | 'homePromoOrderNow'
  | 'err_line_not_configured'
  | 'err_line_bad_channel_id'
  | 'err_line_state_mismatch'
  | 'err_already_linked'
  | 'err_no_line_identity'
  | 'err_access_denied'
  | 'pointKind_earn'
  | 'pointKind_use'
  | 'pointKind_adjust'
  | 'pointKind_expire'
  | 'pointKind_redeem'
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
  | 'signup_missing_store'
  | 'signup_invalid_store'
  | 'signup_exists_other_birth'
  | 'signupStoreLabel'
  | 'signupStorePlaceholder'
  | 'signupStoreOffice'
  | 'joinStoreCompleteTitle'
  | 'joinStoreCompleteDesc'
  | 'joinStoreCompleteBtn'
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
    ko: '라인 오피셜',
  },
  lineOaFriendBannerTitle: {
    en: 'Get updates on LINE',
    th: 'รับข่าวสารผ่าน LINE',
    ko: 'LINE으로 알림 받기',
  },
  lineOaFriendBannerSub: {
    en: 'Add Choongman Chicken as a LINE friend to get point alerts, coupons, and pickup notices.',
    th: 'เพิ่ม Choongman Chicken เป็นเพื่อน LINE เพื่อรับแจ้งแต้ม คูปอง และสถานะพร้อมรับอาหาร',
    ko: 'LINE 공식 계정을 친구 추가하면 포인트·쿠폰·픽업 알림을 받을 수 있습니다.',
  },
  lineOaFriendBannerBtn: {
    en: 'Add LINE Official friend',
    th: 'เพิ่มเพื่อน LINE Official',
    ko: 'LINE 공식 계정 친구 추가',
  },
  lineOaFriendBannerDismiss: {
    en: 'Dismiss',
    th: 'ปิด',
    ko: '닫기',
  },
  linePhoneLinkTitle: {
    en: 'Link your membership',
    th: 'เชื่อมข้อมูลสมาชิก',
    ko: '회원 정보 연결',
  },
  linePhoneLinkDesc: {
    en: 'Enter the phone number and birth date you used before to sync your points and membership.',
    th: 'กรอกเบอร์โทรและวันเกิดที่เคยสมัครไว้ เพื่อดึงแต้มและข้อมูลสมาชิกเดิมมาใช้',
    ko: '기존에 등록한 전화번호와 생년월일을 입력하면 포인트·회원 정보가 연결됩니다.',
  },
  linePhoneLinkBtn: {
    en: 'Link and continue',
    th: 'เชื่อมข้อมูลและใช้งานต่อ',
    ko: '연결하고 계속',
  },
  linePhoneLinkSkip: {
    en: 'Skip for now',
    th: 'ข้ามไปก่อน',
    ko: '나중에 하기',
  },
  linePhoneLinkMergedNotice: {
    en: 'Your LINE account is now linked to your existing membership.',
    th: 'เชื่อมบัญชี LINE กับสมาชิกเดิมเรียบร้อยแล้ว',
    ko: 'LINE 계정이 기존 회원 정보와 연결되었습니다.',
  },
  contactMenuClose: {
    en: 'Close',
    th: 'ปิด',
    ko: '닫기',
  },
  contactViaInAppComplaint: {
    en: 'Submit in app',
    th: 'ส่งผ่านแอป',
    ko: '앱에서 접수하기',
  },
  complaintSectionTitle: {
    en: 'Feedback & complaints',
    th: 'ข้อเสนอแนะและข้อร้องเรียน',
    ko: '불편 접수',
  },
  complaintSectionSub: {
    en: 'Tell us what happened — our team will follow up.',
    th: 'แจ้งปัญหาให้เราทราบ ทีมงานจะติดตามให้',
    ko: '불편하셨던 내용을 알려주시면 매장에서 확인합니다.',
  },
  complaintHomePromoTitle: {
    en: 'Something went wrong?',
    th: 'มีปัญหาหรือไม่พอใจ?',
    ko: '불편하신 점이 있으신가요?',
  },
  complaintHomePromoSub: {
    en: 'Submit feedback in the app — we track and follow up every report.',
    th: 'แจ้งผ่านแอปได้เลย ทีมงานจะติดตามให้ทุกเรื่อง',
    ko: '앱에서 바로 접수하시면 매장에서 확인하고 처리합니다.',
  },
  complaintHomePromoBtn: {
    en: 'Submit feedback',
    th: 'แจ้งเรื่อง',
    ko: '불편 접수하기',
  },
  complaintSubmitTitle: {
    en: 'New complaint',
    th: 'แจ้งเรื่องใหม่',
    ko: '컴플레인 접수',
  },
  complaintMyListTitle: {
    en: 'My submissions',
    th: 'รายการที่ส่งแล้ว',
    ko: '내 접수 내역',
  },
  complaintMyListEmpty: {
    en: 'No submissions yet',
    th: 'ยังไม่มีรายการ',
    ko: '접수 내역이 없습니다',
  },
  complaintListLoading: {
    en: 'Loading…',
    th: 'กำลังโหลด…',
    ko: '불러오는 중…',
  },
  complaintVisitPath: {
    en: 'Visit type',
    th: 'ประเภทการใช้บริการ',
    ko: '방문 경로',
  },
  complaintPathHall: { en: 'Dine-in', th: 'ทานที่ร้าน', ko: '홀' },
  complaintPathDelivery: { en: 'Delivery', th: 'เดลิเวอรี่', ko: '배달' },
  complaintPathTakeout: { en: 'Takeout', th: 'สั่งกลับบ้าน', ko: '포장' },
  complaintType: { en: 'Category', th: 'ประเภท', ko: '유형' },
  complaintTypeFood: { en: 'Food', th: 'อาหาร', ko: '음식' },
  complaintTypeService: { en: 'Service', th: 'บริการ', ko: '서비스' },
  complaintTypeEnv: { en: 'Cleanliness', th: 'ความสะอาด', ko: '환경/청결' },
  complaintTypePrice: { en: 'Price / payment', th: 'ราคา/การชำระ', ko: '가격/결제' },
  complaintTypeEtc: { en: 'Other', th: 'อื่นๆ', ko: '기타' },
  complaintPlatform: { en: 'Delivery platform', th: 'แพลตฟอร์มเดลิเวอรี่', ko: '배달 플랫폼' },
  complaintMenu: { en: 'Menu (optional)', th: 'เมนู (ถ้ามี)', ko: '관련 메뉴 (선택)' },
  complaintMenuPh: { en: 'Menu name', th: 'ชื่อเมนู', ko: '메뉴명' },
  complaintTitle: { en: 'Subject', th: 'หัวข้อ', ko: '제목' },
  complaintTitlePh: { en: 'Short summary', th: 'สรุปสั้นๆ', ko: '한 줄 요약' },
  complaintContent: { en: 'Details', th: 'รายละเอียด', ko: '내용' },
  complaintContentPh: {
    en: 'What happened? Include date/time if you remember.',
    th: 'เกิดอะไรขึ้น? ระบุวันเวลาถ้าจำได้',
    ko: '상세 내용을 입력해 주세요.',
  },
  complaintPhoto: { en: 'Photo (optional)', th: 'รูปภาพ (ถ้ามี)', ko: '사진 (선택)' },
  complaintPhotoUpload: { en: 'Add photo', th: 'เพิ่มรูป', ko: '사진 첨부' },
  complaintPhotoRemove: { en: 'Remove', th: 'ลบ', ko: '삭제' },
  complaintSubmitBtn: { en: 'Submit', th: 'ส่ง', ko: '접수하기' },
  complaintSubmitting: { en: 'Submitting…', th: 'กำลังส่ง…', ko: '접수 중…' },
  complaintSubmitSuccess: {
    en: 'Submitted. Reference: {number}',
    th: 'ส่งแล้ว หมายเลข: {number}',
    ko: '접수되었습니다. 접수번호: {number}',
  },
  complaintSubmitFail: {
    en: 'Could not submit. Please try again.',
    th: 'ส่งไม่สำเร็จ ลองอีกครั้ง',
    ko: '접수에 실패했습니다. 다시 시도해 주세요.',
  },
  complaintSelectStore: {
    en: 'Select a store',
    th: 'เลือกสาขา',
    ko: '매장을 선택하세요',
  },
  complaintRequiredHint: {
    en: 'Please fill in required fields.',
    th: 'กรอกข้อมูลที่จำเป็น',
    ko: '필수 항목을 입력해 주세요.',
  },
  complaintActionLabel: { en: 'Resolution', th: 'การดำเนินการ', ko: '조치' },
  complaintReplyLabel: { en: 'Store reply', th: 'ข้อความตอบกลับจากร้าน', ko: '매장 답변' },
  complaintStatusRecv: { en: 'Received', th: 'รับเรื่อง', ko: '접수' },
  complaintStatusInv: { en: 'Investigating', th: 'กำลังตรวจสอบ', ko: '조사중' },
  complaintStatusDone: { en: 'Resolved', th: 'ดำเนินการแล้ว', ko: '처리완료' },
  complaintStatusHold: { en: 'On hold', th: 'รอดำเนินการ', ko: '보류' },
  complaintStatusClosed: { en: 'Closed', th: 'ปิดเรื่อง', ko: '종료' },
  complaintErr_invalid_store: {
    en: 'Please select a valid store.',
    th: 'เลือกสาขาที่ถูกต้อง',
    ko: '올바른 매장을 선택해 주세요.',
  },
  complaintErr_invalid_visit_path: {
    en: 'Invalid visit type.',
    th: 'ประเภทการใช้บริการไม่ถูกต้อง',
    ko: '방문 경로가 올바르지 않습니다.',
  },
  complaintErr_invalid_type: {
    en: 'Invalid category.',
    th: 'ประเภทไม่ถูกต้อง',
    ko: '유형이 올바르지 않습니다.',
  },
  complaintErr_invalid_platform: {
    en: 'Invalid delivery platform.',
    th: 'แพลตฟอร์มไม่ถูกต้อง',
    ko: '배달 플랫폼이 올바르지 않습니다.',
  },
  complaintErr_platform_required: {
    en: 'Select a delivery platform.',
    th: 'เลือกแพลตฟอร์มเดลิเวอรี่',
    ko: '배달 플랫폼을 선택해 주세요.',
  },
  complaintErr_title_required: {
    en: 'Subject is required.',
    th: 'กรอกหัวข้อ',
    ko: '제목을 입력해 주세요.',
  },
  complaintErr_content_required: {
    en: 'Details are required.',
    th: 'กรอกรายละเอียด',
    ko: '내용을 입력해 주세요.',
  },
  complaintErr_text_too_long: {
    en: 'Text is too long.',
    th: 'ข้อความยาวเกินไป',
    ko: '입력 글자 수가 너무 많습니다.',
  },
  complaintErr_rate_limit: {
    en: 'Daily submission limit reached. Try again tomorrow.',
    th: 'ส่งครบจำนวนต่อวันแล้ว ลองใหม่พรุ่งนี้',
    ko: '오늘 접수 가능 횟수를 초과했습니다. 내일 다시 시도해 주세요.',
  },
  complaintErr_name_required: {
    en: 'Please enter your name.',
    th: 'กรุณากรอกชื่อ',
    ko: '이름을 입력해 주세요.',
  },
  complaintErr_contact_required: {
    en: 'Please enter a valid phone number.',
    th: 'กรุณากรอกเบอร์โทรศัพท์ที่ถูกต้อง',
    ko: '연락 가능한 전화번호를 입력해 주세요.',
  },
  complaintPublicPageTitle: {
    en: 'Feedback & complaints',
    th: 'แจ้งปัญหา / ข้อเสนอแนะ',
    ko: '불편 접수',
  },
  complaintPublicPageSub: {
    en: 'You can submit without signing up. Our team will still follow up.',
    th: 'ไม่สมัครก็แจ้งได้ ทีมงานจะติดตามให้ทุกเรื่อง',
    ko: '회원가입 없이도 접수할 수 있습니다. 접수 후 매장에서 확인합니다.',
  },
  complaintPublicSignupTitle: {
    en: 'Easier with a member account',
    th: 'สมัครสมาชิกแล้วสะดวกกว่า',
    ko: '회원이시면 더 편리합니다',
  },
  complaintPublicSignupBody: {
    en: 'Sign up and submit in the member app to view your complaint history and store replies or status updates anytime.',
    th: 'สมัครสมาชิกแล้วแจ้งผ่านแอป จะดูประวัติการแจ้งและคำตอบ/สถานะจากร้านได้สะดวกในแอป',
    ko: '회원가입 후 앱에서 접수하시면 접수 이력과 매장 답변·처리 현황을 바로 확인하실 수 있습니다.',
  },
  complaintPublicSignupBtn: {
    en: 'Sign up free',
    th: 'สมัครสมาชิก',
    ko: '회원 가입하기',
  },
  complaintPublicGuestHint: {
    en: 'Prefer not to sign up? Fill in the form below.',
    th: 'ไม่สมัครก็แจ้งได้ กรอกแบบฟอร์มด้านล่าง',
    ko: '가입 없이 접수하시려면 아래 양식을 작성해 주세요.',
  },
  complaintPublicSignupAfterSubmit: {
    en: 'Next time, sign up to track history and replies in the member app.',
    th: 'ครั้งหน้าสมัครสมาชิกแล้วแจ้งในแอป จะดูประวัติและคำตอบได้สะดวกขึ้น',
    ko: '다음부터는 회원가입 후 접수하시면 이력과 답변을 앱에서 편하게 확인하실 수 있습니다.',
  },
  complaintErr_upload_failed: {
    en: 'Photo upload failed.',
    th: 'อัปโหลดรูปไม่สำเร็จ',
    ko: '사진 업로드에 실패했습니다.',
  },
  complaintErr_invalid_photo: {
    en: 'Invalid photo URL.',
    th: 'URL รูปภาพไม่ถูกต้อง',
    ko: '사진 주소가 올바르지 않습니다.',
  },
  complaintLoginRequired: {
    en: 'Please log in to submit a complaint in the app.',
    th: 'เข้าสู่ระบบก่อนเพื่อส่งเรื่องผ่านแอป',
    ko: '앱 접수는 로그인 후 이용할 수 있습니다.',
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
  tierBenefitsViewBtn: {
    en: 'View tier benefits',
    th: 'ดูสิทธิประโยชน์ตามระดับ',
    ko: '등급별 혜택 보기',
  },
  tierBenefitsEmpty: {
    en: 'No benefits listed for this tier yet.',
    th: 'ยังไม่มีสิทธิประโยชน์สำหรับระดับนี้',
    ko: '등록된 혜택이 없습니다.',
  },
  tierCurrentBadge: { en: 'Current', th: 'ระดับปัจจุบัน', ko: '현재 등급' },
  tierEarnRate: { en: 'Point earn rate', th: 'อัตราแต้มสะสม', ko: '포인트 적립율' },
  tierDiscountRate: { en: 'Tier discount', th: 'ส่วนลดระดับสมาชิก', ko: '등급 할인율' },
  statLifetime: { en: 'Lifetime spend', th: 'ยอดใช้จ่ายสะสม', ko: '누적 이용 금액' },
  homeFeatureLabel: { en: 'New menu', th: 'เมนูใหม่', ko: '신메뉴' },
  homeFeatureEmpty: { en: 'Coming soon', th: 'เร็วๆ นี้', ko: '곧 공개' },
  homeFeatureTap: { en: 'Tap for details', th: 'แตะเพื่อดูรายละเอียด', ko: '탭하여 자세히 보기' },
  homeNewMenuTitle: {
    en: 'New menu',
    th: 'เมนูใหม่',
    ko: '신메뉴',
  },
  homeNewMenuThisMonth: {
    en: 'This month',
    th: 'เดือนนี้',
    ko: '이번 달',
  },
  homeNewMenuEmpty: {
    en: 'No new menu items for this month.',
    th: 'ยังไม่มีเมนูใหม่ในเดือนนี้',
    ko: '이 달에 등록된 신메뉴가 없습니다.',
  },
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
  homePromoChannelDine: {
    en: 'Dine-in',
    th: 'หน้าร้าน',
    ko: '매장',
  },
  homePromoChannelDelivery: {
    en: 'Delivery',
    th: 'Delivery',
    ko: '배달',
  },
  homeContentPrev: {
    en: 'Previous',
    th: 'ก่อนหน้า',
    ko: '이전',
  },
  homeContentNext: {
    en: 'Next',
    th: 'ถัดไป',
    ko: '다음',
  },
  statVisits: { en: 'Visits', th: 'จำนวนครั้งที่มา', ko: '방문 횟수' },
  statAvgTicket: { en: 'Avg.', th: 'เฉลี่ย', ko: '평균' },
  statCoupons: { en: 'Coupons ready', th: 'คูปองพร้อมใช้', ko: '사용 가능 쿠폰' },
  statPointsEarned: { en: 'Points earned', th: 'แต้มที่ได้รับรวม', ko: '총 적립 포인트' },
  availablePoints: {
    en: 'Available points',
    th: 'พอยท์ใช้ได้',
    ko: '사용 가능 포인트',
  },
  cumulativeTierPoints: {
    en: 'Tier points (2-year rolling)',
    th: 'แต้มสะสม (2 ปีล่าสุด)',
    ko: '누적 포인트',
  },
  cumulativeTierPointsHint: {
    en: 'Only points earned in the last {years} years count toward your tier.',
    th: 'นับเฉพาะแต้มที่ได้รับภายใน {years} ปีล่าสุดสำหรับระดับสมาชิก',
    ko: '적립일로부터 {years}년 이내 포인트만 등급 산정에 반영됩니다.',
  },
  tierPointExpiryPolicyTitle: {
    en: 'Point expiry policy',
    th: 'นโยบายหมดอายุแต้ม',
    ko: '포인트 소멸 안내',
  },
  tierPointExpiryPolicyDesc: {
    en: 'Points older than {years} years from the earn date expire automatically. No separate maintenance requirement—keeping your tier means earning enough in the rolling {years}-year window. Available points follow the same rule; oldest credits are used first when you redeem.',
    th: 'แต้มที่ได้รับเกิน {years} ป จะหมดอายุอัตโนมัติ ไม่มีแต้มคงระดับแยก—รักษาระดับได้ด้วยการสะสมใน {years} ปีล่าสุด แต้มใช้ได้ใช้กฎเดียวกัน และหักจากรายการเก่าก่อน',
    ko: '적립일로부터 {years}년이 지난 포인트는 자동 소멸됩니다. 별도 유지 포인트 없이, 최근 {years}년간 적립한 포인트로 등급이 유지·산정됩니다. 사용 가능 포인트도 동일하며, 사용 시 오래된 적립분부터 차감됩니다.',
  },
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
  tabHome: { en: 'Home', th: 'หน้าหลัก', ko: '홈' },
  tabOrder: { en: 'Order', th: 'สั่งอาหาร', ko: '주문' },
  tabLocation: { en: 'Location', th: 'สาขา', ko: '매장' },
  tabPrivilege: { en: 'Privilege', th: 'สิทธิพิเศษ', ko: '혜택' },
  tabMe: { en: 'Me', th: 'ฉัน', ko: '내정보' },
  orderTitle: { en: 'Order now', th: 'สั่งซื้อเลย', ko: '지금 주문' },
  orderDesc: {
    en: 'Pickup at store (member price) or order via delivery apps.',
    th: 'รับที่ร้านในราคาสมาชิก หรือสั่งผ่านแอปเดลิเวอรี',
    ko: '매장 픽업(회원가) 또는 배달앱 주문을 선택하세요.',
  },
  orderPickupBtn: { en: 'Pickup (preparing)', th: 'รับที่ร้าน (กำลังเตรียม)', ko: '픽업 준비중' },
  orderPickupPreparingBadge: { en: 'Preparing', th: 'กำลังเตรียม', ko: '준비중' },
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
  orderPickupSetupBack: { en: 'Change store', th: 'เปลี่ยนสาขา', ko: '매장 변경' },
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
    en: 'Pay with QR code',
    th: 'ชำระด้วย QR code',
    ko: 'QR코드 결제',
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
  orderOptionGroupSize: { en: 'Size', th: 'ไซส์', ko: '사이즈' },
  orderOptionGroupPart: { en: 'Part', th: 'ส่วน', ko: '부위' },
  orderPickSizeThenSide: {
    en: '1. Choose size → 2. Choose side',
    th: '1. เลือกไซส์ → 2. เลือกเครื่องเคียง',
    ko: '1. 사이즈 선택 → 2. 사이드 선택',
  },
  orderOptionDefault: { en: 'Default (S Boneless)', th: 'ค่าเริ่มต้น (S Boneless)', ko: '기본 (S 순살)' },
  orderOptional: { en: 'optional', th: 'ไม่บังคับ', ko: '선택' },
  orderSkip: { en: 'Skip', th: 'ข้าม', ko: '건너뛰기' },
  orderBackToSize: { en: 'Back to size', th: 'กลับไปเลือกไซส์', ko: '사이즈로 돌아가기' },
  orderOptionStepMismatchFallback: {
    en: 'Showing the standard option list because step settings do not match.',
    th: 'แสดงรายการตัวเลือกมาตรฐานเพราะการตั้งค่าขั้นตอนไม่ตรงกัน',
    ko: '단계 설정이 맞지 않아 일반 옵션 목록으로 표시합니다.',
  },
  orderAddWithoutOption: { en: 'Add without option', th: 'เพิ่มโดยไม่เลือกตัวเลือก', ko: '옵션 없이 담기' },
  orderCancelOption: { en: 'Cancel', th: 'ยกเลิก', ko: '취소' },
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
  orderSubmitSuccessPaid: {
    en: 'Payment complete ({orderNo}). See you at pickup!',
    th: 'ชำระแล้ว ({orderNo}) พบกันที่ร้าน!',
    ko: '결제 완료 ({orderNo}). 픽업 때 뵙겠습니다!',
  },
  orderSubmitSuccessPoints: {
    en: 'Paid with points ({orderNo}). See you at pickup!',
    th: 'ใช้พอยท์แล้ว ({orderNo}) พบกันที่ร้าน!',
    ko: '포인트 결제 완료 ({orderNo}). 픽업 때 뵙겠습니다!',
  },
  orderCheckoutTitle: { en: 'Checkout', th: 'ชำระเงิน', ko: '결제하기' },
  orderCheckoutPointsLabel: { en: 'Use points', th: 'ใช้พอยท์', ko: '포인트 사용' },
  orderCheckoutPointsBalance: {
    en: 'Balance: {balance} pts',
    th: 'คงเหลือ {balance} พอยท์',
    ko: '보유 {balance}P',
  },
  orderCheckoutUseAllPoints: { en: 'Use all', th: 'ใช้ทั้งหมด', ko: '전액 사용' },
  orderCheckoutQrAmount: { en: 'Pay by QR', th: 'ชำระ QR', ko: 'QR 결제' },
  orderCheckoutPayBtn: { en: 'Pay with QR', th: 'ชำระด้วย QR', ko: 'QR로 결제' },
  orderCheckoutPayWithPoints: { en: 'Pay with points', th: 'ชำระด้วยพอยท์', ko: '포인트로 결제' },
  orderCheckoutPayAtStore: {
    en: 'Pay at store on pickup',
    th: 'ชำระที่ร้านเมื่อรับ',
    ko: '픽업 시 매장 결제',
  },
  orderCheckoutPointEarnEstimate: {
    en: 'Points you will earn: {points}P ({multiplier}×)',
    th: 'ได้รับพอยท์: {points} ({multiplier}×)',
    ko: '적립 예정: {points}P ({multiplier}배)',
  },
  orderCheckoutPointEarnBirthday: {
    en: 'Birthday bonus applied',
    th: 'โบนัสวันเกิด',
    ko: '생일 보너스 적용',
  },
  orderCheckoutQrTitle: { en: 'Scan to pay', th: 'สแกนชำระ', ko: 'QR 스캔 결제' },
  orderCheckoutQrHint: {
    en: 'Scan with your banking app (PromptPay). Your order is sent to the store only after payment. QR expires in 5 minutes.',
    th: 'สแกนผ่านแอปธนาคาร (PromptPay) ส่งคำสั่งซื้อหลังชำระ QR หมดอายุ 5 นาที',
    ko: '뱅킹 앱으로 PromptPay QR을 스캔해 주세요. 결제가 확인된 뒤 매장에 주문이 접수됩니다. (5분 내 결제)',
  },
  orderCheckoutQrWaiting: {
    en: 'Waiting for payment confirmation…',
    th: 'รอยืนยันการชำระ…',
    ko: '결제 확인 대기 중…',
  },
  orderCheckoutQrCountdown: {
    en: 'Time left: {{time}}',
    th: 'เหลือเวลา {{time}}',
    ko: '남은 시간 {{time}}',
  },
  orderCheckoutQrExpired: {
    en: 'QR expired. Please order again.',
    th: 'QR หมดอายุ กรุณาสั่งใหม่',
    ko: 'QR이 만료되었습니다. 다시 주문해 주세요.',
  },
  orderCheckoutRestoreCart: {
    en: 'Restore cart & order again',
    th: 'คืนตะกร้าแล้วสั่งใหม่',
    ko: '장바구니 복원 후 다시 주문',
  },
  orderCheckoutPreviewFail: {
    en: 'Could not load checkout.',
    th: 'โหลดการชำระไม่สำเร็จ',
    ko: '결제 정보를 불러오지 못했습니다.',
  },
  orderCheckoutQrFail: {
    en: 'Could not create QR. Try again.',
    th: 'สร้าง QR ไม่สำเร็จ',
    ko: 'QR 생성에 실패했습니다.',
  },
  orderCheckoutPackaging: { en: 'Packaging', th: 'บรรจุภัณฑ์', ko: '포장비' },
  orderCheckoutCouponLabel: { en: 'Coupon', th: 'คูปอง', ko: '쿠폰' },
  orderCheckoutCouponNone: { en: 'No coupon', th: 'ไม่ใช้คูปอง', ko: '쿠폰 미사용' },
  orderCheckoutCouponInvalid: {
    en: 'This coupon cannot be used for this order.',
    th: 'ใช้คูปองนี้กับคำสั่งซื้อนี้ไม่ได้',
    ko: '이 주문에 사용할 수 없는 쿠폰입니다.',
  },
  orderCheckoutCouponDiscount: { en: 'Coupon discount', th: 'ส่วนลดคูปอง', ko: '쿠폰 할인' },
  orderMyOrdersTitle: { en: 'My pickup orders', th: 'คำสั่งซื้อของฉัน', ko: '내 주문' },
  orderMyOrdersEmpty: { en: 'No orders yet.', th: 'ยังไม่มีคำสั่งซื้อ', ko: '주문 내역이 없습니다.' },
  orderMyOrdersResumePay: { en: 'Pay now', th: 'ชำระเลย', ko: '결제하기' },
  orderMyOrdersReorder: { en: 'Order again', th: 'สั่งอีกครั้ง', ko: '다시 주문' },
  orderMyOrdersReorderDone: {
    en: 'Items added to cart.',
    th: 'เพิ่มในตะกร้าแล้ว',
    ko: '장바구니에 담았습니다.',
  },
  orderDetailTitle: {
    en: 'Order details',
    th: 'รายละเอียดคำสั่งซื้อ',
    ko: '주문 상세',
  },
  orderDetailItems: {
    en: 'Items ordered',
    th: 'รายการที่สั่ง',
    ko: '주문 메뉴',
  },
  orderDetailNoItems: {
    en: 'No items found for this order.',
    th: 'ไม่พบรายการในคำสั่งซื้อนี้',
    ko: '주문 항목이 없습니다.',
  },
  orderDetailLoadFail: {
    en: 'Could not load this order.',
    th: 'โหลดคำสั่งซื้อไม่ได้',
    ko: '주문을 불러올 수 없습니다.',
  },
  orderPickupReadyBanner: {
    en: '{{orderNo}} is ready for pickup at {{store}}.',
    th: '{{orderNo}} พร้อมรับที่ {{store}}',
    ko: '{{orderNo}} — {{store}}에서 픽업 준비가 완료되었습니다.',
  },
  orderCheckoutCouponMinOrder: {
    en: 'Min. order ฿{{amount}}',
    th: 'ขั้นต่ำ ฿{{amount}}',
    ko: '최소 주문 ฿{{amount}}',
  },
  orderStatusAwaitingPayment: { en: 'Awaiting payment', th: 'รอชำระ', ko: '결제 대기' },
  orderStatusPaid: { en: 'Paid · preparing', th: 'ชำระแล้ว · กำลังเตรียม', ko: '결제 완료 · 준비 중' },
  orderStatusCooking: { en: 'Preparing', th: 'กำลังทำ', ko: '조리 중' },
  orderStatusReady: { en: 'Ready for pickup', th: 'พร้อมรับ', ko: '픽업 준비 완료' },
  orderStatusPending: { en: 'Accepted', th: 'รับแล้ว', ko: '접수됨' },
  orderStatusCompleted: { en: 'Completed', th: 'เสร็จสิ้น', ko: '완료' },
  orderStatusCancelled: { en: 'Cancelled', th: 'ยกเลิก', ko: '취소' },
  orderStatusExpired: { en: 'Payment expired', th: 'หมดเวลาชำระ', ko: '결제 만료' },
  orderCheckoutOrderExpired: {
    en: 'This order expired. Please place a new order.',
    th: 'คำสั่งซื้อหมดเวลาแล้ว กรุณาสั่งใหม่',
    ko: '결제 시간이 만료되었습니다. 다시 주문해 주세요.',
  },
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
    en: 'Coupons, tier benefits, and activity — organized in tabs.',
    th: 'คูปอง สิทธิ์สมาชิก และประวัติ — แยกเป็นแท็บอ่านง่าย',
    ko: '쿠폰·등급 혜택·이용 내역을 탭으로 나눠 깔끔하게 확인하세요.',
  },
  privilegeTabCoupons: { en: 'Coupons', th: 'คูปอง', ko: '쿠폰' },
  privilegeTabBenefits: { en: 'Benefits', th: 'สิทธิพิเศษ', ko: '혜택' },
  privilegeTabHistory: { en: 'History', th: 'ประวัติ', ko: '내역' },
  couponFilterActive: { en: 'Ready to use', th: 'พร้อมใช้', ko: '사용 가능' },
  couponFilterUsed: { en: 'Used / expired', th: 'ใช้แล้ว', ko: '사용·만료' },
  couponFilterAll: { en: 'All', th: 'ทั้งหมด', ko: '전체' },
  couponTabOffers: { en: 'Get coupons', th: 'รับคูปอง', ko: '받을 쿠폰' },
  couponTabWallet: { en: 'My coupons', th: 'คูปองของฉัน', ko: '내 쿠폰' },
  couponOffersAvailable: { en: 'Available', th: 'รับได้', ko: '받을 수 있음' },
  noCouponOffers: {
    en: 'No coupons available to collect right now.',
    th: 'ยังไม่มีคูปองให้รับในขณะนี้',
    ko: '지금 받을 수 있는 쿠폰이 없습니다.',
  },
  couponOfferCollect: { en: 'Collect coupon', th: 'เก็บคูปอง', ko: '쿠폰 받기' },
  couponOfferRedeemPoints: { en: 'Redeem {count} P', th: 'แลก {count} คะแนน', ko: '{count}P 교환' },
  couponOfferNeedPoints: { en: 'Need {count} more P', th: 'ขาด {count} คะแนน', ko: '{count}P 부족' },
  couponOfferInWallet: { en: 'In My coupons', th: 'อยู่ในคูปองของฉัน', ko: '내 쿠폰에 있음' },
  couponOfferMaxReached: { en: 'Limit reached', th: 'รับครบแล้ว', ko: '수령 완료' },
  couponOfferPointCost: { en: '{count} points', th: '{count} คะแนน', ko: '{count}P' },
  couponClaimSuccess: {
    en: 'Coupon added to My coupons.',
    th: 'เพิ่มคูปองใน「คูปองของฉัน」แล้ว',
    ko: '쿠폰이 「내 쿠폰」에 추가되었습니다.',
  },
  stampCardTitle: { en: 'Stamp card', th: 'บัตรสแตมป์', ko: '스탬프 카드' },
  stampHomeTitle: {
    en: 'Stamp card — almost there!',
    th: 'Stamp card อีกนิดเดียวครบ!',
    ko: '스탬프 카드 — 거의 다 찼어요!',
  },
  stampHomeSubtitle: {
    en: 'Collect {total} stamps & get {reward}!',
    th: 'สะสมครบ {total} ดวง รับฟรี! {reward}',
    ko: '{total}개 모으면 {reward}!',
  },
  stampHomeCount: {
    en: '{current} / {total} stamps',
    th: '{current} / {total} ดวง',
    ko: '{current} / {total}개',
  },
  stampCardDesc: {
    en: 'Earn a stamp when you visit and pay as a member.',
    th: 'สะสมสแตมป์เมื่อมาใช้บริการและชำระเงินในฐานะสมาชิก',
    ko: '회원으로 방문·결제할 때마다 스탬프가 쌓입니다.',
  },
  stampPreparingTitle: {
    en: 'Stamp card coming soon',
    th: 'บัตรสแตมป์เร็วๆ นี้',
    ko: '스탬프 준비 중',
  },
  stampPreparingDesc: {
    en: 'Visit stamps and rewards will be available here soon. Stay tuned!',
    th: 'สแตมป์และรางวัลจากการมาใช้บริการจะเปิดให้ใช้เร็วๆ นี้',
    ko: '회원 방문 스탬프 혜택을 준비하고 있습니다. 조금만 기다려 주세요!',
  },
  stampProgress: {
    en: '{current} / {total} stamps',
    th: 'สแตมป์ {current} / {total}',
    ko: '스탬프 {current} / {total}',
  },
  stampNextReward: {
    en: '{remaining} more stamp(s) until: {label}',
    th: 'อีก {remaining} สแตมป์ถึง: {label}',
    ko: '스탬프 {remaining}개 더 모으면: {label}',
  },
  stampTotalEarned: {
    en: 'Total visits stamped: {count}',
    th: 'สะสมสแตมป์แล้ว {count} ครั้ง',
    ko: '누적 스탬프 {count}회',
  },
  stampMilestoneAchieved: {
    en: 'Reward unlocked at {count} stamps: {label}',
    th: 'ปลดล็อกที่ {count} สแตมป์: {label}',
    ko: '{count}회 달성 혜택: {label}',
  },
  stampCelebrateEarn: {
    en: 'Stamp earned!',
    th: 'ได้รับสแตมป์แล้ว!',
    ko: '스탬프가 적립되었습니다!',
  },
  stampCelebrateMilestone: {
    en: 'Milestone reward unlocked!',
    th: 'ปลดล็อกรางวัล milestone!',
    ko: '마일스톤 혜택을 받았습니다!',
  },
  stampViewCoupons: {
    en: 'View my coupons',
    th: 'ดูคูปองของฉัน',
    ko: '쿠폰함 보기',
  },
  stampViewCard: {
    en: 'View stamp card',
    th: 'ดูแสตมป์การ์ด',
    ko: '스탬프 카드 보기',
  },
  stampHistoryBtn: {
    en: 'History',
    th: 'ประวัติ',
    ko: '이력',
  },
  stampHistoryTitle: {
    en: 'Recent stamp activity',
    th: 'สแตมป์ล่าสุด',
    ko: '최근 스탬프 이력',
  },
  stampHistoryRevoke: {
    en: 'Revoked',
    th: 'ยกเลิก',
    ko: '회수',
  },
  stampHistoryAdjust: {
    en: 'Adjusted',
    th: 'ปรับ',
    ko: '조정',
  },
  stampExpiresAt: {
    en: 'Card valid until {date}',
    th: 'ใช้ได้ถึง {date}',
    ko: '카드 유효기간: {date}까지',
  },
  stampCardSequence: {
    en: 'Card #{n}',
    th: 'การ์ด #{n}',
    ko: '카드 #{n}',
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
  showCouponQr: { en: 'Show QR', th: 'แสดง QR', ko: 'QR 보기' },
  couponQrTitle: { en: 'Coupon QR', th: 'QR คูปอง', ko: '쿠폰 QR' },
  couponQrHint: {
    en: 'Show this at the counter for checkout',
    th: 'แสดงที่เคาน์เตอร์เพื่อชำระเงิน',
    ko: '결제 시 카운터에서 보여 주세요',
  },
  scanCouponAtStore: {
    en: 'Staff: scan this QR at POS, or type the coupon code below if there is no scanner',
    th: 'พนักงาน: สแกน QR ที่ POS หรือพิมพ์รหัสคูปองด้านล่างถ้าไม่มีเครื่องสแกน',
    ko: '매장: POS에서 QR 스캔, 스캐너가 없으면 아래 쿠폰 코드를 입력하세요',
  },
  couponQrManualCodeLabel: {
    en: 'Coupon code',
    th: 'รหัสคูปอง',
    ko: '쿠폰 코드',
  },
  couponQrManualEntryHint: {
    en: 'Type into the POS coupon field (link member first if needed)',
    th: 'พิมพ์ในช่องคูปองที่ POS (ถ้าจำเป็นให้ผูกสมาชิกก่อน)',
    ko: 'POS 쿠폰 입력란에 입력 (필요 시 회원 연결 후)',
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
  homeQuickOrder: { en: 'Order', th: 'สั่งอาหาร', ko: '주문' },
  homeQuickOrderTitle: { en: 'Order', th: 'Order', ko: 'Order' },
  homeQuickDelivery: { en: 'Delivery', th: 'เดลิเวอรี่', ko: '배달' },
  homeQuickDeliveryTitle: { en: 'Delivery', th: 'Delivery', ko: 'Delivery' },
  homeQuickPrivilegesTitle: { en: 'Privileges', th: 'สิทธิพิเศษ', ko: '혜택' },
  homeQuickPrivilegesSub: { en: 'Coupons', th: 'Coupons', ko: '쿠폰' },
  homeQuickMyCouponsTitle: { en: 'My coupons', th: 'คูปองของฉัน', ko: '내 쿠폰' },
  homeQuickMyCoupons: { en: 'Wallet', th: 'คูปองของฉัน', ko: '쿠폰함' },
  homeQuickMoreTitle: { en: 'More', th: 'More', ko: 'More' },
  homeQuickMore: { en: 'Menu', th: 'เมนู', ko: '메뉴' },
  homeQuickMenuAria: { en: 'Quick menu', th: 'เมนูด่วน', ko: '빠른 메뉴' },
  homeQuickStores: { en: 'Stores', th: 'สาขา', ko: '매장' },
  homeQuickCoupons: { en: 'My coupons', th: 'คูปองของฉัน', ko: '내 쿠폰' },
  homeQuickProfile: { en: 'Profile', th: 'โปรไฟล์', ko: '내정보' },
  homeSpecialPrivileges: {
    en: 'Special privileges for you',
    th: 'สิทธิพิเศษสำหรับคุณ',
    ko: '나를 위한 특별 혜택',
  },
  homeViewAll: { en: 'View all', th: 'ดูทั้งหมด', ko: '전체 보기' },
  homePromoOrderNow: { en: 'Order now', th: 'สั่งเลย', ko: '지금 주문' },
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
  err_already_linked: {
    en: 'Phone number is already linked to this account.',
    th: 'เชื่อมเบอร์โทรกับบัญชีนี้แล้ว',
    ko: '이미 전화번호가 연결된 계정입니다.',
  },
  err_no_line_identity: {
    en: 'LINE account link not found. Please sign in with LINE again.',
    th: 'ไม่พบการเชื่อม LINE กรุณาเข้าสู่ระบบ LINE ใหม่',
    ko: 'LINE 연결 정보를 찾을 수 없습니다. LINE으로 다시 로그인해 주세요.',
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
  pointKind_redeem: { en: 'Redeemed', th: 'แลกคูปอง', ko: '쿠폰 교환' },
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
  signup_missing_store: {
    en: 'Please select where you are signing up.',
    th: 'กรุณาเลือกร้านที่สมัครสมาชิก',
    ko: '가입 매장을 선택해 주세요.',
  },
  signup_invalid_store: {
    en: 'The selected store is not available. Please choose again.',
    th: 'ร้านที่เลือกไม่พร้อมใช้งาน กรุณาเลือกใหม่',
    ko: '선택한 매장을 확인할 수 없습니다. 다시 선택해 주세요.',
  },
  signupStoreLabel: {
    en: 'Sign-up store',
    th: 'ร้านที่สมัคร',
    ko: '가입 매장',
  },
  signupStorePlaceholder: {
    en: 'Select a store',
    th: 'เลือกร้าน',
    ko: '매장을 선택하세요',
  },
  signupStoreOffice: {
    en: 'Online (Office)',
    th: 'ออนไลน์ (สำนักงาน)',
    ko: '온라인 (Office)',
  },
  joinStoreCompleteTitle: {
    en: 'Select your sign-up store',
    th: 'เลือกร้านที่สมัครสมาชิก',
    ko: '가입 매장을 선택해 주세요',
  },
  joinStoreCompleteDesc: {
    en: 'Please choose the store where you signed up to continue using the app.',
    th: 'กรุณาเลือกร้านที่สมัครเพื่อใช้งานแอปต่อ',
    ko: '앱 이용을 위해 가입 매장을 선택해 주세요.',
  },
  joinStoreCompleteBtn: {
    en: 'Save and continue',
    th: 'บันทึกและดำเนินการต่อ',
    ko: '저장하고 계속',
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
  if (k === 'redeem') return memberPortalT(lang, 'pointKind_redeem')
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
