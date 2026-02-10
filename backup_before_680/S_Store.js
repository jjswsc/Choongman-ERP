/* =================================================================
   매장 관리: 매장점검, 시간표
   ================================================================= */

/* =================================================================
   매장점검
   ================================================================= */   

/* 1. 점검 항목 가져오기 */
function getChecklistItems(activeOnly) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("점검항목");
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var list = [];
  for(var i=1; i<data.length; i++) {
    var use = data[i][4]; // E열
    if(activeOnly && use !== true) continue;
    list.push({
      id: data[i][0], main: data[i][1], sub: data[i][2], name: data[i][3], use: use
    });
  }
  return list;
}

/* [수정] 점검 결과 저장 (기존 ID가 있으면 덮어쓰기 = 수정) */
function saveCheckResult(id, date, store, inspector, summary, memo, jsonData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("점검결과");
  
  if(!sheet) return "ERROR: 시트 없음";
  
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;

  // 1. 수정 모드인지 확인 (ID가 넘어왔고, 시트에 그 ID가 있는지 검색)
  if(id) {
    for(var i=1; i<data.length; i++) {
      if(String(data[i][0]) === String(id)) { // A열(ID) 비교
        rowIndex = i + 1; // 엑셀은 1부터 시작하므로 +1
        break;
      }
    }
  }

  // 2. 없으면 새로 생성 (신규 저장)
  if(rowIndex === -1) {
    // 새 ID 생성 (날짜_매장명_시간)
    var newId = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMddHHmmss") + "_" + store;
    sheet.appendRow([newId, date, store, inspector, summary, memo, jsonData]);
    return "SAVED";
  } else {
    // 3. 있으면 덮어쓰기 (수정 저장)
    // A열(ID)은 그대로 두고, B열부터 G열까지 업데이트
    sheet.getRange(rowIndex, 2).setValue(date);      // B: 날짜
    sheet.getRange(rowIndex, 3).setValue(store);     // C: 매장
    sheet.getRange(rowIndex, 4).setValue(inspector); // D: 점검자
    sheet.getRange(rowIndex, 5).setValue(summary);   // E: 결과
    sheet.getRange(rowIndex, 6).setValue(memo);      // F: 메모
    sheet.getRange(rowIndex, 7).setValue(jsonData);  // G: 데이터
    return "UPDATED";
  }
}

/* [신규] 점검 이력 삭제 함수 */
function deleteCheckHistory(id) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("점검결과");
  var data = sheet.getDataRange().getValues();
  
  for(var i=1; i<data.length; i++) {
    if(String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1); // 해당 줄 삭제
      return "DELETED";
    }
  }
  return "NOT_FOUND";
}

/* [수정] 점검 이력 조회 (점검자 검색 필터 추가) */
function getCheckHistory(startStr, endStr, filterStore, filterInspector) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("점검결과");
  if(!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  var result = [];
  var start = startStr ? new Date(startStr) : new Date('2000-01-01');
  var end = endStr ? new Date(endStr) : new Date('2100-12-31');
  end.setHours(23,59,59);

  // 검색어 소문자 변환 (부분 일치 검색을 위해)
  var searchName = filterInspector ? String(filterInspector).toLowerCase().trim() : "";

  // 최신순 정렬을 위해 뒤에서부터 읽기
  for(var i=data.length-1; i>=1; i--) {
    var rowDate = new Date(data[i][1]); // B열: 날짜
    var rowStore = String(data[i][2]);  // C열: 매장
    var rowInspector = String(data[i][3]); // D열: 점검자
    
    // 1. 날짜 범위 확인
    if(rowDate >= start && rowDate <= end) {
      
      // 2. 매장 필터 확인
      var matchStore = (filterStore === 'All' || filterStore === rowStore);
      
      // 3. 점검자 이름 확인 (검색어가 있으면 포함 여부 확인)
      var matchName = true;
      if(searchName !== "") {
         matchName = rowInspector.toLowerCase().includes(searchName);
      }

      if(matchStore && matchName) {
        result.push({
          id: data[i][0], 
          date: Utilities.formatDate(rowDate, "GMT+7", "yyyy-MM-dd"),
          store: rowStore,
          inspector: rowInspector, 
          result: data[i][4],    
          json: data[i][6]       
        });
      }
    }
  }
  return result;
}

/* 4. 항목 설정 업데이트 */
function updateChecklistItems(updates) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("점검항목");
  var data = sheet.getDataRange().getValues();
  updates.forEach(up => {
    for(var i=1; i<data.length; i++) {
      if(String(data[i][0]) === String(up.id)) {
        sheet.getRange(i+1, 4).setValue(up.name); // D열 이름 수정
        sheet.getRange(i+1, 5).setValue(up.use);  // E열 사용여부 수정
        break;
      }
    }
  });
  return "SUCCESS";
}
