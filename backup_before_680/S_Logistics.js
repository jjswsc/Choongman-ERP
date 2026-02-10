/* =================================================================
   물류 관리: 품목, 거래처, 재고, 주문
   ================================================================= */

/* =================================================================
   품목/거래처
   ================================================================= */   

   /* [Code.gs] 품목 조회 (있는 그대로 가져오기) */
function getAdminItemsList() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("품목");
  if (!sheet) return [];
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return []; 

  // 데이터 전체 범위 (A열 ~ J열까지 넉넉하게)
  // 컬럼이 부족해도 에러 안 나게 처리
  var maxCol = sheet.getMaxColumns();
  var rangeCol = maxCol < 10 ? maxCol : 10; 
  var data = sheet.getRange(2, 1, lastRow - 1, rangeCol).getValues();
  
  var list = [];
  for (var i = 0; i < data.length; i++) {
    // J열 (인덱스 9) 값을 있는 그대로 가져옴 (없으면 빈칸)
    // 안전장치 제거: 무조건 '과세'로 바꾸는 코드 삭제함
    var rawTax = (data[i].length > 9) ? String(data[i][9]).trim() : ""; 

    list.push({
      row: i + 2,
      code: data[i][0],
      category: data[i][1],
      name: data[i][2],
      spec: data[i][3],
      price: data[i][4],
      cost: data[i][5],
      image: data[i][6],  // ★ G열 (인덱스 6) : 이미지
      vendor: data[i][7], // ★ H열 (인덱스 7) : 거래처
      tax: data[i][9]     // J열 (인덱스 9) : 과세
    });
  }
  return list;
}

/* [Code.gs] 품목 저장 (A~J열 통째로 묶어 저장 - 완벽 해결) */
function saveAdminItem(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("품목");
  if (!sheet) return "❌ '품목' 시트가 없습니다.";
  
  try {
    var row = Number(data.row);
    
    // 1. 신규 등록이면 맨 아래에 추가
    if (row === 0) {
      row = sheet.getLastRow() + 1;
    }

    // 2. 시트의 컬럼이 10개(J열)보다 적으면 강제로 늘림 (공간 확보)
    if (sheet.getMaxColumns() < 10) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), 10 - sheet.getMaxColumns());
    }
    
    // 3. 현재 그 줄에 있는 데이터를 먼저 가져옴 (기존 G,H,I열 데이터 보존 위해)
    // 1번(A)부터 10번(J)까지 한 번에 범위를 잡음
    var range = sheet.getRange(row, 1, 1, 10);
    var currentValues = range.getValues()[0]; // 배열로 가져옴
    
    // 만약 빈 줄이면(신규) 빈 칸으로 채움
    for(var k=0; k<10; k++) {
      if(currentValues[k] === undefined) currentValues[k] = "";
    }

    // 4. 데이터 덮어쓰기 (배열 안에서 수정)
    currentValues[0] = data.code;       // A열
    currentValues[1] = data.category;   // B열
    currentValues[2] = data.name;       // C열
    currentValues[3] = data.spec;       // D열
    currentValues[4] = Number(data.price) || 0; // E열
    currentValues[5] = Number(data.cost) || 0;  // F열
    
    // G, H, I열 (인덱스 6,7,8)은 건드리지 않고 기존 값 유지

    // ★ J열 (인덱스 9) : 과세/면세 확실하게 박아넣기
    currentValues[9] = (data.tax === "면세") ? "면세" : "과세";

    // 5. 수정된 10칸짜리 배열을 시트에 한 방에 저장
    range.setValues([currentValues]);
    
    SpreadsheetApp.flush(); // 즉시 반영
    
    return "✅ 저장 완료 (" + currentValues[9] + ")";
    
  } catch (e) {
    return "❌ 오류: " + e.message;
  }
}

function deleteAdminItem(row) { var ss = SpreadsheetApp.getActiveSpreadsheet(); var s = ss.getSheetByName("품목") || ss.getSheetByName("Items"); s.deleteRow(row); return "🗑️ 삭제 완료"; }

/* [최종 수정] 앱 품목 조회 (칸 수 상관없이 무조건 작동하는 버전) */
function getItems(storeName) { 
  var ss = SpreadsheetApp.getActiveSpreadsheet(); 
  var s = ss.getSheetByName("품목") || ss.getSheetByName("Items"); 
  if(!s) return []; 
  
  // 1. "몇 칸 읽어라" 하지 않고 "있는거 다 가져와" (에러 원천 차단)
  var data = s.getDataRange().getValues();
  
  // 데이터가 헤더(1줄)밖에 없으면 빈 목록 반환
  if (data.length < 2) return [];

  // 2. 매장별 적정재고 설정 가져오기 (기존 기능)
  var safeMap = {};
  if (storeName) {
      var safeSheet = ss.getSheetByName("매장설정");
      if (safeSheet && safeSheet.getLastRow() > 1) {
          try {
              var safeData = safeSheet.getDataRange().getValues();
              for (var i = 1; i < safeData.length; i++) {
                  if (String(safeData[i][0]) === String(storeName)) {
                      safeMap[String(safeData[i][1])] = safeData[i][2]; 
                  }
              }
          } catch(e) { /* 매장설정 시트 에러나도 품목은 보여줘야 함 */ }
      }
  }

  var list = [];
  // 3. 데이터 한 줄씩 안전하게 포장하기
  // (헤더인 0번째 줄은 건너뛰고 1번째 줄부터 시작)
  for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue; // 코드가 비어있으면 건너뜀

      // ★ 안전장치: 칸이 모자라도 에러 안 나게 'undefined' 체크
      var code = row[0];
      var safeQty = safeMap[code] || 0;
      
      // G열(이미지)이 없으면 빈칸 처리
      var imgLink = (row.length > 6 && row[6]) ? String(row[6]).trim() : "";
      
      // J열(과세)이 없으면 기본 '과세' 처리
      var taxVal = (row.length > 9 && row[9]) ? String(row[9]).trim() : "과세";
      var taxType = (taxVal === "면세") ? "면세" : "과세";

      // 앱으로 보낼 데이터 (순서 중요!)
      list.push([
          row[0], // 0: 코드
          row[1], // 1: 카테고리
          row[2], // 2: 이름
          row[3], // 3: 규격
          Number(row[4])||0, // 4: 판매가
          Number(row[5])||0, // 5: 원가
          imgLink, // 6: 이미지
          "",      // 7: (예비)
          safeQty, // 8: 적정재고
          taxType  // 9: 과세 구분
      ]);
  }
  
  return list;
}

