/**
 * [최종 통합 및 시간오류 해결] 매장 방문 데이터 기록 함수
 * 1. 시트 타임존 자동 동기화 (시간 오차 해결)
 * 2. K열 기준 GPS 검증 유지
 * 3. 정밀 시간 계산 및 서식 강제 지정
 */
function submitStoreVisit(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone(); // ✅ 시트의 시간 설정을 그대로 가져옴 (오차 해결 핵심)
  var sheet = ss.getSheetByName("매장방문_DB");
  
  // [1] 시트 자동 생성 및 헤더 설정
  if (!sheet) {
    sheet = ss.insertSheet("매장방문_DB");
    sheet.appendRow(["ID", "날짜", "이름", "방문매장", "구분", "목적", "시간", "위도(Lat)", "경도(Lng)", "체류시간(분)", "비고"]);
    sheet.getRange("A1:K1").setBackground("#E3F2FD").setFontWeight("bold").setHorizontalAlignment("center");
    sheet.setFrozenRows(1);
  }

  // [2] GPS 위치 검증 (K열 매장명 기준 - 기존 로직 100% 유지)
  var vendorSheet = ss.getSheetByName("거래처");
  if (vendorSheet) {
    var vData = vendorSheet.getDataRange().getValues();
    var targetLat = 0, targetLng = 0, foundStore = false;
    for (var i = 1; i < vData.length; i++) {
      var storeNameInK = String(vData[i][10]).trim(); // K열 대조
      if (storeNameInK === String(data.storeName).trim()) {
        targetLat = Number(vData[i][11]); // L열 위도
        targetLng = Number(vData[i][12]); // M열 경도
        foundStore = true; break;
      }
    }
    if (foundStore && targetLat !== 0 && data.lat !== "Unknown") {
      var distance = calcDistance(targetLat, targetLng, data.lat, data.lng);
      if (distance > 100) {
        return { success: false, msg: "❌ 위치 부적합! 매장 근처(100m 이내)가 아닙니다.\n(현재 거리: " + Math.round(distance) + "m)" };
      }
    }
  }

  // [3] 현재 시각 설정 (시트 설정 타임존 적용)
  var now = new Date();
  var dateStr = Utilities.formatDate(now, tz, "yyyy-MM-dd");
  var timeStr = Utilities.formatDate(now, tz, "HH:mm:ss");
  
  try {
    var duration = "";
    
    // [4] 방문종료 시 체류 시간 정밀 계산
    if (data.type === '방문종료') {
      var rows = sheet.getDataRange().getValues();
      var searchName = String(data.userName).trim();
      var searchStore = String(data.storeName).trim();

      for (var j = rows.length - 1; j >= 1; j--) {
        if (String(rows[j][2]).trim() === searchName && 
            String(rows[j][3]).trim() === searchStore && 
            rows[j][4] === '방문시작') {
          
          var startDateVal = rows[j][1]; // B열: 날짜
          var startTimeVal = rows[j][6]; // G열: 시간
          
          // 시작 시각 객체 생성
          var startDateTime = new Date(startDateVal);

          // 시간 데이터 형식(객체/문자열)에 관계없이 정확히 시/분/초 추출
          if (startTimeVal instanceof Date) {
            startDateTime.setHours(startTimeVal.getHours(), startTimeVal.getMinutes(), startTimeVal.getSeconds());
          } else {
            var tParts = String(startTimeVal).split(":");
            if (tParts.length >= 2) {
              startDateTime.setHours(parseInt(tParts[0], 10), parseInt(tParts[1], 10), parseInt(tParts[2] || 0, 10));
            }
          }
          
          // 타임존 오차를 무시하는 절대 밀리초 차이 계산
          var diffMs = now.getTime() - startDateTime.getTime();
          
          // 계산 결과가 0보다 클 때만 분 단위 기록 (60초 미만은 0분)
          if (!isNaN(diffMs) && diffMs > 0) {
            duration = Math.floor(diffMs / (1000 * 60)); 
          } else {
            duration = 0; 
          }
          break;
        }
      }
    }

    // [5] 최종 데이터 기록
    sheet.appendRow([
      "V" + now.getTime(), dateStr, data.userName, data.storeName, 
      data.type, data.purpose, timeStr, data.lat, data.lng, duration, ""
    ]);

    // 체류시간 셀(J열) 서식을 숫자로 강제 지정
    sheet.getRange(sheet.getLastRow(), 10).setNumberFormat("0");

    return { 
      success: true, 
      msg: "✅ " + data.type + " 완료!" + (duration !== "" ? " (" + duration + "분 체류)" : "")
    };

  } catch (e) {
    return { success: false, msg: "❌ 서버 저장 오류: " + e.message };
  }
}

