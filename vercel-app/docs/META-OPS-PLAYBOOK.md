# Meta 연동 활용 플레이북 (충만)

도메인: `https://choongman-erp.vercel.app`  
체크리스트(앱·Redirect): [META-TIKTOK-INTEGRATION-CHECKLIST.md](./META-TIKTOK-INTEGRATION-CHECKLIST.md)

## 본사 — 연결 완성 (1회)

1. Supabase SQL Editor에서 **순서대로** 실행 (각 블록 따로 Run):
   - [`sql/marketing_meta_connections.sql`](../sql/marketing_meta_connections.sql)
   - [`sql/marketing_meta_ig_and_campaign_map.sql`](../sql/marketing_meta_ig_and_campaign_map.sql)
2. Vercel(충만) 확인: `META_APP_ID`, `META_APP_SECRET`, `META_TOKEN_ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL`
3. Meta 앱 Redirect URI: `https://choongman-erp.vercel.app/api/meta/oauth/callback`
4. Redeploy 후 ERP → **마케팅 → 연동** → **Facebook 연결** → 페이지 선택 → **데이터 동기화**

성공: 배지「연결됨」, 페이지명 표시, 동기화 후 spend/노출이 0이 아님.

## 마케터 — 캠페인마다

1. ERP **마케팅 캠페인** 생성 (기간·매장·예산).
2. 캠페인 **개요/성과**에서 **Meta 광고 캠페인** 매핑 (Ads Manager에 보이는 이름 또는 ID).
3. **성과/ROAS**에서 FB·IG 지출과 POS 매출을 같이 본다.
4. 프로모·협업 할인은 같은 캠페인 워크스페이스에서 관리.

경로 예:
- 연동: `/admin/marketing/integrations`
- 캠페인·성과: `/admin/marketing/campaigns` → 카드 → 성과

### 지금 진행 중·미매핑 캠페인 (우선 매핑 후보)

Facebook 연결·동기화 후, 아래 ERP 캠페인에 Ads Manager 이름을 붙여 주세요 (성과 탭 → Meta 광고 캠페인).

1. Party Set  
2. ส่วนลดบัตรพนักงานตึก CW TOWER  
3. Soju 1 Free 1  
4. CU Congrats  
5. SEOUL คุ้ม!  
6. ส่วนลดนักเรียน/นักศึกษา  
7. Mother's Day Sharing Set  

(Meta에 실제 광고가 없는 캠페인은 「연결 안 함」으로 두면 됩니다.)

## 주간 루틴 (직원)

| 언제 | 할 일 |
|------|--------|
| 매주 월요일 | 연동 화면 **데이터 동기화** → 총 지출·노출 캡처 보고 |
| 캠페인 진행 중 | 매핑된 Meta 광고만 보고 과다 지출·저성과 크리에이티브 정리 |
| 연결 끊김 | 같은 화면에서 Facebook 다시 연결 |

## LINE용 태국어 (직원 붙여넣기)

```
📢 งาน Meta (Facebook/Instagram) กับ ERP — ประจำสัปดาห์

1) ทุกวันจันทร์
เข้า ERP → ผู้ดูแล → การตลาด → การเชื่อมต่อ
กด「ซิงค์ข้อมูล」แล้วส่งภาพหน้าจอค่าใช้จ่าย/การเข้าถึง ให้หัวหน้าครับ

2) เวลาทำแคมเปญ
- สร้างแคมเปญใน ERP (ช่วงเวลา สาขา งบ)
- ที่แท็บภาพรวม/ผลลัพธ์ เลือกผูก「Meta โฆษณา」ให้ตรงชื่อใน Ads Manager
- ดู ROAS คู่กับยอดขาย POS ในแท็บผลลัพธ์ครับ

3) ถ้าขึ้นว่ายังไม่เชื่อม
กด「เชื่อม Facebook」ใหม่ในหน้าการเชื่อมต่อ (อย่าส่ง App Secret ในแชทกลุ่ม)

โดเมน: https://choongman-erp.vercel.app
ห้ามวางยอดขาย/ข้อมูลลูกค้าลง ChatGPT ส่วนตัว — ใช้เฉพาะ ERP ครับ
```