/* [Code.gs] ★ 만능 품목 데이터 조회 함수 (앱/관리자 공통 엔진) */
function getCommonItemData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("품목");
  if (!sheet) return [];
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // ★ 핵심: 시트의 실제 컬럼 수만큼만 읽어서 에러 방지
  var maxCol = sheet.getMaxColumns();
  // 최소 10열(J)까지 읽고 싶지만, 실제 컬럼이 적으면 있는 만큼만 읽음
  var readCol = (maxCol >= 10) ? 10 : maxCol;
  
  var data = sheet.getRange(2, 1, lastRow - 1, readCol).getValues();
  var list = [];
  
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    
    // G열(이미지): 인덱스 6 (컬럼이 짧으면 빈칸 처리)
    var imgLink = (row.length > 6 && row[6]) ? String(row[6]).trim() : "";
    
    // J열(과세): 인덱스 9 (컬럼이 짧으면 기본 '과세' 처리)
    var jVal = (row.length > 9 && row[9]) ? row[9] : "과세";
    var taxType = (String(jVal).trim() === "면세") ? "면세" : "과세";
    
    list.push({
      code: String(row[0]),       // 0: 코드
      category: String(row[1]),   // 1: 카테고리
      name: String(row[2]),       // 2: 품목명
      spec: String(row[3]),       // 3: 규격
      price: Number(row[4]) || 0, // 4: 판매가
      cost: Number(row[5]) || 0,  // 5: 원가
      img: imgLink,               // 6: 이미지
      tax: taxType                // 9: 과세
    });
  }
  return list;
}

function getItemCategories() { var ss = SpreadsheetApp.getActiveSpreadsheet(); var s = ss.getSheetByName("품목") || ss.getSheetByName("Items"); if(!s) return []; var d = s.getRange(2, 2, s.getLastRow()-1, 1).getValues().flat(); var unique = {}; d.forEach(c => { if(c) unique[c] = true; }); return Object.keys(unique).sort(); }

/* [Code.gs] 거래처 목록 조회 (빈 줄 에러 방지 강화판) */
function getVendorManagementList() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("거래처");
  if (!sheet) return [];
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return []; // 데이터 없으면 빈 배열 반환

  // A열~K열까지 전체 범위 가져오기
  var data = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  var list = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    
    // ★ 핵심 수정: A열(구분)이나 C열(상호명)이 없으면 빈 줄로 간주하고 건너뜀 (에러 방지)
    if (!row[0] && !row[2]) continue;

    list.push({
      row: i + 2,
      type: String(row[0] || ""),      // A열: 구분 (매입처/매출처)
      code: String(row[1] || ""),      // B열: 코드
      name: String(row[2] || ""),      // C열: 상호명
      taxId: String(row[3] || ""),     // D열: 사업자번호
      ceo: String(row[4] || ""),       // E열: 대표자
      addr: String(row[5] || ""),      // F열: 주소
      manager: String(row[6] || ""),   // G열: 담당자
      phone: String(row[7] || ""),     // H열: 연락처
      balance: Number(row[8] || 0),    // I열: 미수금 (숫자 변환)
      memo: String(row[10] || "")      // K열: 메모
    });
  }
  
  return list;
}

function saveVendor(d) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(); var s = ss.getSheetByName("거래처");
  if (!s) { ss.insertSheet("거래처"); s = ss.getSheetByName("거래처"); s.appendRow(["구분","코드","회사명","사업자번호","대표자","주소","담당자","연락처","미수금","메모"]); }
  var rowData = [d.type, d.code, d.name, d.taxId, d.ceo, d.addr, d.manager, d.phone, d.balance, d.memo];
  if (Number(d.row) == 0) {
    var codes = s.getRange(2, 2, s.getLastRow()-1, 1).getValues().flat();
    if(d.code && codes.includes(d.code)) return "❌ 이미 존재하는 거래처 코드입니다.";
    s.appendRow(rowData); SpreadsheetApp.flush(); return "✅ 신규 거래처 등록 완료";
  } else {
    s.getRange(Number(d.row), 1, 1, 10).setValues([rowData]); SpreadsheetApp.flush(); return "✅ 거래처 정보 수정 완료";
  }
}

function deleteVendor(row) { var ss = SpreadsheetApp.getActiveSpreadsheet(); var s = ss.getSheetByName("거래처"); s.deleteRow(row); return "🗑️ 삭제 완료"; }

/* [Code.gs] 거래처 목록 가져오기 (캐시 적용 - 속도 🚀) */
function getVendorNamesByType(type) {
  // 1. 캐시(임시 저장소) 확인
  var cache = CacheService.getScriptCache();
  var cachedData = cache.get("vendor_list_" + type);
  
  // 2. 캐시에 있으면 그거 바로 줌 (시트 안 열음 -> 초고속)
  if (cachedData != null) {
    return JSON.parse(cachedData);
  }

  // 3. 캐시에 없으면 시트에서 읽어옴 (기존 방식)
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("거래처");
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var rowType = String(data[i][0]).trim();
    var rowName = String(data[i][2]).trim();
    if (rowType === type && rowName !== "") {
      list.push(rowName);
    }
  }

  // 4. 읽어온 걸 캐시에 저장 (다음 6시간 동안은 시트 안 읽음)
  cache.put("vendor_list_" + type, JSON.stringify(list), 21600); // 21600초 = 6시간

  return list;
}

