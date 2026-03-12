# 그랩·라인맨·쇼피 배달앱 ↔ POS 연동 요청 가이드

포스에서 배달 주문 타입으로 그랩/라인맨/쇼피를 선택할 수 있게 되어 있습니다.  
**실제로 배달앱 주문이 포스로 들어오게 하려면** 각 플랫폼에 연동을 요청·신청해야 합니다.

---

## 1. 그랩 (Grab / GrabFood)

### 연동 방식
- **Grab Food Partner API**를 쓰는 **공식 연동**이 있습니다.
- 메뉴 동기화, 주문 수신/자동 수락, 영업시간·상태 관리 등을 API로 처리할 수 있습니다.

### 요청 절차
1. **Grab 개발자 포털 가입**
   - [Grab Developer](https://developer.grab.com/) 접속
   - 파트너/비즈니스 계정으로 가입
2. **Food Partner API 신청**
   - 문서: [Food Partner API](https://developer.grab.com/docs/food-partner-api/)
   - OAuth 2.0 인증, 메뉴/주문/웹훅 설정 필요
3. **선택: 공인 연동 파트너 사용**
   - 직접 API 개발 대신, Grab 공인 연동을 제공하는 POS/오더 통합 업체를 쓰는 방법:
     - **iCHEF**, **Klikit**, **GetOrder** 등이 GrabFood ↔ POS 연동을 제공
   - 이 경우: 해당 업체에 “우리 POS(CM_ERP 포스)와 Grab 연동 가능한지” 문의하면 됩니다.

### 우리 포스와 연동 시
- Grab에서 **파트너/개발자**로 승인·API 키 발급 후,  
  우리 서버에 **웹훅 수신 + 메뉴/주문 API 호출** 코드를 추가해야 합니다.
- 또는 위 공인 파트너 제품을 중간에 두고, 그쪽과만 연동하는 방식도 가능합니다.

---

## 2. 라인맨 (LINE MAN Wongnai)

### 연동 방식
- **일반에 공개된 REST API**는 없고, **자사 POS(웡나이 POS, FoodStory POS)** 또는 **제휴 채널**로 연동합니다.
- “외부 POS와 API 연동”이 필요하면 **사업자/매장 단위로 문의**해야 합니다.

### 요청 절차
1. **라인맨 웡나이 가맹 포털**
   - [LINE MAN Wongnai Merchant Center](https://www.lmwnmerchantcenter.com/) (가맹점 센터)
   - 공지/문의에서 **POS 연동**, **자동 주문 수신** 관련 메뉴 확인
2. **고객센터/파트너 문의**
   - Merchant Center 내 문의 또는 담당자 연락처로  
     “**자체 POS와 주문 연동(API 또는 파트너 연동)**을 하고 싶다”고 요청
3. **자동 수락 가이드 참고**
   - [자동 수락 가이드](https://www.lmwnmerchantcenter.com/article/auto-accept-delivery-pos)에 나오는 **지원 POS**가 있으면, 그 POS를 쓰거나 그 POS 제공처에 “우리 시스템과의 연동” 문의

### 우리 포스와 연동 시
- 라인맨 측에서 **파트너/API**를 제공해 주면, 그 스펙에 맞춰 우리 서버에 **주문 수신(웹훅 등)**을 구현해야 합니다.
- 먼저 **“자체 POS 연동 가능 여부 + 필요한 조건”**을 라인맨 측에 요청하는 것이 좋습니다.

---

## 3. 쇼피 (Shopee Food)

### 연동 방식
- **공식 POS 연동용 공개 API**는 없고, 가맹점은 **Shopee Partner 앱**으로 주문·메뉴·정산을 관리합니다.
- **자체 POS와 연동**하려면 **쇼피 측 파트너/비즈니스 제안**을 요청해야 합니다.

### 요청 절차
1. **Shopee Food 가맹 신청**
   - [Shopee 파트너/가맹](https://help.shopee.co.th/1/article/115806) 등 공식 채널에서 가맹점 등록
2. **POS/연동 문의**
   - Shopee 고객센터 또는 가맹 담당자에게  
     “**자체 POS와 주문 연동(API 또는 파트너 솔루션)**을 원한다”고 요청
   - “Restaurant POS integration”, “Order sync to our POS” 등으로 문의하면 됩니다.
3. **비공식 API**
   - GitHub 등에 Shopee Food API를 다루는 비공식 프로젝트가 있을 수 있으나, **운영 사용은 위험**하므로 공식 채널 문의를 권장합니다.

### 우리 포스와 연동 시
- 쇼피가 **API 또는 파트너 연동**을 제공해 주면, 그 스펙에 맞춰 우리 쪽에 **주문 수신** 로직을 추가하면 됩니다.
- 우선 **“자체 POS 연동 정책과 방법”**을 쇼피에 요청하는 것이 좋습니다.

---

## 4. 요청 시 쓸 수 있는 문구 (예시)

- **영어 (이메일/지원 티켓용)**  
  - “We operate a restaurant and use our own POS system. We would like to **integrate orders from [Grab Food / LINE MAN Wongnai / Shopee Food]** into our POS (order reception, menu sync if possible). Do you offer an **API or a partner integration program** for third-party POS? Please let us know the process and requirements.”

- **한국어 (내부 정리용)**  
  - “저희는 자체 POS를 사용 중입니다. [그랩 / 라인맨 / 쇼피] 배달 주문을 우리 POS로 받고 싶습니다. **API 또는 제3자 POS 연동 프로그램**이 있는지, 있다면 **신청 절차와 요구 조건**을 알려 주세요.”

---

## 5. 정리

| 플랫폼   | 공식 API        | 요청처                          | 비고 |
|----------|-----------------|----------------------------------|------|
| **그랩** | Food Partner API 있음 | Grab Developer 포털 / 공인 연동 파트너 | OAuth, 웹훅 구현 필요 |
| **라인맨** | 공개 API 없음   | Merchant Center, 고객센터/담당자 문의 | 파트너·API 여부 문의 후 연동 |
| **쇼피** | 공개 API 없음   | Shopee 가맹·고객센터 문의        | 파트너·연동 정책 문의 후 연동 |

우리 포스는 이미 **배달 + 그랩/라인맨/쇼피 선택** UI와 주문 타입·정산 구분은 되어 있으므로,  
각 플랫폼에서 **주문 수신(웹훅/API)** 방식을 제공해 주면, 그에 맞춰 **주문 수신 API·웹훅 핸들러**만 추가하면 됩니다.