// [서버] 관리자용 방문 기록 조회 함수 - 날짜/매장/직원/부서(E열) 필터
function getStoreVisitHistory(start, end, store, employeeName, department) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("매장방문_DB");
  if (!sheet) return [];
  var tz = ss.getSpreadsheetTimeZone();
  var data = sheet.getDataRange().getValues();
  var result = [];
  var storeFilter = (store === "All" || store === "" || store == null) ? "All" : String(store).trim();
  var empFilter = (employeeName === "All" || employeeName === "" || employeeName == null) ? "All" : String(employeeName).trim();
  var deptFilter = (department === "All" || department === "" || department == null) ? null : String(department).trim();
  var namesInDept = (deptFilter && typeof getOfficeNamesByDept === "function") ? getOfficeNamesByDept(deptFilter) : [];
  var startStr = String(start || "").substring(0, 10);
  var endStr = String(end || "").substring(0, 10);
  for (var i = 1; i < data.length; i++) {
    var d = data[i];
    var rowDate = d[1];
    var rowDateStr = (rowDate instanceof Date)
      ? Utilities.formatDate(rowDate, tz, "yyyy-MM-dd")
      : String(rowDate).substring(0, 10);
    var matchDate = (rowDateStr >= startStr && rowDateStr <= endStr);
    var matchStore = (storeFilter === "All" || String(d[3] || "").trim() === storeFilter);
    var rowName = String(d[2] || "").trim();
    var matchEmp = (empFilter === "All" || rowName === empFilter);
    var matchDept = (!deptFilter || namesInDept.length === 0 || namesInDept.indexOf(rowName) >= 0);
    if (matchDate && matchStore && matchEmp && matchDept) {
      var dateDisplay = (rowDate instanceof Date)
        ? Utilities.formatDate(rowDate, tz, "yyyy-MM-dd")
        : rowDateStr;
      result.push({
        date: dateDisplay,
        name: d[2],
        store: d[3],
        type: d[4],
        purpose: d[5],
        duration: d[9]
      });
    }
  }
  return result;
}

/**
 * [서버] 매장 방문 통계 - 검색 기간 내 부서별/직원별/매장별 투입 시간(분) 집계
 * 직원정보 E열로 이름→부서 매핑 (오피스만)
 */