// 1. 매출처(판매처) 목록만 가져오기
function getSalesVendorList() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName("거래처");
  if (!s) return [];
  
  var d = s.getDataRange().getValues();
  var list = [];
  // 1행 헤더 제외
  for (var i = 1; i < d.length; i++) {
    // A열:구분, C열:회사명
    if (d[i][0] === "매출처" && d[i][2]) {
      list.push(d[i][2]); // 회사명만 리스트에 담음
    }
  }
  return list;
}

/* =================================================================
   재고/주문
   ================================================================= */  

/* [C] 앱(Page) 기능 */
function getStoreStock(store) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(); var s = ss.getSheetByName("재고"); if(!s) return {};
  var d = s.getDataRange().getValues(); var m = {};
  for (var i = 1; i < d.length; i++) { if (String(d[i][0]).trim() == String(store).trim()) { m[d[i][1]] = (m[d[i][1]] || 0) + Number(d[i][4]); } }
  return m;
}

function processOrder(data) {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("주문");
  var sub = 0; data.cart.forEach(function(i){sub += Number(i.price) * Number(i.qty)});
  var vat = Math.round(sub * 0.07); var total = sub + vat;
  s.appendRow([new Date(), data.storeName, data.userName, JSON.stringify(data.cart), sub, vat, total, "Pending"]);
  return "✅ 주문 완료";
}

function processUsage(data) {
  var s = SpreadsheetApp.getActiveSpreadsheet();
  var today = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
  data.items.forEach(function(k) { s.appendRow([data.storeName, k.code, k.name, "Usage", -Number(k.qty), today, "Store", "Usage"]); });
  return "✅ 출고 등록 완료";
}

/** 인보이스 번호 생성: IV + yyyyMMdd + 3자리 순번 (당일 재고·주문 시트 기존 번호 기준) */
function getNextInvoiceNumber() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var today = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd");
  var prefix = "IV" + today;
  var maxSeq = 0;
  var re = new RegExp("^IV(\\d{8})(\\d{1,5})$");
  function parseSeq(str) {
    if (!str || String(str).trim() === "") return 0;
    var s = String(str).trim();
    if (s.indexOf("IV") !== 0) return 0;
    var m = s.match(re);
    if (!m || m[1] !== today) return 0;
    return parseInt(m[2], 10) || 0;
  }
  var stockSheet = ss.getSheetByName("재고");
  if (stockSheet && stockSheet.getLastRow() > 1) {
    var lastCol = Math.max(stockSheet.getMaxColumns(), 9);
    var col9 = stockSheet.getRange(2, 9, stockSheet.getLastRow(), 9).getValues();
    for (var i = 0; i < col9.length; i++) {
      var seq = parseSeq(col9[i][0]);
      if (seq > maxSeq) maxSeq = seq;
    }
  }
  var orderSheet = ss.getSheetByName("주문");
  if (orderSheet && orderSheet.getLastRow() > 1) {
    var oCols = Math.max(orderSheet.getMaxColumns(), 10);
    if (oCols >= 10) {
      var oCol10 = orderSheet.getRange(2, 10, orderSheet.getLastRow(), 10).getValues();
      for (var j = 0; j < oCol10.length; j++) {
        var seq2 = parseSeq(oCol10[j][0]);
        if (seq2 > maxSeq) maxSeq = seq2;
      }
    }
  }
  var next = maxSeq + 1;
  return prefix + ("000" + next).slice(-3);
}

function processOrderDecision(row, decision, updatedCart) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(); var orderSheet = ss.getSheetByName("주문"); var stockSheet = ss.getSheetByName("재고");
  if(orderSheet.getRange(row, 8).getValue() == "Approved") return "이미 승인됨";
  if (updatedCart) {
    var newSub = 0; updatedCart.forEach(function(i){ newSub += Number(i.price) * Number(i.qty); }); var newVat = Math.round(newSub * 0.07); var newTotal = newSub + newVat;
    orderSheet.getRange(row, 4).setValue(JSON.stringify(updatedCart)); orderSheet.getRange(row, 5).setValue(newSub); orderSheet.getRange(row, 6).setValue(newVat); orderSheet.getRange(row, 7).setValue(newTotal);
  }
  orderSheet.getRange(row, 8).setValue(decision);
  if(decision == "Approved") {
    var invNo = getNextInvoiceNumber();
    if (orderSheet.getMaxColumns() < 10) orderSheet.insertColumnsAfter(orderSheet.getMaxColumns(), 10 - orderSheet.getMaxColumns());
    orderSheet.getRange(row, 10).setValue(invNo);
    var data = orderSheet.getRange(row, 1, row, 9).getValues()[0]; var store = data[1]; var finalCart = updatedCart ? updatedCart : (typeof data[3] === "string" && (data[3].indexOf("[") !== -1 || data[3].indexOf("{") !== -1) ? JSON.parse(data[3]) : []); var today = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
    finalCart.forEach(function(item) {
      stockSheet.appendRow(["본사", item.code, item.name, item.spec || "-", -Number(item.qty), today, "To " + store, "Outbound", invNo]);
      stockSheet.appendRow([store, item.code, item.name, item.spec || "-", Number(item.qty), today, "From HQ", "Inbound", invNo]);
    });
    return "✅ 승인 완료";
  }
  return "✅ 처리됨: " + decision;
}

