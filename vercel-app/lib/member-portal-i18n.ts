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
  | 'contactMenuClose'
  | 'memberLounge'
  | 'logout'
  | 'tierNext'
  | 'tierMax'
  | 'tierProgress'
  | 'statLifetime'
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
  | 'locationTitle'
  | 'locationDesc'
  | 'locationComing'
  | 'locationSearchPh'
  | 'locationNoResult'
  | 'locationOpenMap'
  | 'locationCode'
  | 'locationFavorite'
  | 'locationFavoriteSet'
  | 'locationFavoriteSaved'
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
  | 'nationalityLabel'
  | 'referralInputLabel'
  | 'consentMarketing'
  | 'saveProfile'
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
  statLifetime: { en: 'Lifetime spend', th: 'ยอดใช้จ่ายสะสม', ko: '누적 이용 금액' },
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
    en: 'Start order flow with pickup or delivery.',
    th: 'เริ่มสั่งซื้อได้ทั้งรับที่ร้านและเดลิเวอรี',
    ko: '픽업 또는 배달 주문을 시작하세요.',
  },
  orderPickupBtn: { en: 'Pickup order', th: 'รับที่ร้าน', ko: '픽업 주문' },
  orderDeliveryBtn: { en: 'Delivery order', th: 'เดลิเวอรี', ko: '배달 주문' },
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
    en: 'Coupons, points, and visit history in one place.',
    th: 'รวมคูปอง แต้ม และประวัติการใช้บริการไว้ในหน้าเดียว',
    ko: '쿠폰, 포인트, 이용 내역을 한 화면에서 확인하세요.',
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
  profileSub: {
    en: 'Update your info for better benefits',
    th: 'อัปเดตข้อมูลเพื่อรับสิทธิประโยชน์ที่เหมาะกับคุณ',
    ko: '맞춤 혜택을 위해 정보를 업데이트하세요',
  },
  nameLabel: { en: 'Name', th: 'ชื่อ', ko: '이름' },
  emailLabel: { en: 'Email', th: 'อีเมล', ko: '이메일' },
  genderLabel: { en: 'Gender', th: 'เพศ', ko: '성별' },
  nationalityLabel: { en: 'Nationality', th: 'สัญชาติ', ko: '국적' },
  referralInputLabel: { en: 'Referral code (optional)', th: 'รหัสผู้แนะนำ (ถ้ามี)', ko: '추천 코드 (선택)' },
  consentMarketing: {
    en: 'I agree to receive news and promotions',
    th: 'ยินยอมรับข่าวสารและโปรโมชัน',
    ko: '마케팅 수신에 동의합니다',
  },
  saveProfile: { en: 'Save profile', th: 'บันทึกข้อมูล', ko: '저장' },
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
  return status || '-'
}