function getStoreVisitStats(startStr, endStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var visitSheet = ss.getSheetByName("매장방문_DB");
  if (!visitSheet) return { byDept: [], byEmployee: [], byStore: [] };
  var tz = ss.getSpreadsheetTimeZone();
  var visitData = visitSheet.getDataRange().getValues();
  startStr = String(startStr || "").substring(0, 10);
  endStr = String(endStr || "").substring(0, 10);

  // 이름 → 부서(E열) 매핑 (직원정보, 오피스만)
  var nameToDept = {};
  var empSheet = ss.getSheetByName("직원정보");
  if (empSheet) {
    var empData = empSheet.getDataRange().getValues();
    for (var i = 1; i < empData.length; i++) {
      var rowType = String(empData[i][0] || "");
      var rowFullName = String(empData[i][1] || "").trim();
      var rowNickName = String(empData[i][2] || "").trim();
      var rowDept = String(empData[i][4] || "").trim();
      if (rowDept === "") rowDept = "Staff";
      if (rowType.toLowerCase().indexOf("office") === -1) continue;
      var nameToShow = (rowNickName !== "") ? rowNickName : rowFullName;
      if (nameToShow) nameToDept[nameToShow] = rowDept;
    }
  }

  var byDeptMap = {};
  var byEmployeeMap = {};
  var byStoreMap = {};

  for (var i = 1; i < visitData.length; i++) {
    var d = visitData[i];
    var rowDate = d[1];
    var rowDateStr = (rowDate instanceof Date)
      ? Utilities.formatDate(rowDate, tz, "yyyy-MM-dd")
      : String(rowDate).substring(0, 10);
    if (rowDateStr < startStr || rowDateStr > endStr) continue;
    var duration = Number(d[9]) || 0;
    if (duration <= 0) continue;
    var name = String(d[2] || "").trim();
    var store = String(d[3] || "").trim();
    var dept = nameToDept[name] || "기타";
    byEmployeeMap[name] = (byEmployeeMap[name] || 0) + duration;
    byStoreMap[store] = (byStoreMap[store] || 0) + duration;
    byDeptMap[dept] = (byDeptMap[dept] || 0) + duration;
  }

  var byDept = [];
  for (var k in byDeptMap) byDept.push({ label: k, minutes: byDeptMap[k] });
  byDept.sort(function(a, b) { return b.minutes - a.minutes; });
  var byEmployee = [];
  for (var k in byEmployeeMap) byEmployee.push({ label: k, minutes: byEmployeeMap[k] });
  byEmployee.sort(function(a, b) { return b.minutes - a.minutes; });
  var byStore = [];
  for (var k in byStoreMap) byStore.push({ label: k, minutes: byStoreMap[k] });
  byStore.sort(function(a, b) { return b.minutes - a.minutes; });

  return { byDept: byDept, byEmployee: byEmployee, byStore: byStore };
}

/**
 * 특정 유저의 현재 방문 진행 상태 확인
 */
function checkUserVisitStatus(userName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("매장방문_DB");
  if (!sheet) return { active: false };
  
  var tz = ss.getSpreadsheetTimeZone();
  var data = sheet.getDataRange().getValues();
  var today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  
  // 가장 마지막 기록부터 거꾸로 확인
  for (var i = data.length - 1; i >= 1; i--) {
    var rowDateStr = (data[i][1] instanceof Date) ? Utilities.formatDate(data[i][1], tz, "yyyy-MM-dd") : String(data[i][1]).substring(0, 10);
    if (rowDateStr === today && data[i][2] === userName) {
      // 마지막 기록이 '방문시작'이면 아직 방문 중인 것임
      if (data[i][4] === '방문시작') {
        return { active: true, storeName: data[i][3], purpose: data[i][5] };
      } else if (data[i][4] === '방문종료') {
        return { active: false };
      }
    }
  }
  return { active: false };
}

/**
 * [서버] 오늘 내 방문 기록 가져오기 (시간 형식 및 체류시간 표시 버그 수정본)
 */
function getTodayMyVisits(userName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("매장방문_DB");
  if (!sheet) return [];

  var tz = ss.getSpreadsheetTimeZone(); // 기록(submitStoreVisit)과 동일한 시트 타임존 사용
  var data = sheet.getDataRange().getValues();
  var todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  var result = [];
  var searchName = String(userName || "").trim();

  for (var i = data.length - 1; i >= 1; i--) {
    var rowDate = data[i][1]; 
    var rowName = String(data[i][2] || "").trim();
    
    var rowDateStr = (rowDate instanceof Date) 
      ? Utilities.formatDate(rowDate, tz, "yyyy-MM-dd") 
      : String(rowDate).substring(0, 10);

    if (rowDateStr === todayStr && (rowName === searchName)) {
      // ✅ 시간 형식이 Date 객체일 경우 시트 타임존으로 "HH:mm:ss" 변환
      var formattedTime = data[i][6];
      if (formattedTime instanceof Date) {
        formattedTime = Utilities.formatDate(formattedTime, tz, "HH:mm:ss");
      }

      result.push({
        time: String(formattedTime), // 깔끔한 시간 문자열
        store: data[i][3],           // 매장명
        type: data[i][4],            // 방문시작/종료
        duration: data[i][9]         // 체류시간 (숫자)
      });
    }
    if (result.length >= 20) break;
  }
  return result;
}