/* [수정됨] 주문 승인 조회 (칸 밀림 자동 감지, 품목 D열 규격, Office 재고 포함) */
function getAdminOrders(startStr, endStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("주문");
  var itemSheet = ss.getSheetByName("품목");

  if (!sheet) return { list: [], officeStock: {} };

  // 1. 품목: 과세 정보 + D열 규격
  var taxMap = {};
  var specByCode = {};
  var specByName = {};
  if (itemSheet) {
    var iData = itemSheet.getDataRange().getValues();
    for (var k = 1; k < iData.length; k++) {
      var code = String(iData[k][0] || "").trim();
      var iName = String(iData[k][2] || "").trim();
      var spec = String(iData[k][3] || "").trim(); // D열: 규격
      var jVal = (iData[k].length > 9) ? iData[k][9] : "과세";
      taxMap[iName] = (String(jVal).trim() === "면세") ? "면세" : "과세";
      if (code) specByCode[code] = spec || "-";
      if (iName) specByName[iName] = spec || "-";
    }
  }

  var officeStock = getStoreStock("본사") || {};
  if (Object.keys(officeStock).length === 0) {
    officeStock = getStoreStock("Office") || {};
  }

  var data = sheet.getDataRange().getValues();
  var list = [];
  var tz = ss.getSpreadsheetTimeZone();

  // 최신순 조회
  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    var dateVal = row[0];
    if (!dateVal) continue;
    
    var dateStr = Utilities.formatDate(new Date(dateVal), tz, "yyyy-MM-dd");
    if (dateStr < startStr || dateStr > endStr) continue;

    // ★ 핵심 수정: 데이터가 어느 칸에 있는지 확인 (자동 감지)
    // 최신 버전(V103)은 E열(인덱스 4)이 JSON, 구버전은 D열(인덱스 3)이 JSON
    var jsonIndex = 4; 
    var rawJson = row[4];
    
    // 만약 E열이 비어있거나 JSON이 아니면 D열을 확인
    if (!rawJson || (String(rawJson).indexOf("[") === -1 && String(rawJson).indexOf("{") === -1)) {
        if (String(row[3]).indexOf("[") !== -1 || String(row[3]).indexOf("{") !== -1) {
            jsonIndex = 3; // 구버전 데이터구나!
            rawJson = row[3];
        }
    }

    // 상태(Status) 위치 찾기 (맨 끝 열)
    // 보통 8번(I열) 아니면 9번(J열)
    var status = "Pending";
    if (row[9] && (row[9] === "Pending" || row[9] === "Approved" || row[9] === "Rejected")) status = row[9];
    else if (row[8] && (row[8] === "Pending" || row[8] === "Approved" || row[8] === "Rejected")) status = row[8];
    else if (row[7] && (row[7] === "Pending" || row[7] === "Approved" || row[7] === "Rejected")) status = row[7];
    
    var items = [];
    var calcTotal = 0;
    
    try {
        if (rawJson && rawJson !== "") {
            var cart = JSON.parse(rawJson);
            items = cart.map(function(p) {
                var code = String(p.code || "").trim();
                var name = String(p.name || "").trim();
                var spec = specByCode[code] || specByName[name] || p.spec || "-";
                var tType = taxMap[name] || "과세";
                var tRate = (tType === "과세") ? 1.07 : 1.0;
                var lTotal = Number(p.price) * Number(p.qty) * tRate;
                calcTotal += lTotal;
                return {
                    code: code, name: name, spec: spec, qty: p.qty, price: p.price, taxType: tType, lineTotal: lTotal
                };
            });
        }
    } catch (e) {
        items = [];
    }

    var summary = items.length > 0 ? items[0].name + (items.length > 1 ? " 외 " + (items.length - 1) + "건" : "") : "내용 없음";
    
    // 합계 금액 (JSON 계산값 우선, 없으면 시트 값 찾기)
    // 숫자가 너무 크면(천문학적 숫자) 시트 값 무시하고 0으로 처리
    var sheetTotal = Number(row[jsonIndex + 3]) || 0; // JSON위치 + 3칸 뒤가 보통 합계
    if (sheetTotal > 100000000) sheetTotal = 0; // 날짜를 읽은 경우 방지

    var finalTotal = (items.length > 0) ? calcTotal : sheetTotal;

    var invoiceNo = (row.length > 9 && row[9]) ? String(row[9]).trim() : "";
    list.push({
      row: i + 1,
      orderId: (jsonIndex === 4) ? row[3] : "", // 신버전이면 D열이 주문코드
      date: Utilities.formatDate(new Date(dateVal), tz, "MM/dd HH:mm"),
      store: row[1],
      total: Math.round(finalTotal),
      status: status,
      items: items,
      summary: summary,
      invoiceNo: invoiceNo
    });
    
    if (list.length >= 300) break;
  }
  return { list: list, officeStock: officeStock };
}

/** Delivery Note/Tax Invoice 인쇄용 회사 정보 (거래처 시트 '본사' 또는 기본값) */
function getInvoiceCompanyInfo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName("거래처");
  if (s && s.getLastRow() > 1) {
    var cols = Math.min(s.getLastRow() > 0 ? s.getMaxColumns() : 0, 10);
    if (cols < 8) cols = 10;
    var data = s.getRange(2, 1, s.getLastRow(), cols).getValues();
    for (var i = 0; i < data.length; i++) {
      var gubun = String(data[i][0] || "").trim();
      if (gubun === "본사" || gubun === "Head Office") {
        return {
          companyName: String(data[i][2] || "บริษัท เอสแอนด์เจ โกลบอล จำกัด (Head Office)").trim(),
          address: String(data[i][5] || "").trim() || "-",
          taxId: String(data[i][3] || "0105566137147").trim(),
          phone: String(data[i][7] || "091-072-6252").trim(),
          bankInfo: String((data[i].length > 9 ? data[i][9] : "") || "ธนาคารกสิกรไทย เลขที่ 166-2-97079-0 ชื่อบัญชี บจก. เอสแอนด์เจ โกลบอล").trim(),
          projectName: "CM True Digital Park"
        };
      }
    }
  }
  return {
    companyName: "บริษัท เอสแอนด์เจ โกลบอล จำกัด (Head Office)",
    address: "-",
    taxId: "0105566137147",
    phone: "091-072-6252",
    bankInfo: "ธนาคารกสิกรไทย เลขที่ 166-2-97079-0 ชื่อบัญชี บจก. เอสแอนด์เจ โกลบอล",
    projectName: "CM True Digital Park"
  };
}

/** 설정 페이지: 본사 정보 저장 (거래처 시트 '본사' 행 추가/수정, 인보이스 발행용) */
function saveHeadOfficeInfoToSheet(d) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName("거래처");
  if (!s) {
    s = ss.insertSheet("거래처");
    s.appendRow(["구분", "코드", "회사명", "사업자번호", "대표자", "주소", "담당자", "연락처", "미수금", "메모"]);
  }
  var companyName = String(d.companyName || "").trim();
  var taxId = String(d.taxId || "").trim();
  var address = String(d.address || "").trim();
  var phone = String(d.phone || "").trim();
  var bankInfo = String(d.bankInfo || "").trim();
  var data = s.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || "").trim() === "본사" || String(data[i][0] || "").trim() === "Head Office") {
      rowIndex = i + 1;
      break;
    }
  }
  var row = ["본사", "", companyName || "본사", taxId, "", address, "", phone, "", bankInfo];
  if (rowIndex > 0) {
    s.getRange(rowIndex, 1, rowIndex, 10).setValues([row]);
    return "✅ 본사 정보가 수정되었습니다.";
  } else {
    s.appendRow(row);
    return "✅ 본사 정보가 등록되었습니다.";
  }
}

/** 인보이스 인쇄용: 본사 정보 + 매출처(회사명별) 정보 한 번에 반환 (거래처 시트) */
function getInvoiceData() {
  var company = getInvoiceCompanyInfo();
  var clients = {};
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("거래처");
  if (s && s.getLastRow() > 1) {
    var cols = Math.min(Math.max(s.getMaxColumns(), 8), 10);
    var data = s.getRange(2, 1, s.getLastRow(), cols).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0] || "").trim() !== "매출처") continue;
      var name = String(data[i][2] || "").trim();
      if (!name) continue;
      clients[name] = {
        companyName: name,
        address: String(data[i][5] || "").trim() || "-",
        taxId: String(data[i][3] || "").trim() || "-",
        phone: String(data[i][7] || "").trim() || "-"
      };
    }
  }
  return { company: company, clients: clients };
}

/* 1. 재고 현황 조회 (매장별 적정재고 포함해서 전송) */
function getStockStatusAdmin(s, d) { 
  var ss = SpreadsheetApp.getActiveSpreadsheet(); 
  var items = ss.getSheetByName("품목").getRange(2,1,ss.getSheetByName("품목").getLastRow()-1,7).getValues(); 
  var logs = ss.getSheetByName("재고").getDataRange().getValues(); 
  
  // ★ 매장설정 시트에서 적정재고 가져오기
  var safeMap = {};
  var safeSheet = ss.getSheetByName("매장설정");
  if (safeSheet && safeSheet.getLastRow() > 1) {
    var safeData = safeSheet.getDataRange().getValues();
    for(var k=1; k<safeData.length; k++){
       // 키: "매장명_상품코드" (예: Bangna_CM001)
       var key = String(safeData[k][0]) + "_" + String(safeData[k][1]);
       safeMap[key] = safeData[k][2];
    }
  }

  var td = d ? new Date(d) : new Date(); 
  td.setHours(23, 59, 59, 999); 
  var sm = {}; 
  var hq = (s == "본사" || s == "Office"); 
  
  for (var i = 1; i < logs.length; i++) { 
    var ld = new Date(logs[i][5]); 
    var rs = logs[i][0]; 
    var c = logs[i][1]; 
    var q = Number(logs[i][4]); 
    if (ld > td) continue; 
    
    if (hq) { if (rs == "본사" || rs == "Office") sm[c] = (sm[c] || 0) + q; }
    else { if (rs == s) sm[c] = (sm[c] || 0) + q; } 
  } 
  
  return items.map(function(i) {
    var q = sm[i[0]] || 0; 
    // 현재 조회하는 매장(s)과 품목코드(i[0])로 적정재고 찾기
    var myKey = s + "_" + i[0];
    var mySafe = safeMap[myKey] || 0; 

    return {
        code: i[0], category: i[1], name: i[2], spec: i[3], cost: i[5], 
        qty: q, total: q * i[5], img: i[6], 
        safe: mySafe // ★ 화면으로 적정재고 보냄
    };
  }); 
}

/* 2. 매장별 적정재고 저장 (화면에서 입력하면 여기로 옴) */
function saveStoreSafetyStock(store, code, qty) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName("매장설정");
  // 시트가 없으면 생성
  if (!s) { ss.insertSheet("매장설정"); s = ss.getSheetByName("매장설정"); s.appendRow(["매장","코드","적정재고"]); }
  
  var d = s.getDataRange().getValues();
  // 이미 값이 있으면 수정
  for (var i = 1; i < d.length; i++) {
    if (String(d[i][0]) === String(store) && String(d[i][1]) === String(code)) {
      s.getRange(i + 1, 3).setValue(qty); 
      return "수정됨";
    }
  }
  // 없으면 새로 추가
  s.appendRow([store, code, qty]);
  return "저장됨";
}

/* [Code.gs] 입고 등록 저장 (위치 정확도 향상) */
function registerInboundBatch(list) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("재고");
  if (!sheet) return "❌ '재고' 시트를 찾을 수 없습니다.";

  try {
    var dataToSave = [];
    list.forEach(function(item) {
      // 숫자 변환
      var qty = parseFloat(String(item.qty).replace(/,/g, '')) || 0;
      var dateObj = item.date ? new Date(item.date) : new Date();

      // 저장할 한 줄 데이터 (A~H열 순서 중요)
      dataToSave.push([
        "입고등록",       // A: 작성자
        item.code,        // B: 코드
        item.name,        // C: 품목명
        item.spec || "",  // D: 규격
        qty,              // E: 수량
        dateObj,          // F: 날짜
        item.vendor,      // G: 거래처(매입처)
        "Inbound"         // H: 구분 (★ 이게 있어야 조회가 됨)
      ]);
    });

    // 한방에 저장 (속도 빠름) - getRange(rowStart, colStart, rowEnd, colEnd)
    if (dataToSave.length > 0) {
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, lastRow + dataToSave.length, 8).setValues(dataToSave);
    }

    return "✅ " + list.length + "건 입고 완료!";
  } catch (e) {
    return "❌ 오류: " + e.message;
  }
}

/**
 * [최종 통합] 강제 출고 실행 (본사 차감 + 매장 증가 동시 반영). 매장별 인보이스 번호(IV+날짜+순번) 자동 부여
 * @param {Array} l - 출고 품목 리스트
 */
function forceOutboundBatch(l) {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("재고");
  
  if (!s) return "❌ '재고' 시트가 없습니다. 시트 이름을 확인해주세요.";

  try {
    var byStore = {};
    l.forEach(function(d) {
      var st = String(d.store || "").trim();
      if (!byStore[st]) byStore[st] = [];
      byStore[st].push(d);
    });
    Object.keys(byStore).forEach(function(store) {
      var invNo = getNextInvoiceNumber();
      var list = byStore[store];
      list.forEach(function(d) {
        var qty = Number(d.qty);
        var date = d.date || new Date();
        s.appendRow([d.store, d.code, d.name, "-", qty, date, "HQ", "ForcePush", invNo]);
        s.appendRow(["본사", d.code, d.name, "-", -qty, date, d.store, "Outbound", invNo]);
      });
    });

    return "✅ " + l.length + "건의 강제 출고 및 매장 재고 반영이 완료되었습니다.";
  } catch (e) {
    return "❌ 오류 발생: " + e.message;
  }
}

// 1. [통합] 출고 내역 조회 (일반 주문 + 강제 출고 모두 표시)
function getOutboundHistory(startStr, endStr, storeFilter) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName("재고"); // '주문' 시트가 아니라 '재고' 시트를 봐야 정확함
  if (!s) return [];
  
  var d = s.getDataRange().getValues();
  var list = [];
  
  // 날짜 필터 설정 (시분초 제거하여 정확도 향상)
  var startDate = new Date(startStr); startDate.setHours(0,0,0,0);
  var endDate = new Date(endStr); endDate.setHours(23,59,59,999);
  
  // 최신순(역순) 탐색
  for (var i = d.length - 1; i >= 1; i--) {
    var rowDate = new Date(d[i][5]); // F열: 날짜
    var type = d[i][7]; // H열: 구분
    
    // 날짜 유효성 체크
    if (isNaN(rowDate.getTime())) continue;
    
    // 조건: 날짜 범위 안이고, 타입이 (Outbound 또는 ForceOut) 인 경우
    if (rowDate >= startDate && rowDate <= endDate) {
      if (type === "Outbound" || type === "ForceOut" || type === "ForcePush") {
        
        var targetStore = "";
        var summary = "";
        
        // 데이터 포맷팅
        if (type === "ForceOut" || type === "ForcePush") {
           // 강제 출고인 경우 (비고란에 "To 매장명" 형식)
           targetStore = String(d[i][6]).replace("To ", ""); 
           summary = "[강제] " + d[i][2]; // 품목명
        } else {
           // 일반 출고인 경우 (비고란에 "To 매장명" 형식)
           targetStore = String(d[i][6]).replace("To ", "");
           summary = d[i][2]; // 품목명
        }

        // 매장 필터 적용
        if (storeFilter && storeFilter !== "All" && storeFilter !== "전체" && targetStore !== storeFilter) continue;

        list.push({
          date: Utilities.formatDate(rowDate, "GMT+7", "yyyy-MM-dd"),
          store: targetStore,
          type: (type === "ForceOut" || type === "ForcePush") ? "⚡강제출고" : "📦일반출고",
          summary: summary,
          qty: Math.abs(d[i][4]) // 수량
        });
      }
    }
    if (list.length >= 300) break; // 데이터 과부하 방지
  }
  return list;
}

/* [Code.gs] 입고 내역 조회 (품목 시트 D열 규격 + F열 원가 반영) */
function getInboundHistory(startStr, endStr, vendorFilter) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName("재고");
  var itemSheet = ss.getSheetByName("품목"); 
  if (!s || !itemSheet) return [];
  
  // 1. 품목 정보 지도 만들기 (규격 & 원가)
  var iData = itemSheet.getDataRange().getValues();
  var itemMap = {};
  
  for (var k = 1; k < iData.length; k++) {
    var iCode = String(iData[k][0]); // A열: 코드
    
    // ★ 여기서 정보를 가져옵니다
    itemMap[iCode] = {
      spec: iData[k][3], // D열: 규격 (인덱스 3)
      cost: Number(iData[k][5]) || 0 // F열: 원가 (인덱스 5)
    };
  }

  var d = s.getDataRange().getValues();
  var list = [];
  var tz = ss.getSpreadsheetTimeZone();

  for (var i = d.length - 1; i >= 1; i--) {
    // 입고(Inbound) 데이터만 골라내기
    if (String(d[i][7]) !== "Inbound") continue;
    
    var rowDateVal = d[i][5];
    if (!rowDateVal) continue;
    var rowDateStr = Utilities.formatDate(new Date(rowDateVal), tz, "yyyy-MM-dd");
    
    // 날짜 필터
    if (rowDateStr < startStr || rowDateStr > endStr) continue;
    
    // 거래처 필터
    var rowVendor = String(d[i][6]);
    if (vendorFilter && vendorFilter !== "All" && vendorFilter !== "전체 매입처" && rowVendor !== vendorFilter) continue;

    var code = String(d[i][1]);
    var qty = Number(d[i][4]);
    
    // ★ 품목 시트 정보 가져오기 (없으면 빈칸/0)
    var info = itemMap[code] || { spec: "-", cost: 0 };

    list.push({
      date: rowDateStr,
      vendor: rowVendor,
      name: d[i][2],
      spec: info.spec,        // ★ 품목 시트의 D열(규격) 표시
      qty: qty,
      amount: info.cost * qty // ★ 품목 시트의 F열(원가) x 수량
    });
    
    if (list.length >= 300) break;
  }
  return list;
}

/* [Code.gs] 출고 내역 통합 조회 (규격 + 금액 + 인보이스번호 포함). Outbound / ForceOut / ForcePush 모두 포함 */
function getCombinedOutboundHistory(startStr, endStr, vendorFilter, typeFilter) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("재고");
  var itemSheet = ss.getSheetByName("품목");
  if (!sheet || !itemSheet) return [];

  var iData = itemSheet.getDataRange().getValues();
  var itemMap = {};
  for (var k = 1; k < iData.length; k++) {
    var iCode = String(iData[k][0]);
    itemMap[iCode] = { spec: iData[k][3], price: Number(iData[k][4]) || 0 };
  }

  var data = sheet.getDataRange().getValues();
  var list = [];
  var tz = ss.getSpreadsheetTimeZone();

  for (var i = data.length - 1; i >= 1; i--) {
    var type = String(data[i][7]);
    if (type !== "Outbound" && type !== "ForceOut" && type !== "ForcePush") continue;

    var rowDate = data[i][5];
    if (!rowDate) continue;
    var dateStr = Utilities.formatDate(new Date(rowDate), tz, "yyyy-MM-dd");
    if (dateStr < startStr || dateStr > endStr) continue;

    var target = "";
    if (type === "Outbound") target = String(data[i][6]).replace(/^To\s+/i, "").trim() || String(data[i][6]);
    else target = String(data[i][0]); // ForcePush: 매장(수신처)은 A열
    if (!target) target = String(data[i][6]);
    if (vendorFilter && vendorFilter !== "All" && vendorFilter !== "전체" && vendorFilter !== "전체 매출처" && target !== vendorFilter) continue;

    var displayType = (type === "Outbound") ? "주문승인" : "강제출고";
    var filterTypeVal = (type === "Outbound") ? "Order" : "Force";
    if (typeFilter && typeFilter !== "All" && typeFilter !== filterTypeVal) continue;

    var code = String(data[i][1]);
    var qty = Number(data[i][4]);
    var info = itemMap[code] || { spec: "-", price: 0 };
    var invoiceNo = (data[i].length > 8 && data[i][8]) ? String(data[i][8]).trim() : "";

    list.push({
      date: dateStr,
      target: target,
      type: displayType,
      name: data[i][2],
      code: code,
      spec: info.spec,
      qty: qty,
      amount: info.price * qty,
      invoiceNo: invoiceNo
    });

    if (list.length >= 500) break;
  }
  return list;
}

/* [Code.gs] 재고 조정 내역 조회 (규격 포함) */
function getAdjustmentHistory(startStr, endStr, storeFilter) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("재고");
  var itemSheet = ss.getSheetByName("품목");
  if (!sheet || !itemSheet) return [];

  // 1. 품목 규격 지도 만들기
  var iData = itemSheet.getDataRange().getValues();
  var specMap = {};
  for (var k = 1; k < iData.length; k++) {
    specMap[String(iData[k][0])] = iData[k][3]; // D열: 규격
  }

  var data = sheet.getDataRange().getValues();
  var list = [];
  var tz = ss.getSpreadsheetTimeZone();

  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][7]) !== "Adjustment") continue;

    var rowDate = data[i][5];
    if (!rowDate) continue;
    var dateStr = Utilities.formatDate(new Date(rowDate), tz, "yyyy-MM-dd");

    if (dateStr < startStr || dateStr > endStr) continue;

    var store = String(data[i][0]);
    if (storeFilter && storeFilter !== "All" && store !== storeFilter) continue;

    var code = String(data[i][1]);
    var spec = specMap[code] || "-"; // ★ 규격 찾기

    list.push({
      date: dateStr,
      store: store,
      item: data[i][2], // 품목명
      spec: spec,       // ★ 규격 추가
      diff: data[i][4], // 차이(수량)
      reason: data[i][6] // 사유
    });

    if (list.length >= 300) break;
  }
  return list;
}

function getVendorStats(vendorName) { var ss = SpreadsheetApp.getActiveSpreadsheet(); var stockSheet = ss.getSheetByName("재고"); var itemSheet = ss.getSheetByName("품목"); var itemCost = {}; if(itemSheet) { var iData = itemSheet.getRange(2, 1, itemSheet.getLastRow()-1, 6).getValues(); iData.forEach(r => { itemCost[r[0]] = Number(r[5]) || 0; }); } var logs = stockSheet.getDataRange().getValues(); var stats = { monthly: {}, total: 0, lastDate: "-" }; for(var i=1; i<logs.length; i++) { var type = logs[i][7]; var logVendor = logs[i][6]; if (type === "Inbound" && logVendor === vendorName) { var date = new Date(logs[i][5]); var code = logs[i][1]; var qty = Number(logs[i][4]); var cost = itemCost[code] || 0; var amount = qty * cost; stats.total += amount; var ym = Utilities.formatDate(date, "GMT+7", "yyyy-MM"); stats.monthly[ym] = (stats.monthly[ym] || 0) + amount; var dateStr = Utilities.formatDate(date, "GMT+7", "yyyy-MM-dd"); if (stats.lastDate === "-" || dateStr > stats.lastDate) { stats.lastDate = dateStr; } } } return stats; }

function getMyOrderHistory(store, startStr, endStr) {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("주문"); if (!s) return []; var d = s.getDataRange().getValues(); var list = [];
  var startDate = new Date(startStr); startDate.setHours(0,0,0,0); var endDate = new Date(endStr); endDate.setHours(23,59,59,999);
  for (var i = d.length - 1; i >= 1; i--) {
    if (String(d[i][1]) !== String(store)) continue;
    var rowDate = new Date(d[i][0]);
    if (rowDate >= startDate && rowDate <= endDate) {
      var cart = []; try { cart = JSON.parse(d[i][3]); } catch(e) { cart = []; }
      var summary = cart.length > 0 ? cart[0].name + (cart.length>1 ? " 외 " + (cart.length-1) + "건" : "") : "Items";
      list.push({ id: i + 1, date: Utilities.formatDate(rowDate, "GMT+7", "yyyy-MM-dd"), summary: summary, total: d[i][6], status: d[i][7], items: cart });
    }
    if (list.length >= 100) break;
  }
  return list;
}
function getMyUsageHistory(store, startStr, endStr) {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("재고"); if (!s) return []; var d = s.getDataRange().getValues(); var list = [];
  var startDate = new Date(startStr); startDate.setHours(0,0,0,0); var endDate = new Date(endStr); endDate.setHours(23,59,59,999);
  for (var i = d.length - 1; i >= 1; i--) {
    if (String(d[i][0]) == String(store) && d[i][7] == "Usage") {
      var rowDate = new Date(d[i][5]);
      if (rowDate >= startDate && rowDate <= endDate) {
        list.push({ date: Utilities.formatDate(rowDate, "GMT+7", "yyyy-MM-dd"), item: d[i][2], qty: Math.abs(d[i][4]) });
      }
    }
    if (list.length >= 200) break;
  }
  return list;
}

/* [Code.gs] 재고 조정 실행 (최종 통합본 - 하나만 있어야 함!) */
function adjustStockBatch(list, role) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("재고"); 
  if (!sheet) return "❌ '재고' 시트가 없습니다.";

  var data = sheet.getDataRange().getValues();
  var codeMap = {};
  
  // 코드 위치 매핑 (공백 제거하여 정확도 향상)
  for (var i = 1; i < data.length; i++) {
    var code = String(data[i][1]).trim(); 
    if(code) codeMap[code] = i + 1; 
  }

  try {
    list.forEach(function(item) {
      // 1. 숫자 변환 (쉼표 제거 및 안전장치)
      var valNew = parseFloat(String(item.newQty).replace(/,/g, '')) || 0;
      var valCur = parseFloat(String(item.curQty).replace(/,/g, '')) || 0;
      var diff = valNew - valCur;

      // 2. 날짜 처리 (입력된 날짜가 있으면 쓰고, 없으면 오늘 날짜)
      var adjDate = item.date ? new Date(item.date) : new Date();

      // 3. 현재고 업데이트 (가장 중요!)
      var targetCode = String(item.code).trim();
      var row = codeMap[targetCode];
      
      if (row) {
        // E열(5번째)에 실재고 덮어쓰기
        sheet.getRange(row, 5).setValue(valNew); 
      }

      // 4. 이력 남기기 (맨 아래줄 추가)
      sheet.appendRow([
        item.store,       // A: 매장
        item.code,        // B: 코드
        item.name,        // C: 품목
        "",               // D: 규격
        diff,             // E: 차이
        adjDate,          // F: 날짜
        item.reason,      // G: 사유
        "Adjustment"      // H: 구분
      ]);
    });
    
    return "✅ 재고 조정 및 반영 완료!";
    
  } catch (e) {
    return "❌ 서버 에러: " + e.message;
  }
}

/* [Code.gs] 수정: 강제출고 + 주문승인 내역 통합 조회 */
function getForceOutboundHistory(startStr, endStr, vendorFilter) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName("재고");
  if (!s) return [];
  
  var d = s.getDataRange().getValues();
  var list = [];
  var startDate = new Date(startStr); startDate.setHours(0,0,0,0);
  var endDate = new Date(endStr); endDate.setHours(23,59,59,999);
  
  // 최신순(역순) 탐색
  for (var i = d.length - 1; i >= 1; i--) {
    var rowDate = new Date(d[i][5]); // F열
    var type = String(d[i][7]);      // H열 (구분)
    
    if (isNaN(rowDate.getTime())) continue;

    // [수정 포인트] 날짜 범위 안이고, 강제출고(Force) 또는 주문승인(Outbound)인 경우
    if (rowDate >= startDate && rowDate <= endDate) {
      if (type === "ForceOut" || type === "ForcePush" || type === "Outbound") {
        
        var targetName = String(d[i][6]).replace("To ", ""); // 비고에서 매장명 추출
        
        // 필터링
        if (vendorFilter && vendorFilter !== "All" && vendorFilter !== "전체 매출처" && targetName !== vendorFilter) continue;
        
        // 유형 이름표 붙이기
        var typeName = (type === "Outbound") ? "✅주문승인" : "⚡강제출고";

        list.push({
          date: Utilities.formatDate(rowDate, "GMT+7", "yyyy-MM-dd"),
          type: typeName, // 유형 추가
          target: targetName,
          name: d[i][2],
          qty: Math.abs(d[i][4])
        });
      }
    }
    if (list.length >= 300) break;
  }
  return list;
}
/* [Code.gs] 출고 대상 목록 통합 (판매처 + K열 매장명) */
function getAllOutboundTargets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName("거래처"); 
  var list = [];
  
  if (s) {
    var d = s.getDataRange().getValues();
    
    // 1행(헤더) 제외하고 검색
    for (var i = 1; i < d.length; i++) {
      
      // 1. 거래처 중 A열이 '판매처'인 것만 가져오기
      var type = String(d[i][0]).trim();     // A열: 구분
      var vendorName = String(d[i][2]).trim(); // C열: 회사명
      
      if (type === "판매처" && vendorName) {
        if (list.indexOf(vendorName) === -1) {
          list.push(vendorName);
        }
      }
    }
  }
  
  return list.sort(); // 가나다순 정렬
}

