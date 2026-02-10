/* =================================================================
   인사 관리: 직원, 급여, 휴가, 근태
   ================================================================= */

   /* =================================================================
   직원/급여
   ================================================================= */

   /* [F] 직원 관리 */
function getAdminEmployeeList(userStore, userRole) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(); var s = ss.getSheetByName("직원정보") || ss.getSheetByName("Users"); if (!s) return []; var d = s.getDataRange().getValues(); var list = [];
  var role = String(userRole).toLowerCase();
  for (var i = 1; i < d.length; i++) {
    if (d[i][0] && d[i][1]) {
      var empStore = String(d[i][0]).trim();
      var include = false;
      if (role.includes('director')) include = true;
      else if (role.includes('officer')) { if (empStore !== '본사' && empStore !== 'Office') include = true; }
      else { if (empStore === userStore) include = true; }
      
      if (include) {
        list.push({ 
          row: i + 1, store: empStore, name: d[i][1], nick: d[i][2] || "", phone: d[i][3] || "", job: d[i][4] || "", 
          birth: d[i][5] ? Utilities.formatDate(new Date(d[i][5]), "GMT+7", "yyyy-MM-dd") : "", nation: d[i][6] || "", 
          join: d[i][7] ? Utilities.formatDate(new Date(d[i][7]), "GMT+7", "yyyy-MM-dd") : "", resign: d[i][8] ? Utilities.formatDate(new Date(d[i][8]), "GMT+7", "yyyy-MM-dd") : "", 
          salType: d[i][9] || "Monthly", salAmt: d[i][10] || 0, pw: d[i][11], role: d[i][12] || "Staff", email: d[i][13] || "", photo: (d[i][14] != null && d[i][14] !== "") ? String(d[i][14]).trim() : ""
        }); 
      }
    }
  } return list;
}

/** 직원별 최신 평가 등급 (주방+서비스 결과 시트에서 매장+이름 기준 최신 1건). 직원정보의 이름/닉네임 모두 매칭되도록 보강 */
function getEmployeeLatestGrades() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = {};
  ["kitchen", "service"].forEach(function(type) {
    var sheetName = EVAL_SHEET_RESULT[type] || "평가결과_주방";
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var store = String(row[2] || "").trim().replace(/\s+/g, " ");
      var name = String(row[3] || "").trim().replace(/\s+/g, " ");
      var grade = row[5] ? String(row[5]).trim() : "";
      var dateVal = row[1];
      if (!store || !name) continue;
      var key = store + "|" + name;
      var existing = out[key];
      if (!existing || !existing.date || (dateVal && new Date(dateVal) > new Date(existing.date)))
        out[key] = { grade: grade, date: dateVal ? (dateVal instanceof Date ? dateVal : new Date(dateVal)) : null };
    }
  });
  // 직원정보에서 이름↔닉네임 매핑으로 store|닉네임 키도 동일 등급 부여 (목록에서 닉네임으로 검색해도 매칭되도록)
  var empSheet = ss.getSheetByName("직원정보") || ss.getSheetByName("Users");
  if (empSheet) {
    var empData = empSheet.getDataRange().getValues();
    for (var e = 1; e < empData.length; e++) {
      var empStore = String(empData[e][0] || "").trim().replace(/\s+/g, " ");
      var empName = String(empData[e][1] || "").trim().replace(/\s+/g, " ");
      var empNick = String(empData[e][2] || "").trim().replace(/\s+/g, " ");
      if (!empStore || !empName) continue;
      var keyName = empStore + "|" + empName;
      var keyNick = empNick && empNick !== empName ? empStore + "|" + empNick : "";
      var info = out[keyName];
      if (info && keyNick && !out[keyNick]) out[keyNick] = info;
    }
  }
  return out;
}

function saveAdminEmployee(d, userStore, userRole) {
  var role = String(userRole || "").toLowerCase();
  var isTop = role.indexOf("director") !== -1 || role.indexOf("officer") !== -1 || role.indexOf("ceo") !== -1 || role.indexOf("hr") !== -1;
  if (!isTop && userStore) {
    var empStore = String(d.store || "").trim();
    if (empStore !== String(userStore).trim()) return "❌ 해당 매장 직원만 수정할 수 있습니다.";
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName("직원정보") || ss.getSheetByName("Users");
  if (!s) { ss.insertSheet("직원정보"); s = ss.getSheetByName("직원정보"); s.appendRow(["매장","이름","닉네임","연락처","직급","생일","국적","입사일","퇴사일","급여타입","급여액","비밀번호","권한","이메일","사진"]); }
  var rowData = [ d.store, d.name, d.nick, d.phone, d.job, d.birth, d.nation, d.join, d.resign, d.salType, d.salAmt, d.pw, d.role, d.email, (d.photo != null ? String(d.photo).trim() : "") ];
  if (Number(d.row) == 0) {
    s.appendRow(rowData);
    SpreadsheetApp.flush();
    return "✅ 신규 직원이 등록되었습니다.";
  } else {
    s.getRange(Number(d.row), 1, Number(d.row), 15).setValues([rowData]);
    SpreadsheetApp.flush();
    return "✅ 직원 정보가 수정되었습니다.";
  }
}

function deleteAdminEmployee(r, userStore, userRole) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName("직원정보") || ss.getSheetByName("Users");
  if (!s) return "❌ 직원정보 시트가 없습니다.";
  var role = String(userRole || "").toLowerCase();
  var isTop = role.indexOf("director") !== -1 || role.indexOf("officer") !== -1 || role.indexOf("ceo") !== -1 || role.indexOf("hr") !== -1;
  if (!isTop && userStore && r >= 2) {
    var rowData = s.getRange(r, 1, r, 1).getValues();
    var empStore = String((rowData[0] && rowData[0][0]) || "").trim();
    if (empStore !== String(userStore).trim()) return "❌ 해당 매장 직원만 삭제할 수 있습니다.";
  }
  s.deleteRow(r);
  return "삭제됨";
}

/* =================================================================
   직원 평가 (주방 / 서비스)
   ================================================================= */
var EVAL_SHEET_ITEMS = { kitchen: "평가항목_주방", service: "평가항목_서비스" };
var EVAL_SHEET_RESULT = { kitchen: "평가결과_주방", service: "평가결과_서비스" };

function ensureEvaluationSheets(type) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var itemsSheetName = EVAL_SHEET_ITEMS[type] || "평가항목_주방";
  var resultSheetName = EVAL_SHEET_RESULT[type] || "평가결과_주방";
  var itemsSheet = ss.getSheetByName(itemsSheetName);
  var resultSheet = ss.getSheetByName(resultSheetName);
  if (!itemsSheet) {
    itemsSheet = ss.insertSheet(itemsSheetName);
    itemsSheet.appendRow(["id", "대분류", "중분류", "평가 항목", "사용"]);
    if (type === "kitchen") {
      var defaults = [
        [1, "메뉴숙련", "Chicken", "Snow Onion Chicken", true],
        [2, "메뉴숙련", "Chicken", "Gochujang BBQ", true],
        [3, "메뉴숙련", "Korean", "Kimchi soup", true],
        [4, "메뉴숙련", "Salad", "Caesar Salad", true],
        [5, "메뉴숙련", "Side Menu", "Cajun Fried", true],
        [6, "메뉴숙련", "Chicken Rice", "Snow Chicken rice", true],
        [7, "원가정확도", "", "Sauce Portion / 소스 양 준수", true],
        [8, "원가정확도", "", "Control Compliance / 규정 준수", true],
        [9, "원가정확도", "", "No Excessive Sauce Usage / 과다 소스 사용 금지", true],
        [10, "원가정확도", "", "Accurate Frying Time & Sauce Separation", true],
        [11, "원가정확도", "", "Minimization of Waste & Error", true],
        [12, "원가정확도", "", "FIFO (First In, First Out)", true],
        [13, "위생", "", "Hand Washing & Proper Use of Gloves", true],
        [14, "위생", "", "Workstation & Floor", true],
        [15, "위생", "", "Knife & Cutting Board", true],
        [16, "위생", "", "Personal Hygiene (Uniform / Hat / Hair / Nail)", true],
        [17, "위생", "", "Storage & Refrigeration Temperature Control", true],
        [18, "태도", "", "Understanding of Instructions & Response", true],
        [19, "태도", "", "Speed", true],
        [20, "태도", "", "Receptiveness to Feedback", true],
        [21, "태도", "", "Composure During Peak", true],
        [22, "태도", "", "Teamwork & Communication", true],
        [23, "태도", "", "Sense of Responsibility (Closing / Cleaning / Inventory)", true]
      ];
      defaults.forEach(function(row) { itemsSheet.appendRow(row); });
    }
    if (type === "service") {
      var serviceDefaults = [
        [1, "서비스", "", "인사/웰컴", true],
        [2, "서비스", "", "주문 정확도", true],
        [3, "서비스", "", "서빙 속도·품질", true],
        [4, "서비스", "", "클린·정리", true],
        [5, "서비스", "", "팀워크·소통", true],
        [6, "서비스", "", "피크타임 대응", true]
      ];
      serviceDefaults.forEach(function(row) { itemsSheet.appendRow(row); });
    }
  }
  if (!resultSheet) {
    resultSheet = ss.insertSheet(resultSheetName);
    resultSheet.appendRow(["id", "날짜", "매장", "직원명", "평가자", "최종등급", "총평", "상세JSON"]);
  }
}

function getEvaluationItems(type, activeOnly) {
  var sheetName = EVAL_SHEET_ITEMS[type] || "평가항목_주방";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    ensureEvaluationSheets(type);
    SpreadsheetApp.flush();
    sheet = ss.getSheetByName(sheetName);
  }
  if (!sheet) return [];
  SpreadsheetApp.flush();
  var data = sheet.getDataRange().getValues();
  var list = [];
  var activeVals = [true, "TRUE", "true", "1", "예", "Y", "y", "yes", "YES", "O", "o", "○", "✓"];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var use = row[4];
    if (activeOnly) {
      var useStr = (use != null && typeof use === "string") ? use.trim() : "";
      var isActive = use === true || use === 1 || (useStr && activeVals.indexOf(useStr) !== -1);
      if (!isActive) continue;
    }
    list.push({
      id: row[0],
      main: row[1] != null ? String(row[1]).trim() : "",
      sub: row[2] != null ? String(row[2]).trim() : "",
      name: row[3] != null ? String(row[3]).trim() : "",
      use: use
    });
  }
  return list;
}

function updateEvaluationItems(type, updates) {
  var sheetName = EVAL_SHEET_ITEMS[type] || "평가항목_주방";
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return "ERROR: 시트 없음";
  var data = sheet.getDataRange().getValues();
  updates.forEach(function(up) {
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(up.id)) {
        sheet.getRange(i + 1, 4).setValue(up.name);
        sheet.getRange(i + 1, 5).setValue(up.use);
        break;
      }
    }
  });
  return "SUCCESS";
}

function addEvaluationItem(type, mainCat, subCat, itemName) {
  var sheetName = EVAL_SHEET_ITEMS[type] || "평가항목_주방";
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) { ensureEvaluationSheets(type); sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName); }
  if (!sheet) return "ERROR: 시트 없음";
  var data = sheet.getDataRange().getValues();
  var nextId = 1;
  for (var i = 1; i < data.length; i++) {
    var id = Number(data[i][0]);
    if (!isNaN(id) && id >= nextId) nextId = id + 1;
  }
  sheet.appendRow([nextId, mainCat || "", subCat || "", itemName || "(새 항목)", true]);
  return "SUCCESS";
}

function deleteEvaluationItem(type, id) {
  var sheetName = EVAL_SHEET_ITEMS[type] || "평가항목_주방";
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return "ERROR: 시트 없음";
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return "SUCCESS";
    }
  }
  return "ERROR: 항목 없음";
}

function saveEvaluationResult(type, id, date, store, employeeName, evaluator, finalGrade, memo, jsonData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = EVAL_SHEET_RESULT[type] || "평가결과_주방";
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) { ensureEvaluationSheets(type); sheet = ss.getSheetByName(sheetName); }
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  if (id) {
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) { rowIndex = i + 1; break; }
    }
  }
  if (rowIndex === -1) {
    var newId = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMddHHmmss") + "_" + store + "_" + (employeeName || "").replace(/\s/g, "");
    sheet.appendRow([newId, date, store, employeeName, evaluator, finalGrade, memo, jsonData]);
    return "SAVED";
  } else {
    sheet.getRange(rowIndex, 2).setValue(date);
    sheet.getRange(rowIndex, 3).setValue(store);
    sheet.getRange(rowIndex, 4).setValue(employeeName);
    sheet.getRange(rowIndex, 5).setValue(evaluator);
    sheet.getRange(rowIndex, 6).setValue(finalGrade);
    sheet.getRange(rowIndex, 7).setValue(memo);
    sheet.getRange(rowIndex, 8).setValue(jsonData);
    return "UPDATED";
  }
}

/** 평가 이력 조회: 매장/직원/작성자/기간 필터. type이 "all"이면 주방+서비스 전체 조회. */
function getEvaluationHistory(type, startStr, endStr, filterStore, filterEmployee, filterEvaluator) {
  if (type === "all" || type === "All" || type === "") {
    var kitchenList = getEvaluationHistoryOne("kitchen", startStr, endStr, filterStore, filterEmployee, filterEvaluator);
    var serviceList = getEvaluationHistoryOne("service", startStr, endStr, filterStore, filterEmployee, filterEvaluator);
    var merged = (kitchenList || []).concat(serviceList || []);
    merged.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
    return merged;
  }
  return getEvaluationHistoryOne(type, startStr, endStr, filterStore, filterEmployee, filterEvaluator);
}

function getEvaluationHistoryOne(type, startStr, endStr, filterStore, filterEmployee, filterEvaluator) {
  var sheetName = EVAL_SHEET_RESULT[type] || "평가결과_주방";
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var list = [];
  var start = startStr ? new Date(startStr) : new Date(2000, 0, 1);
  var end = endStr ? new Date(endStr) : new Date(2100, 11, 31);
  end.setHours(23, 59, 59, 999);
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var dateVal = row[1];
    var store = String(row[2] || "").trim();
    var employee = String(row[3] || "").trim();
    var evaluator = String(row[4] || "").trim();
    if (!dateVal) continue;
    var d = new Date(dateVal);
    if (d < start || d > end) continue;
    if (filterStore && filterStore !== "All" && store !== filterStore) continue;
    if (filterEmployee && filterEmployee !== "All" && filterEmployee !== "" && employee !== filterEmployee) continue;
    if (filterEvaluator && filterEvaluator !== "All" && filterEvaluator !== "" && evaluator !== filterEvaluator) continue;
    var grade = row[5] || "";
    var memo = row[6] || "";
    var jsonData = row[7];
    var totalScore = "";
    if (jsonData) {
      try {
        var parsed = typeof jsonData === "string" ? JSON.parse(jsonData) : jsonData;
        if (parsed && parsed.totalScore != null) totalScore = String(parsed.totalScore);
      } catch (e) {}
    }
    list.push({
      id: String(row[0] || ""),
      date: dateVal instanceof Date ? Utilities.formatDate(dateVal, "GMT+7", "yyyy-MM-dd") : String(dateVal).substring(0, 10),
      store: store,
      employeeName: employee,
      evaluator: evaluator,
      finalGrade: grade,
      totalScore: totalScore,
      memo: memo,
      jsonData: jsonData
    });
  }
  list.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
  return list;
}

/* [1단계] 직원정보 시트에 급여 관련 3칸(은행,계좌,수당) 추가하기 */
function addSalaryColumns() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("직원정보");
  
  // 이미 추가됐는지 확인 (P1 셀이 '은행명'이면 중단)
  if (sheet.getRange("P1").getValue() === "은행명") {
    return "✅ 이미 준비되어 있습니다. 다음 단계로 넘어가세요!";
  }

  // P1, Q1, R1 셀에 제목 쓰기
  sheet.getRange("P1").setValue("은행명");      // Bank Name
  sheet.getRange("Q1").setValue("계좌번호");    // Account No
  sheet.getRange("R1").setValue("직책수당");    // Position Allowance

  // E1 셀 제목을 '부서'로 명확하게 변경
  sheet.getRange("E1").setValue("부서");

  return "✅ 1단계 완료! P, Q, R열이 생겼습니다.";
}

/* 1. [초기화] 급여_DB 시트 생성 (버튼 누르면 실행) */
function setupPayrollDB() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("급여_DB");
  
  if (sheet) return "✅ 이미 [급여_DB] 시트가 존재합니다.";
  
  sheet = ss.insertSheet("급여_DB");
  var headers = [
    "ID", "귀속월", "매장", "이름", "부서", "직급",
    "기본급", "직책수당", "위험수당", "생일수당", "공휴일수당", "특별보너스(수기)",
    "OT_1.5(시간)", "OT_2.0(시간)", "OT_3.0(시간)", "OT_합계금액",
    "지각(분)", "지각공제", "SSO(사회보험)", "세금", "기타공제(수기)",
    "실수령액", "상태"
  ];
  
  // 헤더 스타일 적용
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setBackground("#4c4c4c").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
  sheet.setFrozenRows(1); 
  
  return "✅ [급여_DB] 시트가 생성되었습니다! 이제 데이터가 이곳에 쌓입니다.";
}

/* 급여 계산용 매장 목록 (직원정보 A열 유일값). userRole이 C.E.O/HR이 아니면 Office/본사/오피스 제외 */
function getPayrollStoreList(userRole) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName("직원정보");
  if (!s) return [];
  var data = s.getDataRange().getValues();
  var set = {};
  for (var i = 1; i < data.length; i++) {
    var st = String(data[i][0] || "").trim();
    if (st) set[st] = true;
  }
  var list = Object.keys(set);
  // 직원 시트 E열(직급): Director, HR → Office 포함 전체 조회 가능
  var roleStr = (userRole != null && userRole !== undefined) ? String(userRole).trim().toUpperCase() : "";
  var canSeeOffice = (roleStr === "C.E.O" || roleStr === "CEO" || roleStr === "HR" || roleStr === "DIRECTOR");
  if (!canSeeOffice) {
    list = list.filter(function(st) {
      var lower = st.toLowerCase();
      return st !== "Office" && st !== "오피스" && st !== "본사" && lower !== "office";
    });
  }
  list.sort(function(a, b) {
    if (a === "Office" || a === "본사" || a === "오피스") return -1;
    if (b === "Office" || b === "본사" || b === "오피스") return 1;
    return a.localeCompare(b);
  });
  return list;
}

/** 직원시간표에서 해당 월·매장·이름의 계획 근무시간 합계(분) 반환. OT 시급 = 급여/이 시간 */
function getPlannedMinutesForMonth(monthStr, store, name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("직원시간표");
  if (!sheet) return 0;
  var tz = ss.getSpreadsheetTimeZone() || "Asia/Bangkok";
  var startStr = monthStr + "-01";
  var firstDay = new Date(monthStr + "-01");
  var lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0);
  var endStr = Utilities.formatDate(lastDay, tz, "yyyy-MM-dd");
  var data = sheet.getDataRange().getValues();
  var totalMin = 0;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var rowDateStr = toAttendanceDateStr(row[0], tz);
    if (!rowDateStr || rowDateStr < startStr || rowDateStr > endStr) continue;
    if (String(row[1] || "").trim() !== String(store).trim() || String(row[2] || "").trim() !== String(name).trim()) continue;
    var planIn = row[3];
    var planOut = row[4];
    if (!planIn || !planOut) continue;
    var minIn = timeToMinutes(planIn, rowDateStr);
    var minOut = timeToMinutes(planOut, rowDateStr);
    if (minIn != null && minOut != null && minOut > minIn) totalMin += (minOut - minIn);
  }
  return totalMin;
}
function timeToMinutes(val, dateStr) {
  if (val instanceof Date) {
    var h = val.getHours(), m = val.getMinutes();
    return h * 60 + m;
  }
  if (typeof val === "number" && !isNaN(val)) {
    var totalMin = Math.round(val * 24 * 60);
    return totalMin % (24 * 60);
  }
  var s = String(val || "").trim();
  var m = s.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return null;
}

/** 근태기록에서 귀속월별 지각(분)·승인된 연장(분) 집계 (급여 자동 반영용)
 *  반환: { "매장_이름": { lateMin: N, otMin: N } }
 *  - 지각: 유형=출근인 행의 지각(분) 합계
 *  - 연장: 유형=퇴근이고 승인여부=승인/승인완료인 행의 연장(분) 합계 */
function getAttendanceSummaryForPayroll(monthStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("근태기록");
  if (!sheet) return {};
  var tz = ss.getSpreadsheetTimeZone() || "Asia/Bangkok";
  var startStr = monthStr + "-01";
  var firstDay = new Date(monthStr + "-01");
  var lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0);
  var endStr = Utilities.formatDate(lastDay, tz, "yyyy-MM-dd");

  var data = sheet.getDataRange().getValues();
  var map = {};
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var rowDateStr = toAttendanceDateStr(row[0], tz);
    if (!rowDateStr || rowDateStr < startStr || rowDateStr > endStr) continue;

    var store = String(row[1] || "").trim();
    var name = String(row[2] || "").trim();
    if (!store || !name) continue;
    var key = store + "_" + name;
    if (!map[key]) map[key] = { lateMin: 0, otMin: 0 };

    var type = String(row[3] || "").trim();
    var approval = String(row[13] || "").trim();
    var isApproved = (approval === "승인" || approval === "승인완료");

    if (type === "출근") {
      map[key].lateMin += Number(row[7]) || 0;
    } else if (type === "퇴근" && isApproved) {
      map[key].otMin += Number(row[9]) || 0;
    }
  }
  return map;
}

/* 급여 자동 반영 상수 (태국: 주 48시간 기준 → 월 208시간, 지각 공제 시급 = 월급/208) */
var LATE_DED_HOURS_BASE = 208;  // 태국 근로기준: 1주 48시간 → 48×52÷12 = 208시간/월
var OT_MULTIPLIER = 1.5;        // 연장 1.5배

/** 태국 SSO 기여금 상한·최대공제 (연도별). 반환: { ceiling, maxDed } */
function getSSOLimitsByYear(year) {
  var y = parseInt(year, 10) || new Date().getFullYear();
  if (y <= 2025) return { ceiling: 15000, maxDed: 750 };
  if (y <= 2028) return { ceiling: 17500, maxDed: 875 };
  if (y <= 2031) return { ceiling: 20000, maxDed: 1000 };
  return { ceiling: 23000, maxDed: 1150 };
}

/* ========== 태국 공휴일 (공휴일 근무 시 2배 = 일당 추가 지급) ========== */
/** [공휴일] 시트 생성 (헤더만, 기본 데이터 없음. [추가] 버튼으로 필요한 휴일만 입력) */
function setupPublicHolidaysSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("공휴일");
  if (sheet) return "✅ 이미 [공휴일] 시트가 있습니다. [추가]로 휴일을 넣거나 기존 행을 수정·삭제하세요.";
  sheet = ss.insertSheet("공휴일");
  sheet.getRange(1, 1, 1, 3).setValues([["연도", "날짜(yyyy-MM-dd)", "휴일명"]]);
  sheet.getRange(1, 1, 1, 3).setBackground("#E65100").setFontColor("white").setFontWeight("bold");
  sheet.setFrozenRows(1);
  return "✅ [공휴일] 시트를 생성했습니다. [추가] 버튼으로 필요한 공휴일만 하나씩 입력하세요.";
}

/** 해당 연도의 공휴일 목록 반환. 시트 없거나 비면 기본 고정일 반환. [{ date: "yyyy-MM-dd", name: "..." }] */
function getPublicHolidays(year) {
  var withRows = false;
  var res = getPublicHolidaysInternal(year, withRows);
  return res.list;
}

/** 연도별 공휴일 목록 + 시트 행 번호(수정/삭제용). { list: [{ date, name, rowIndex }] } */
function getPublicHolidaysWithRows(year) {
  return getPublicHolidaysInternal(year, true);
}

function getPublicHolidaysInternal(year, withRows) {
  var y = parseInt(year, 10) || new Date().getFullYear();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("공휴일");
  if (sheet && sheet.getLastRow() > 1) {
    var data = sheet.getRange(2, 1, sheet.getLastRow(), 3).getValues();
    var list = [];
    for (var i = 0; i < data.length; i++) {
      var rowYear = parseInt(String(data[i][0]).trim(), 10);
      if (rowYear !== y) continue;
      var d = String(data[i][1] || "").trim();
      if (d.length < 10) continue;
      var dateStr = (data[i][1] instanceof Date) ? Utilities.formatDate(data[i][1], ss.getSpreadsheetTimeZone() || "Asia/Bangkok", "yyyy-MM-dd") : d.substring(0, 10);
      var item = { date: dateStr, name: String(data[i][2] || "").trim() || "-" };
      if (withRows) item.rowIndex = i + 2;
      list.push(item);
    }
    if (list.length > 0) return { list: list };
  }
  var fixed = [
    { date: y + "-01-01", name: "New Year's Day" },
    { date: y + "-04-06", name: "Chakri Day" },
    { date: y + "-04-13", name: "Songkran" },
    { date: y + "-05-01", name: "Labour Day" },
    { date: y + "-05-04", name: "Coronation Day" },
    { date: y + "-08-12", name: "Queen's Birthday" },
    { date: y + "-10-13", name: "King Memorial Day" },
    { date: y + "-12-05", name: "King's Birthday" },
    { date: y + "-12-10", name: "Constitution Day" }
  ];
  return { list: fixed };
}

/** 공휴일 한 행 추가 (연도, 날짜, 휴일명) */
function addPublicHoliday(year, dateStr, name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("공휴일");
  if (!sheet) return "❌ [공휴일] 시트가 없습니다. 먼저 '공휴일 시트 생성/초기화'를 실행하세요.";
  var y = parseInt(year, 10);
  var d = String(dateStr || "").trim().substring(0, 10);
  var n = String(name || "").trim() || "-";
  if (!d || d.length < 10) return "❌ 날짜를 yyyy-MM-dd 형식으로 입력해주세요.";
  sheet.appendRow([y, d, n]);
  return "✅ 공휴일이 추가되었습니다.";
}

/** 공휴일 한 행 수정 (시트 행 번호, 연도, 날짜, 휴일명) */
function updatePublicHoliday(rowIndex, year, dateStr, name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("공휴일");
  if (!sheet) return "❌ [공휴일] 시트가 없습니다.";
  var row = parseInt(rowIndex, 10);
  if (row < 2 || row > sheet.getLastRow()) return "❌ 잘못된 행 번호입니다.";
  var y = parseInt(year, 10);
  var d = String(dateStr || "").trim().substring(0, 10);
  var n = String(name || "").trim() || "-";
  if (!d || d.length < 10) return "❌ 날짜를 yyyy-MM-dd 형식으로 입력해주세요.";
  sheet.getRange(row, 1, row, 3).setValues([[y, d, n]]);
  return "✅ 수정되었습니다.";
}

/** 공휴일 한 행 삭제 (시트 행 번호) */
function deletePublicHoliday(rowIndex) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("공휴일");
  if (!sheet) return "❌ [공휴일] 시트가 없습니다.";
  var row = parseInt(rowIndex, 10);
  if (row < 2 || row > sheet.getLastRow()) return "❌ 잘못된 행 번호입니다.";
  sheet.deleteRow(row);
  return "✅ 삭제되었습니다.";
}

/** 해당 월·직원이 공휴일에 근무한 일수 (근태기록 출근/퇴근 기준). 공휴일 1일 근무 = 일당 추가(2배). */
function getHolidayWorkDaysInMonth(monthStr, store, name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName("근태기록");
  if (!logSheet) return 0;
  var tz = ss.getSpreadsheetTimeZone() || "Asia/Bangkok";
  var startStr = monthStr + "-01";
  var firstDay = new Date(monthStr + "-01");
  var lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0);
  var endStr = Utilities.formatDate(lastDay, tz, "yyyy-MM-dd");
  var year = firstDay.getFullYear();
  var holidays = getPublicHolidays(year);
  var holidaySet = {};
  holidays.forEach(function(h) {
    if (h.date >= startStr && h.date <= endStr) holidaySet[h.date] = true;
  });
  var data = logSheet.getDataRange().getValues();
  var workDates = {};
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1] || "").trim() !== String(store).trim() || String(data[i][2] || "").trim() !== String(name).trim()) continue;
    var type = String(data[i][3] || "").trim();
    if (type !== "출근" && type !== "퇴근") continue;
    var rowDateStr = toAttendanceDateStr(data[i][0], tz);
    if (rowDateStr && rowDateStr >= startStr && rowDateStr <= endStr) workDates[rowDateStr] = true;
  }
  var count = 0;
  for (var d in workDates) { if (holidaySet[d]) count++; }
  return count;
}

/* 2. [계산] 급여 미리보기 - storeFilter: 매장별 검색. userRole: C.E.O/HR만 Office 목록 조회·수정 가능. 근태(지각/승인된 연장) 자동 반영 */
function calculatePayrollPreview(monthStr, storeFilter, userRole) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sEmp = ss.getSheetByName("직원정보");
  
  if(!sEmp) return { success:false, msg:"'직원정보' 시트가 없습니다." };

  var attSummary = getAttendanceSummaryForPayroll(monthStr);
  
  var empData = sEmp.getDataRange().getValues();
  var list = [];
  var storeFilterStr = (storeFilter != null && storeFilter !== undefined) ? String(storeFilter).trim() : "";
  var isAll = (storeFilterStr === "" || storeFilterStr === "All" || storeFilterStr === "전체");
  var isOffice = (storeFilterStr === "Office" || storeFilterStr === "오피스" || storeFilterStr === "본사" || storeFilterStr.toLowerCase() === "office");
  // 직원 시트 E열(직급): Director, HR → Office 포함 전체 조회 가능
  var roleStr = (userRole != null && userRole !== undefined) ? String(userRole).trim().toUpperCase() : "";
  var canSeeOffice = (roleStr === "C.E.O" || roleStr === "CEO" || roleStr === "HR" || roleStr === "DIRECTOR");
  
  // Office 선택 시 Director/HR 로그인 사용자만 조회 가능
  if (isOffice && !canSeeOffice) return { success: true, list: [] };
  
  // 기준월 설정 (예: 2026-02)
  var targetDate = new Date(monthStr + "-01");
  var targetMonth = targetDate.getMonth();
  
  // i=1 (헤더 제외) 부터 시작
  for(var i=1; i<empData.length; i++) {
    var e = empData[i];
    if(!e[1]) continue; // 이름 없으면 패스
    
    var store = e[0];
    var name = e[1];
    var dept = (e[4] != null && e[4] !== undefined) ? String(e[4]).trim() : ""; // E열: 부서/직급
    
    // 매장 필터: Office면 해당 매장 전체 직원, 그 외는 해당 매장만
    if(!isAll) {
      if(isOffice) {
        if(store !== "Office" && store !== "오피스" && String(store).toLowerCase() !== "office" && store !== "본사") continue;
      } else {
        if(store !== storeFilterStr) continue;
      }
    } else {
      // 전체 선택 시에도 C.E.O/HR이 아니면 Office 직원은 제외 (매장 선택에 Office가 없으므로 목록에도 없어야 함)
      if(!canSeeOffice) {
        var storeLower = String(store).toLowerCase();
        if(store === "Office" || store === "오피스" || store === "본사" || storeLower === "office") continue;
      }
    }
    
    // 직원 정보 매핑 (대표님 시트 구조에 맞춤)
    var role = e[12]; // 권한/직급
    var salary = Number(e[10]) || 0; // 기본급
    var posAllow = 0; // 직책수당 (R열 있으면 e[16] 등으로 연결 가능)
    
    var joinDate = e[7] ? new Date(e[7]) : new Date();

    // A. 위험 수당 (일단 0원, 필요시 로직 추가)
    var hazAllow = 0; 

    // B. 생일 수당 (입사 1년 이상 & 해당 월 생일)
    var birthBonus = 0;
    if(e[5]) {
       var birth = new Date(e[5]);
       // 근무 년수 계산 (대략적)
       var workYears = (targetDate - joinDate) / (1000 * 60 * 60 * 24 * 365);
       if(birth.getMonth() === targetMonth && workYears >= 1) birthBonus = 500;
    }

    // C. 공제 - SSO (태국 법 개정 반영: 연도별 상한·최대공제)
    var payrollYear = targetDate.getFullYear();
    var ssoLimits = getSSOLimitsByYear(payrollYear);
    var contributable = Math.min(salary, ssoLimits.ceiling);
    var sso = Math.min(Math.floor(contributable * 0.05), ssoLimits.maxDed);

    // D. 근태 자동 반영 (지각 = 월급/208 시급 기준 공제(태국 주48h), 연장 = 당월 시간표 초과분 1.5배)
    var lateMin = 0, lateDed = 0, ot15 = 0, ot20 = 0, ot30 = 0, otAmt = 0;
    var attKey = store + "_" + name;
    if (attSummary[attKey]) {
      lateMin = attSummary[attKey].lateMin || 0;
      var hoursBase = (typeof LATE_DED_HOURS_BASE !== "undefined" ? LATE_DED_HOURS_BASE : 208);
      lateDed = hoursBase > 0 && salary ? Math.floor((lateMin / 60) * (salary / hoursBase)) : 0;
      var otMin = attSummary[attKey].otMin || 0;
      ot15 = Math.round((otMin / 60) * 10) / 10;
      var plannedMin = getPlannedMinutesForMonth(monthStr, store, name);
      var hourlyRate = (plannedMin > 0 && salary) ? (salary / (plannedMin / 60)) : 0;
      otAmt = (hourlyRate > 0) ? Math.floor((otMin / 60) * hourlyRate * (typeof OT_MULTIPLIER !== "undefined" ? OT_MULTIPLIER : 1.5)) : 0;
    }

    // E. 공휴일 근무 수당 (태국: 공휴일 13일 중 근무한 일수 × 일당 = 2배 지급)
    var holidayWorkDays = getHolidayWorkDaysInMonth(monthStr, store, name);
    var holidayPay = (holidayWorkDays > 0 && salary) ? Math.floor((salary / 30) * holidayWorkDays) : 0;

    // F. 최종 계산 (수당/공제 반영)
    var income = salary + posAllow + hazAllow + birthBonus + holidayPay + otAmt;
    var deduct = lateDed + sso;
    var netPay = income - deduct;

    // 고유 ID 생성 (월_매장_이름)
    var uid = monthStr + "_" + store + "_" + name;

    list.push({
      id: uid, month: monthStr, store: store, name: name, dept: dept, role: role,
      salary: salary, posAllow: posAllow, hazAllow: hazAllow, birthBonus: birthBonus,
      holidayPay: holidayPay, holidayWorkDays: holidayWorkDays,
      splBonus: 0, // 수기 보너스
      ot15: ot15, ot20: ot20, ot30: ot30, otAmt: otAmt,
      lateMin: lateMin, lateDed: lateDed, 
      sso: sso, tax: 0, otherDed: 0,
      netPay: netPay, status: "대기"
    });
  }
  
  return { success: true, list: list };
}

/* 3. [저장] 급여_DB에 저장 (덮어쓰기 로직 포함) */
function savePayrollToDB(monthStr, jsonList) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("급여_DB");
  
  if(!sheet) return "❌ [급여_DB] 시트가 없습니다. 'DB 초기화'를 먼저 해주세요.";
  
  var newData = JSON.parse(jsonList);
  if(newData.length === 0) return "❌ 저장할 데이터가 없습니다.";
  
  // 1. 기존 데이터 읽기
  var data = sheet.getDataRange().getValues();
  var keepData = [];
  
  // 헤더 유지
  if(data.length > 0) keepData.push(data[0]);
  
  var COLS = 23;
  var normMonth = (monthStr && String(monthStr).trim()) ? String(monthStr).trim().substring(0, 7) : "";
  for(var i=1; i<data.length; i++) {
    if(toMonthStr(data[i][1]) !== normMonth) {
      var row = data[i];
      if (row.length < COLS) {
        row = row.slice(0, 10).concat([0], row.slice(10));
      }
      keepData.push(row);
    }
  }
  
  if (keepData.length > 0 && keepData[0].length < COLS) {
    keepData[0] = keepData[0].slice(0, 10).concat(["공휴일수당"], keepData[0].slice(10));
  }
  
  newData.forEach(function(r) {
    keepData.push([
      r.id, r.month, r.store, r.name, r.dept, r.role,
      r.salary, r.posAllow, r.hazAllow, r.birthBonus, r.holidayPay != null ? r.holidayPay : 0, r.splBonus,
      r.ot15, r.ot20, r.ot30, r.otAmt,
      r.lateMin, r.lateDed, r.sso, r.tax, r.otherDed,
      r.netPay, "확정"
    ]);
  });
  
  sheet.clearContents();
  if (keepData.length > 0) {
    var cols = keepData[0].length;
    sheet.getRange(1, 1, keepData.length, cols).setValues(keepData);
    sheet.getRange(2, 7, keepData.length, 22).setNumberFormat("#,##0");
  }
  
  return "✅ " + monthStr + " 급여 내역이 [급여_DB]에 저장되었습니다!";
}

/** 귀속월 셀 값(Date/숫자/문자열)을 yyyy-MM 형식으로 정규화 (명세서 조회 비교용) */
function toMonthStr(val) {
  if (val == null || val === "") return "";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone() || "Asia/Bangkok";
  if (val instanceof Date) return Utilities.formatDate(val, tz, "yyyy-MM");
  if (typeof val === "number") {
    var d = new Date((val - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, "yyyy-MM");
  }
  var s = String(val).trim();
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(s)) return s.substring(0, 7);
  if (/^\d{4}\/\d{2}/.test(s)) return s.substring(0, 7).replace(/\//g, "-");
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, "yyyy-MM");
  return s.length >= 7 ? s.substring(0, 7) : s;
}

/** 시트에 표시된 귀속월 문자열을 yyyy-MM으로 정규화 (getDisplayValues 결과용) */
function displayMonthToNorm(displayStr) {
  if (displayStr == null || displayStr === "") return "";
  var s = String(displayStr).trim();
  if (/^\d{4}-\d{2}/.test(s)) return s.substring(0, 7);
  if (/^\d{4}\/\d{2}/.test(s)) return s.substring(0, 7).replace(/\//g, "-");
  if (/^\d{1,2}[\/\.]\d{1,2}[\/\.]\d{4}$/.test(s)) {
    var parts = s.split(/[\/\.]/);
    var y = parts[2], m = (parts[1] || "01").length === 1 ? "0" + parts[1] : (parts[1] || "01");
    return y + "-" + m;
  }
  var d = new Date(s);
  if (!isNaN(d.getTime())) {
    var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok";
    return Utilities.formatDate(d, tz, "yyyy-MM");
  }
  return s.length >= 7 ? s.substring(0, 7) : s;
}

/* 4. [조회] DB에서 데이터 불러오기 */
function getPayrollFromDB(monthStr) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("급여_DB");
    if (!sheet) return { success: false, msg: "[급여_DB] 시트가 없습니다. 급여 관리에서 'DB 초기화'를 먼저 실행하세요." };
    
    var normMonth = (monthStr != null && String(monthStr).trim()) ? String(monthStr).trim().substring(0, 7) : "";
    if (!normMonth || normMonth.length < 7) return { success: false, msg: "조회할 월(yyyy-MM)을 선택해주세요." };
    
    var data = sheet.getDataRange().getValues();
    var display = sheet.getDataRange().getDisplayValues();
    var list = [];
    var tz = ss.getSpreadsheetTimeZone() || "Asia/Bangkok";
    
    for (var i = 1; i < data.length; i++) {
      var cellMonth = "";
      try {
        cellMonth = displayMonthToNorm(display[i][1]);
        if (!cellMonth) cellMonth = toMonthStr(data[i][1]);
      } catch (e) {
        cellMonth = String(data[i][1] || "").trim().substring(0, 7);
      }
      if (cellMonth !== normMonth) continue;
      var r = data[i];
      var hasHolidayCol = r.length >= 23;
      var monthVal = r[1];
      var monthStrOut = (monthVal instanceof Date) ? Utilities.formatDate(monthVal, tz, "yyyy-MM") : String(monthVal || "").trim().substring(0, 7);
      list.push({
        id: r[0], month: monthStrOut, store: r[2], name: r[3], dept: r[4], role: r[5],
        salary: r[6], posAllow: r[7], hazAllow: r[8], birthBonus: r[9],
        holidayPay: hasHolidayCol ? (r[10] || 0) : 0,
        splBonus: hasHolidayCol ? (r[11] || 0) : (r[10] || 0),
        ot15: hasHolidayCol ? (r[12] || 0) : (r[11] || 0),
        ot20: hasHolidayCol ? (r[13] || 0) : (r[12] || 0),
        ot30: hasHolidayCol ? (r[14] || 0) : (r[13] || 0),
        otAmt: hasHolidayCol ? (r[15] || 0) : (r[14] || 0),
        lateMin: hasHolidayCol ? (r[16] || 0) : (r[15] || 0),
        lateDed: hasHolidayCol ? (r[17] || 0) : (r[16] || 0),
        sso: hasHolidayCol ? (r[18] || 0) : (r[17] || 0),
        tax: hasHolidayCol ? (r[19] || 0) : (r[18] || 0),
        otherDed: hasHolidayCol ? (r[20] || 0) : (r[19] || 0),
        netPay: hasHolidayCol ? (r[21] || 0) : (r[20] || 0),
        status: hasHolidayCol ? (r[22] || "") : (r[21] || "")
      });
    }
    return { success: true, list: list };
  } catch (err) {
    return { success: false, msg: "조회 오류: " + (err && err.message ? err.message : String(err)) };
  }
}

/** 직원정보 시트에서 매장+이름에 해당하는 이메일 반환 (N열, 인덱스 13) */
function getEmployeeEmail(store, name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName("직원정보") || ss.getSheetByName("Users");
  if (!s) return "";
  var data = s.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || "").trim() === String(store || "").trim() &&
        String(data[i][1] || "").trim() === String(name || "").trim()) {
      var email = String(data[i].length > 13 ? data[i][13] : "").trim();
      return email.indexOf("@") > 0 ? email : "";
    }
  }
  return "";
}

/** 급여 명세서 이메일 발송 (등록된 이메일로 HTML 명세서 전송) */
function sendPayrollStatementEmail(monthStr, store, name) {
  var email = getEmployeeEmail(store, name);
  if (!email) return { success: false, msg: "해당 직원의 이메일이 직원정보에 등록되어 있지 않습니다." };
  var res = getPayrollFromDB(monthStr);
  if (!res.success || !res.list) return { success: false, msg: res.msg || "급여 데이터를 불러올 수 없습니다." };
  var p = null;
  for (var i = 0; i < res.list.length; i++) {
    if (res.list[i].store === store && res.list[i].name === name) { p = res.list[i]; break; }
  }
  if (!p) return { success: false, msg: "해당 월·매장·이름의 급여 내역이 없습니다." };
  var totalAllow = (Number(p.posAllow) || 0) + (Number(p.hazAllow) || 0) + (Number(p.birthBonus) || 0) + (Number(p.holidayPay) || 0) + (Number(p.splBonus) || 0);
  var totalDed = (Number(p.lateDed) || 0) + (Number(p.sso) || 0) + (Number(p.tax) || 0) + (Number(p.otherDed) || 0);
  var yearMonthEn = toYearMonthEnglish(monthStr);
  var html = buildPayrollEmailHtml(p, yearMonthEn, totalAllow, totalDed);
  var subject = "[Payroll Statement] " + yearMonthEn + " - " + (p.name || "");
  try {
    MailApp.sendEmail(email, subject, "", { htmlBody: html, name: "CHOONGMAN ERP" });
    return { success: true, to: email };
  } catch (e) {
    return { success: false, msg: (e.message || String(e)) };
  }
}

/** 선택한 명단에 대해 급여 명세서 이메일 일괄 발송. jsonList: JSON 문자열 [{store, name}, ...] */
function sendPayrollStatementEmailBatch(monthStr, jsonList) {
  var list = [];
  try {
    list = JSON.parse(jsonList || "[]");
  } catch (e) {
    return { sent: 0, failed: [], errors: ["목록 형식 오류"], msg: "목록 형식 오류" };
  }
  if (!monthStr || list.length === 0) return { sent: 0, failed: [], errors: [], msg: "조회월 또는 발송 대상이 없습니다." };
  var sent = 0;
  var failed = [];
  var errors = [];
  for (var i = 0; i < list.length; i++) {
    var store = String(list[i].store || "").trim();
    var name = String(list[i].name || "").trim();
    if (!store && !name) continue;
    var res = sendPayrollStatementEmail(monthStr, store, name);
    if (res && res.success) {
      sent++;
    } else {
      failed.push(name || store || "?");
      errors.push((name || store) + ": " + (res && res.msg ? res.msg : "실패"));
    }
  }
  return { sent: sent, failed: failed, errors: errors };
}

/** yyyy-MM → "February 2026" (이메일 제목·본문용) */
function toYearMonthEnglish(monthStr) {
  if (!monthStr || String(monthStr).length < 7) return monthStr || "";
  var parts = String(monthStr).trim().split("-");
  var y = parts[0];
  var m = parseInt(parts[1], 10) || 1;
  var months = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return (months[m] || m) + " " + y;
}

/** Payroll statement email HTML (English, detailed earnings & deductions) */
function buildPayrollEmailHtml(p, yearMonth, totalAllow, totalDed) {
  var salary = Number(p.salary) || 0;
  var posAllow = Number(p.posAllow) || 0;
  var hazAllow = Number(p.hazAllow) || 0;
  var birthBonus = Number(p.birthBonus) || 0;
  var holidayPay = Number(p.holidayPay) || 0;
  var splBonus = Number(p.splBonus) || 0;
  var otAmt = Number(p.otAmt) || 0;
  var lateDed = Number(p.lateDed) || 0;
  var sso = Number(p.sso) || 0;
  var tax = Number(p.tax) || 0;
  var otherDed = Number(p.otherDed) || 0;
  var netPay = Number(p.netPay) || 0;
  var style = "font-family:'Segoe UI',Arial,sans-serif; color:#1e293b; line-height:1.5; max-width:560px; margin:0 auto;";
  var card = "background:#fff; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.08); border:1px solid #e2e8f0; overflow:hidden;";
  var th = "background:#0369a1; color:#fff; padding:10px 12px; text-align:left; font-weight:700;";
  var td = "padding:10px 12px; border-bottom:1px solid #f1f5f9;";
  var tdR = "padding:10px 12px; border-bottom:1px solid #f1f5f9; text-align:right;";
  var netRow = "padding:14px 12px; background:#e0f2fe; font-weight:700; font-size:1.1em; color:#0c4a6e; text-align:right;";
  var html = "<div style=\"" + style + "\">";
  html += "<div style=\"padding:20px 0 12px; text-align:center;\"><h2 style=\"margin:0; font-size:1.25rem; color:#0f172a;\">Payroll Statement</h2><p style=\"margin:6px 0 0; color:#64748b; font-size:0.9rem;\">" + (yearMonth || "") + "</p></div>";
  html += "<div style=\"" + card + "\"><table style=\"width:100%; border-collapse:collapse;\">";
  html += "<tr><td style=\"" + td + "\" colspan=\"2\"><strong>" + (p.name || "") + "</strong> · " + (p.store || "") + (p.dept ? " · " + p.dept : "") + "</td></tr>";
  html += "<tr><td style=\"" + th + "\" colspan=\"2\">Earnings</td></tr>";
  html += "<tr><td style=\"" + td + "\">Base Salary</td><td style=\"" + tdR + "\">" + salary.toLocaleString() + " ฿</td></tr>";
  html += "<tr><td style=\"" + td + "\">Position Allowance</td><td style=\"" + tdR + "\">" + posAllow.toLocaleString() + " ฿</td></tr>";
  html += "<tr><td style=\"" + td + "\">Risk Allowance</td><td style=\"" + tdR + "\">" + hazAllow.toLocaleString() + " ฿</td></tr>";
  html += "<tr><td style=\"" + td + "\">Birthday Allowance</td><td style=\"" + tdR + "\">" + birthBonus.toLocaleString() + " ฿</td></tr>";
  html += "<tr><td style=\"" + td + "\">Holiday Pay</td><td style=\"" + tdR + "\">" + holidayPay.toLocaleString() + " ฿</td></tr>";
  html += "<tr><td style=\"" + td + "\">Special Bonus</td><td style=\"" + tdR + "\">" + splBonus.toLocaleString() + " ฿</td></tr>";
  html += "<tr><td style=\"" + td + "\">OT Allowance</td><td style=\"" + tdR + "\">" + otAmt.toLocaleString() + " ฿</td></tr>";
  html += "<tr><td style=\"" + td + "\"><strong>Total Earnings</strong></td><td style=\"" + tdR + "\"><strong>" + (salary + totalAllow + otAmt).toLocaleString() + " ฿</strong></td></tr>";
  html += "<tr><td style=\"" + th + "\" colspan=\"2\">Deductions</td></tr>";
  html += "<tr><td style=\"" + td + "\">Late Deduction</td><td style=\"" + tdR + "\">-" + lateDed.toLocaleString() + " ฿</td></tr>";
  html += "<tr><td style=\"" + td + "\">SSO (Social Security)</td><td style=\"" + tdR + "\">-" + sso.toLocaleString() + " ฿</td></tr>";
  html += "<tr><td style=\"" + td + "\">Tax</td><td style=\"" + tdR + "\">-" + tax.toLocaleString() + " ฿</td></tr>";
  html += "<tr><td style=\"" + td + "\">Other Deduction</td><td style=\"" + tdR + "\">-" + otherDed.toLocaleString() + " ฿</td></tr>";
  html += "<tr><td style=\"" + td + "\"><strong>Total Deductions</strong></td><td style=\"" + tdR + "\"><strong>-" + totalDed.toLocaleString() + " ฿</strong></td></tr>";
  html += "<tr><td style=\"" + netRow + "\" colspan=\"2\">Net Pay " + netPay.toLocaleString() + " ฿</td></tr>";
  html += "</table></div>";
  html += "<p style=\"margin:16px 0 0; font-size:0.8rem; color:#94a3b8; text-align:center;\">CHOONGMAN ERP · This statement is sent automatically.</p></div>";
  return html;
}

/* =================================================================
   휴가
   ================================================================= */

function requestLeave(d) { 
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName("휴가신청").appendRow([new Date(), d.store, d.name, d.type, d.date, d.reason, "대기"]); 
  return "✅ 신청 완료"; 
}

function getMyLeaveInfo(store, name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(); var leaveSheet = ss.getSheetByName("휴가신청");
  if(!leaveSheet) return { history: [], stats: {usedAnn:0, usedSick:0, remain:0} };
  var data = leaveSheet.getDataRange().getValues();
  var history = []; var usedAnn = 0; var usedSick = 0; var thisYear = new Date().getFullYear();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === store && String(data[i][2]) === name) {
      var dateObj = new Date(data[i][4]); var status = data[i][6]; var type = data[i][3];
      history.push({ date: Utilities.formatDate(dateObj, "GMT+7", "yyyy-MM-dd"), type: type, reason: data[i][5], status: status });
      if ((status === '승인' || status === 'Approved') && dateObj.getFullYear() === thisYear) {
        var val = type.includes('반차') ? 0.5 : 1.0;
        if (type.includes('병가')) usedSick += val; else usedAnn += val;
      }
    }
  }
  history.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });
  return { history: history, stats: { usedAnn: usedAnn, usedSick: usedSick, remain: 6 - usedAnn } };
}

/* [G] 휴가/거래처 */
function getLeaveAllData() { var ss = SpreadsheetApp.getActiveSpreadsheet(); var leaveData = ss.getSheetByName("휴가신청").getDataRange().getValues(); var userData = ss.getSheetByName("직원정보").getDataRange().getValues(); var users = []; var nickMap = {}; for(var u=1; u<userData.length; u++) { if(userData[u][0] && userData[u][1]) { var s = String(userData[u][0]).trim(); var n = String(userData[u][1]).trim(); var key = s + "|" + n; nickMap[key] = userData[u][2] || ""; users.push({store: s, name: n, nick: userData[u][2] || ""}); } } var leaves = []; for (var i = 1; i < leaveData.length; i++) { var reqStore = String(leaveData[i][1]).trim(); var reqName = String(leaveData[i][2]).trim(); var userKey = reqStore + "|" + reqName; leaves.push({ row: i + 1, store: reqStore, name: reqName, nick: nickMap[userKey] || "", type: leaveData[i][3], date: Utilities.formatDate(new Date(leaveData[i][4]), "GMT+7", "yyyy-MM-dd"), reason: leaveData[i][5], status: leaveData[i][6] }); } return { users: users, leaves: leaves }; }

function processLeaveDecision(r,d) { SpreadsheetApp.getActiveSpreadsheet().getSheetByName("휴가신청").getRange(r,7).setValue(d); return "처리됨"; }

/** [모바일 Admin] 휴가 목록 (오피스=전매장, 매니저=해당 매장만) */
function getLeaveAllDataForMobile(userStore, userRole) {
  var raw = getLeaveAllData();
  var r = String(userRole || "").toLowerCase();
  var isOffice = r.indexOf("director") !== -1 || r.indexOf("officer") !== -1 || r.indexOf("ceo") !== -1 || r.indexOf("hr") !== -1;
  var leaves = (raw.leaves || []).filter(function(l) { return isOffice || (l.store && String(l.store).trim() === String(userStore).trim()); });
  return { users: raw.users || [], leaves: leaves };
}

/** [모바일 Admin] 휴가 승인/반려 (권한: 해당 행의 매장이 본인 범위 내인지 검사) */
function processLeaveDecisionMobile(row, decision, userStore, userRole) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("휴가신청");
  if (!sheet) return "❌ 시트 없음";
  var lastRow = sheet.getLastRow();
  if (row < 2 || row > lastRow + 1) return "❌ 잘못된 행";
  var rowStore = String(sheet.getRange(row, 2).getValue()).trim();
  var r = String(userRole || "").toLowerCase();
  var isOffice = r.indexOf("director") !== -1 || r.indexOf("officer") !== -1 || r.indexOf("ceo") !== -1 || r.indexOf("hr") !== -1;
  if (!isOffice && String(userStore).trim() !== rowStore) return "❌ 해당 매장만 승인할 수 있습니다.";
  return processLeaveDecision(row, decision);
}

/** [모바일 Admin] 근태 대기 목록 (지각/OT 등 승인대기만, 오피스=전매장, 매니저=해당 매장만). storeFilterOverride: 오피스가 특정 매장만 볼 때 사용 */
function getAttendancePendingForMobile(userStore, userRole, startDate, endDate, storeFilterOverride) {
  var r = String(userRole || "").toLowerCase();
  var isOffice = r.indexOf("director") !== -1 || r.indexOf("officer") !== -1 || r.indexOf("ceo") !== -1 || r.indexOf("hr") !== -1;
  var storeFilter = (storeFilterOverride && String(storeFilterOverride).trim()) ? String(storeFilterOverride).trim() : (isOffice ? "All" : (userStore ? String(userStore).trim() : "All"));
  var list = getAttendanceList(startDate || "", endDate || "", storeFilter);
  return (list || []).filter(function(x) { return (x.approval === "대기" || x.approval === ""); });
}

/** [모바일 Admin] 근태 승인/반려 (권한: 해당 행의 매장이 본인 범위 내인지 검사) */
function processAttendanceApprovalMobile(row, decision, userStore, userRole) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("근태기록");
  if (!sheet) return "❌ 시트 없음";
  var rowStore = String(sheet.getRange(row, 2).getValue()).trim();
  var r = String(userRole || "").toLowerCase();
  var isOffice = r.indexOf("director") !== -1 || r.indexOf("officer") !== -1 || r.indexOf("ceo") !== -1 || r.indexOf("hr") !== -1;
  if (!isOffice && String(userStore).trim() !== rowStore) return "❌ 해당 매장만 승인할 수 있습니다.";
  return processAttendanceApproval(row, decision);
}

/* [Code.gs 최종 수정] 휴가 통계 (O열 연차일수 / E열 휴가날짜 / G열 상태 반영) */
function getLeaveStats(startStr, endStr, filterStore) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. 시트 데이터 가져오기 (이름 정확해야 함)
  var empSheet = ss.getSheetByName("직원정보");     // 시트명: <직원정보>가 아니라 '직원'인지 확인 필요
  var leaveSheet = ss.getSheetByName("휴가신청"); // 시트명: 휴가신청
  
  if (!empSheet) return []; 

  var empData = empSheet.getDataRange().getValues();
  var leaveData = leaveSheet ? leaveSheet.getDataRange().getValues() : [];

  var result = [];
  
  // 조회 기간 설정
  var start = startStr ? new Date(startStr) : new Date('2000-01-01');
  var end = endStr ? new Date(endStr) : new Date('2100-12-31');
  start.setHours(0,0,0,0);
  end.setHours(23,59,59,999);

  var targetStore = filterStore ? String(filterStore).trim() : "All";

  // =========================================================
  // 직원 한 명씩 순서대로 계산 (2행부터 시작)
  // =========================================================
  for (var i = 1; i < empData.length; i++) {
    // [직원 시트] 열 위치 수정됨
    var empStoreRaw = empData[i][0];              // A열: 매장 (Index 0)
    var empStore = String(empStoreRaw).trim();
    var empName = String(empData[i][1]).trim();   // B열: 이름 (Index 1)
    
    // ★ [수정] 연차 부여일수는 O열 (Index 14)
    // (A=0, B=1 ... L=11 ... O=14)
    var annualLimit = empData[i][14] ? Number(empData[i][14]) : 15; 

    // 매장 필터링
    if (targetStore !== "All" && empStore !== targetStore) continue;
    if (!empName) continue;

    var usedPeriodAnnual = 0; 
    var usedPeriodSick = 0;   
    var usedTotalAnnual = 0;  
    var usedTotalSick = 0;    

    // =======================================================
    // 휴가 신청 기록 뒤지기
    // =======================================================
    for (var j = 1; j < leaveData.length; j++) {
      // [휴가신청 시트] 열 위치 수정됨
      // A:신청일시(0), B:매장(1), C:이름(2), D:구분(3), E:휴가날짜(4), F:사유(5), G:상태(6)
      
      var lName = String(leaveData[j][2]).trim(); // C열: 이름 (Index 2)
      var lType = String(leaveData[j][3]).trim(); // D열: 구분 (Index 3)
      var lDateRaw = leaveData[j][4];             // ★ E열: 휴가날짜 (Index 4)
      var lStatus = String(leaveData[j][6]).trim(); // ★ G열: 상태 (Index 6)

      // (1) 이름 일치 여부
      if (lName !== empName) continue;

      // (2) 상태가 '승인'인 것만 계산 (영어 Approved 대응)
      if (lStatus !== '승인' && lStatus !== 'Approved') continue;

      // (3) 날짜 확인 (휴가 날짜 기준)
      var lDate = new Date(lDateRaw);
      lDate.setHours(12,0,0,0); 

      // --- [전체 누적] ---
      if (lType === '연차' || lType === 'Annual') usedTotalAnnual++;
      else if (lType === '병가' || lType === 'Sick') usedTotalSick++;

      // --- [조회 기간 내] ---
      if (lDate >= start && lDate <= end) {
        if (lType === '연차' || lType === 'Annual') usedPeriodAnnual++;
        else if (lType === '병가' || lType === 'Sick') usedPeriodSick++;
      }
    }

    // 결과 저장
    result.push({
      store: empStoreRaw,
      name: empName,
      used_annual: usedPeriodAnnual,
      used_sick: usedPeriodSick,
      total_annual: usedTotalAnnual,
      total_sick: usedTotalSick,
      remain: annualLimit - usedTotalAnnual // 잔여 = O열값 - 사용한 연차
    });
  }

  return result;
}

/* =================================================================
    근태
   ================================================================= */

// 1. 기초 시트 공사 (최초 1회 실행용)
function setupAttendanceFoundation() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // <직원시간표> 생성 (기록 날짜 열 포함)
  var schSheet = ss.getSheetByName("직원시간표") || ss.insertSheet("직원시간표");
  var schHeaders = ["날짜", "매장명", "이름", "계획출근", "계획퇴근", "계획휴게시작", "계획휴게종료", "비고", "기록 날짜"];
  schSheet.getRange(1, 1, 1, schHeaders.length).setValues([schHeaders]).setBackground("#4c4c4c").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
  
  // <근태기록> 확장
  var logSheet = ss.getSheetByName("근태기록") || ss.insertSheet("근태기록");
  var logHeaders = ["일시", "매장명", "이름", "유형", "위도", "경도", "계획시간", "지각(분)", "조퇴(분)", "연장(분)", "실제휴게(분)", "사유", "상태", "승인여부"];
  logSheet.getRange(1, 1, 1, logHeaders.length).setValues([logHeaders]).setBackground("#E65100").setFontColor("white").setFontWeight("bold").setHorizontalAlignment("center");
  
  return "✅ 근태 시스템 기초 공사 완료!";
}

/* [S_HR.gs] 근태 기록 메인 엔진 - 휴게 초과 감지 포함 */
function submitAttendance(data) { 
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var todayStr = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
  var nowTime = new Date();
  var logSheet = ss.getSheetByName("근태기록");

  // 1. [위치 검증] 거래처 시트 정보와 대조
  var vendorSheet = ss.getSheetByName("거래처");
  var vData = vendorSheet.getDataRange().getValues();
  var targetLat = 0, targetLng = 0, foundStore = false;
  
  for (var i = 1; i < vData.length; i++) {
    if (String(vData[i][10]) === String(data.storeName)) { 
      targetLat = Number(vData[i][11]); targetLng = Number(vData[i][12]);
      foundStore = true; break;
    }
  }
  
  if (foundStore && targetLat !== 0 && data.lat !== "Unknown") {
    var distance = calcDistance(targetLat, targetLng, data.lat, data.lng);
    if (distance > 100) return "❌ 위치 불일치! 매장 반경 100m 이내에서만 가능합니다. (현재: " + Math.round(distance) + "m)";
  }

  // 2. [계획 대조] 오늘 시간표 데이터 가져오기
  var schSheet = ss.getSheetByName("직원시간표");
  var schData = schSheet.getDataRange().getValues();
  var planIn = "", planOut = "", planBS = "", planBE = "";
  
  for (var j = 1; j < schData.length; j++) {
    var rowDate = Utilities.formatDate(new Date(schData[j][0]), "GMT+7", "yyyy-MM-dd");
    if (rowDate === todayStr && schData[j][2] === data.name) {
      planIn = schData[j][3];   // 출근 계획
      planOut = schData[j][4];  // 퇴근 계획
      planBS = schData[j][5];   // 휴게 시작 계획
      planBE = schData[j][6];   // 휴게 종료 계획
      break;
    }
  }

  // 3. [자동 판정 로직]
  var lateMin = 0, earlyMin = 0, otMin = 0, breakMin = 0, status = "정상", planTime = "";

  if (data.type === "출근" && planIn) {
    planTime = planIn;
    var pInDate = new Date(todayStr + " " + planIn);
    if (nowTime > pInDate) {
      lateMin = Math.floor((nowTime - pInDate) / (1000 * 60));
      if (lateMin > 1) status = "지각"; // 1분 초과 시 지각
    }
  } 
  else if (data.type === "퇴근" && planOut) {
    planTime = planOut;
    var pOutDate = new Date(todayStr + " " + planOut);
    if (nowTime < pOutDate) {
      earlyMin = Math.floor((pOutDate - nowTime) / (1000 * 60));
      status = "조퇴";
    } else {
      otMin = Math.floor((nowTime - pOutDate) / (1000 * 60));
      if (otMin >= 30) status = "연장";
    }
  } 
  else if (data.type === "휴식종료") {
    var logs = logSheet.getDataRange().getValues();
    for (var k = logs.length - 1; k >= 0; k--) {
      if (logs[k][2] === data.name && logs[k][3] === "휴식시작" && 
          Utilities.formatDate(new Date(logs[k][0]), "GMT+7", "yyyy-MM-dd") === todayStr) {
        var actualStart = new Date(logs[k][0]);
        breakMin = Math.floor((nowTime - actualStart) / (1000 * 60));
        
        // 계획된 휴게 시간과 비교하여 초과 여부 확인
        if (planBS && planBE) {
          var pBSDate = new Date(todayStr + " " + planBS);
          var pBEDate = new Date(todayStr + " " + planBE);
          var planDur = Math.floor((pBEDate - pBSDate) / (1000 * 60));
          status = (breakMin > planDur) ? "휴게초과" : "휴게정상";
        }
        break;
      }
    }
  }

  // 4. [기록 저장]
  logSheet.appendRow([
    nowTime, data.storeName, data.name, data.type, data.lat, data.lng,
    planTime, lateMin, earlyMin, otMin, breakMin, "", status, "대기"
  ]);

  return "✅ " + data.type + " 완료! (" + status + ")";
}

/* [관리자 전용] 근태 기록 조회 - 인자: 객체 { startDate, endDate, storeFilter, employeeFilter } 또는 (startDate, endDate, storeFilter)
   ★ 필터 정규화: '전체 매장'/'All', '오피스'/'본사'/'Office' 통일 처리 */
function getAttendanceList(startDate, endDate, storeFilter) {
  try {
    var startStr, endStr, storeFilterStr, employeeFilterStr;

    if (startDate && typeof startDate === "object" && startDate.startDate != null) {
      startStr = String(startDate.startDate || "").trim();
      endStr = String(startDate.endDate || "").trim();
      storeFilterStr = String(startDate.storeFilter != null ? startDate.storeFilter : "").trim();
      employeeFilterStr = String(startDate.employeeFilter != null ? startDate.employeeFilter : "").trim();
    } else {
      startStr = String(startDate || "").trim();
      endStr = String(endDate || "").trim();
      storeFilterStr = String(storeFilter != null ? storeFilter : "").trim();
      employeeFilterStr = "";
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("근태기록");
    if (!sheet) return [];
    if (!startStr || !endStr) return [];

    // ★ 시작일/종료일을 항상 yyyy-MM-dd로 통일 (T 포함 문자열, 2026/1/31 등 처리)
    startStr = toNormalizedDateStr(startStr);
    endStr = toNormalizedDateStr(endStr);
    if (!startStr || !endStr) return [];
    if (startStr > endStr) { var tmp = startStr; startStr = endStr; endStr = tmp; }

    // ★ 필터 값 정규화: 프론트에서 "전체 매장" 텍스트가 value로 넘어오는 경우 대비
    if (storeFilterStr === "전체 매장" || storeFilterStr === "전체" || storeFilterStr === "") storeFilterStr = "All";

    var tz = ss.getSpreadsheetTimeZone() || "Asia/Bangkok";
    var data = sheet.getDataRange().getValues();
    var display = sheet.getDataRange().getDisplayValues();
    var result = [];

    // ★ 필터 조건 정규화 (대소문자·한/영 통일)
    var isAll = (storeFilterStr === "All");
    var storeFilterLower = storeFilterStr.toLowerCase();
    var isOfficeFilter = (storeFilterStr === "오피스" || storeFilterStr === "본사" || storeFilterLower === "office" ||
      storeFilterStr.indexOf("오피스") >= 0 || storeFilterStr.indexOf("본사") >= 0 || storeFilterLower.indexOf("office") >= 0);
    var useAllEmployees = !employeeFilterStr || employeeFilterStr === "전체 직원";

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row || !row[0]) continue;

      var rowDateStr = toAttendanceDateStr(row[0], tz);
      if (!rowDateStr || rowDateStr.length < 10) {
        var dispStr = String(display[i] && display[i][0] ? display[i][0] : "").trim();
        if (dispStr.length >= 8) {
          var m = dispStr.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
          if (m) rowDateStr = m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
          if (!rowDateStr && dispStr.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})/)) {
            var dm2 = dispStr.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})/);
            if (dm2) rowDateStr = dm2[3] + "-" + ("0" + dm2[2]).slice(-2) + "-" + ("0" + dm2[1]).slice(-2);
          }
        }
      }
      if (!rowDateStr || rowDateStr.length < 10) continue;
      if (rowDateStr < startStr || rowDateStr > endStr) continue;

      var rowStore = String(row[1] != null ? row[1] : "").trim();
      var rowStoreLower = rowStore.toLowerCase();
      var isOfficeRow = (rowStore === "오피스" || rowStore === "본사" || rowStoreLower === "office");

      var storeMatch = false;
      if (isAll) {
        storeMatch = true;
      } else if (isOfficeFilter) {
        storeMatch = isOfficeRow;
      } else {
        storeMatch = (rowStore === storeFilterStr || rowStore === String(storeFilterStr || "").trim());
      }
      if (!storeMatch) continue;

    if (!useAllEmployees) {
      var rowName = String(row[2] || "").trim();
      if (rowName !== employeeFilterStr) continue;
    }

    result.push({
      row: i + 1,
      timestamp: toAttendanceTimestampStr(row[0], tz, row[0]),
      store: row[1],
      name: row[2] || "",
      type: row[3] || "",
      plan: row[6] || "-",
      late: Number(row[7]) || 0,
      early: Number(row[8]) || 0,
      ot: Number(row[9]) || 0,
      breakTime: row[10] || 0,
      reason: row[11] || "",
      status: row[12] || "정상",
      approval: String(row[13] || "").trim() || "대기"
    });
  }

    return result.reverse();
  } catch (err) {
    return [];
  }
}

/** 조회 기간용: 입력값을 yyyy-MM-dd 문자열로 정규화 (2026/1/31, 2026-01-31, 2026-01-31T00:00:00 등 통일) */
function toNormalizedDateStr(val) {
  if (val == null && val !== 0) return "";
  var s = String(val || "").trim();
  if (!s) return "";
  if (s.indexOf("T") >= 0) s = s.split("T")[0];
  var m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (m) return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
  if (s.length >= 10 && s.charAt(4) === "-" && s.charAt(7) === "-") return s.substring(0, 10);
  return "";
}

/** 일시 값을 yyyy-MM-dd 문자열로 변환 (시트 표기 "2026. 1. 20 오후 12:33:16" 등 지원) */
function toAttendanceDateStr(val, tz) {
  if (val == null && val !== 0) return "";
  tz = tz || "Asia/Bangkok";
  if (val instanceof Date) return Utilities.formatDate(val, tz, "yyyy-MM-dd");
  if (typeof val === "number") {
    var d = new Date((val - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, "yyyy-MM-dd");
  }
  var s = String(val || "").trim();
  if (!s) return "";
  var m = s.match(/(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
  if (m) {
    var y = m[1], mo = ("0" + m[2]).slice(-2), d = ("0" + m[3]).slice(-2);
    return y + "-" + mo + "-" + d;
  }
  if (s.length >= 10 && s.substring(0, 4).match(/\d{4}/) && s.charAt(4) === "-" && s.charAt(7) === "-")
    return s.substring(0, 10);
  try {
    var d = new Date(val);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, "yyyy-MM-dd");
  } catch (e) {}
  return "";
}

/** 일시 값을 MM-dd HH:mm 표시용 문자열로 변환 */
function toAttendanceTimestampStr(val, tz, raw) {
  tz = tz || "Asia/Bangkok";
  if (val instanceof Date) return Utilities.formatDate(val, tz, "MM-dd HH:mm");
  var s = String(raw != null ? raw : val || "").trim();
  var m = s.match(/(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s+([오전오후]*)\s*(\d{1,2}):(\d{1,2}):(\d{1,2})/);
  if (m) {
    var mo = ("0" + m[2]).slice(-2), d = ("0" + m[3]).slice(-2);
    var h = parseInt(m[5], 10), mi = ("0" + m[6]).slice(-2);
    if (m[4] && m[4].indexOf("오후") !== -1 && h < 12) h += 12;
    if (m[4] && m[4].indexOf("오전") !== -1 && h === 12) h = 0;
    return mo + "-" + d + " " + ("0" + h).slice(-2) + ":" + mi;
  }
  if (s.length >= 16) return s.substring(5, 16);
  try {
    var d = new Date(val);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, "MM-dd HH:mm");
  } catch (e) {}
  return s.substring(0, 16);
}

/* [추가] 관리자 근태 승인 처리 */
function approveAttendance(row, status) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("근태기록");
  sheet.getRange(row, 13).setValue("정상(승인)"); // 상태 변경
  sheet.getRange(row, 14).setValue("승인완료"); // 승인여부 변경
  return "✅ 승인되었습니다.";
}

// Code.gs 에 추가할 함수
function updateLastReason(reason, name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("근태기록");
  var data = sheet.getDataRange().getValues();
  
  // 가장 마지막 줄부터 위로 올라가며 해당 직원의 기록을 찾아 사유(L열)를 업데이트
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][2] === name) { // 이름(C열) 확인
      sheet.getRange(i + 1, 12).setValue(reason); // L열(12번째)에 사유 저장
      return "✅ 사유가 저장되었습니다.";
    }
  }
  return "❌ 기록을 찾을 수 없습니다.";
}

/* [관리자 기능] 근태 승인/반려 처리 */
function processAttendanceApproval(row, decision) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("근태기록");
  
  // N열(14번째 칸)에 승인 상태 저장
  sheet.getRange(row, 14).setValue(decision);
  
  // 승인 시 상태(M열)도 '정상'으로 변경해주고 싶다면 아래 주석 해제
  // if(decision === "승인완료") sheet.getRange(row, 13).setValue("정상(승인)");
  
  return "✅ 처리가 완료되었습니다.";
}

/* =================================================================
   시간표(스케줄러)
   ================================================================= */ 

/* [관리자] 시간표 관리용 데이터 호출 */
function getScheduleForAdmin(date, storeFilter) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("직원시간표");
    if (!sheet) return [];
    var tz = ss.getSpreadsheetTimeZone() || "Asia/Bangkok";
    var data = sheet.getDataRange().getValues();
    var display = sheet.getDataRange().getDisplayValues();
    var result = [];
    var targetDate = (date && String(date).trim()) ? String(date).trim().substring(0, 10) : "";
    if (!targetDate) return [];
    if (targetDate.length === 10 && targetDate.charAt(4) === "-" && targetDate.charAt(7) === "-") { /* ok */ } else {
      try {
        targetDate = Utilities.formatDate(new Date(date), tz, "yyyy-MM-dd");
      } catch (e) { return []; }
    }

    for (var i = 1; i < data.length; i++) {
      var rowDateVal = data[i][0];
      var rowDateStr = "";
      if (rowDateVal instanceof Date) {
        rowDateStr = Utilities.formatDate(rowDateVal, tz, "yyyy-MM-dd");
      } else if (typeof rowDateVal === "number") {
        var d = new Date((rowDateVal - 25569) * 86400 * 1000);
        if (!isNaN(d.getTime())) rowDateStr = Utilities.formatDate(d, tz, "yyyy-MM-dd");
      } else {
        rowDateStr = String(rowDateVal || "").trim().substring(0, 10);
      }
      if (!rowDateStr && display[i] && display[i][0]) {
        var s = String(display[i][0]).trim();
        if (s.length >= 10) rowDateStr = s.substring(0, 10).replace(/[\/\.]/g, "-");
      }
      if (rowDateStr !== targetDate) continue;
      if (storeFilter !== "All" && storeFilter !== "" && String(data[i][1] || "").trim() !== String(storeFilter || "").trim()) continue;
      result.push({
        row: i + 1,
        store: data[i][1],
        name: data[i][2],
        pIn: data[i][3],
        pOut: data[i][4],
        pBS: data[i][5],
        pBE: data[i][6]
      });
    }
    return result;
  } catch (err) {
    return [];
  }
}

/* [관리자] 시간표 데이터 행 수정 */
function updateScheduleRow(d) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("직원시간표");
  if (!sheet) return "시트를 찾을 수 없습니다.";
  var row = parseInt(d.row, 10);
  if (row < 2 || row > sheet.getLastRow()) return "잘못된 행 번호입니다.";
  sheet.getRange(row, 4, row, 7).setValues([[d.pIn || "", d.pOut || "", d.pBS || "", d.pBE || ""]]);
  return "Success";
}

// 1. 선택한 매장의 직원들만 이름표로 만들기 위해 가져오는 함수 (매장명 앞뒤 공백·연속 공백 정규화 후 비교)
function getStoreStaffOnly(storeName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("직원정보");
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  var list = [];
  var storeNorm = String(storeName || "").trim().replace(/\s+/g, " ");

  for (var i = 1; i < data.length; i++) {
    var rowStore = String(data[i][0] || "").trim().replace(/\s+/g, " ");
    if (rowStore !== storeNorm) continue;
    list.push({
      name: String(data[i][1] || "").trim(),
      nick: String(data[i][2] || "").trim(),
      dept: data[i][4]
    });
  }
  return list;
}

/* [조회] 저장된 주간 스케줄 - 직원시간표 시트 (헤더 기반 열 매핑, 작성한 날짜 열 무시) */
function getSavedWeeklyData(storeName, mondayStr) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("직원시간표") || ss.getSheetByName("직원 시간표");
    if (!sheet) return [];
    var tz = ss.getSpreadsheetTimeZone() || "Asia/Bangkok";
    var data = sheet.getDataRange().getValues();
    var display = sheet.getDataRange().getDisplayValues();
    if (!data || data.length < 2) return [];

  var header = data[0].map(function(h) { return String(h || "").trim(); });
  var col = function(names, defaultIdx) {
    var arr = typeof names === "string" ? [names] : names;
    for (var n = 0; n < arr.length; n++) {
      var i = header.indexOf(arr[n]);
      if (i >= 0) return i;
    }
    return defaultIdx !== undefined ? defaultIdx : -1;
  };
  var idxDate = col(["날짜", "Date", "일자"], 0);
  var idxStore = col(["매장명", "Store", "매장"], 1);
  var idxName = col(["이름", "Name"], 2);
  var idxIn = col(["계획출근", "pIn"], 3);
  var idxOut = col(["계획퇴근", "pOut"], 4);
  var idxBS = col(["계획휴게시작", "pBS"], 5);
  var idxBE = col(["계획휴게종료", "pBE"], 6);
  var idxRemark = col(["비고", "Remark"], 7);
  // ★ 헤더 이름이 없어도 열 개수만 7개 이상이면 0,1,2,3,4,5,6 위치로 사용 (저장 시 쓰는 SCH_HEADERS 순서와 동일)
  if (idxDate < 0 || idxStore < 0 || idxName < 0) {
    if (data[0] && data[0].length >= 7) {
      idxDate = 0; idxStore = 1; idxName = 2; idxIn = 3; idxOut = 4; idxBS = 5; idxBE = 6;
      idxRemark = (header && header.length > 7) ? 7 : -1;
    } else return [];
  }
  if (idxDate < 0 || idxStore < 0 || idxName < 0) return [];

  // ★ yyyy-MM-dd 기준으로 주간 범위 계산 (타임존 영향 제거로 시트 날짜와 정확히 매칭)
  var mondayTrim = String(mondayStr || "").trim();
  var mMatch = mondayTrim.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!mMatch) {
    // 프론트에서 "2026/1/27" 등으로 넘어올 수 있음 → yyyy-MM-dd로 정규화 시도
    var slashOrDot = mondayTrim.match(/(\d{4})[\/\.](\d{1,2})[\/\.](\d{1,2})/);
    if (slashOrDot) {
      mondayTrim = slashOrDot[1] + "-" + ("0" + slashOrDot[2]).slice(-2) + "-" + ("0" + slashOrDot[3]).slice(-2);
      mMatch = mondayTrim.match(/^(\d{4})-(\d{2})-(\d{2})/);
    }
  }
  if (!mMatch) return [];
  var y = parseInt(mMatch[1], 10), mo = parseInt(mMatch[2], 10), d = parseInt(mMatch[3], 10);
  var startStr = mondayTrim.substring(0, 10);
  var endDate = new Date(Date.UTC(y, mo - 1, d + 6));
  var endStr = endDate.getUTCFullYear() + "-" + ("0" + (endDate.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + endDate.getUTCDate()).slice(-2);

  var nameToNick = {};
  var empSheet = ss.getSheetByName("직원정보");
  if (empSheet) {
    var empData = empSheet.getDataRange().getValues();
    for (var e = 1; e < empData.length; e++) {
      var nm = String(empData[e][1] || "").trim();
      var nick = String(empData[e][2] || "").trim() || nm;
      if (nm) nameToNick[nm] = nick;
    }
  }

  function normalizeStore(s) {
    return String(s || "").trim().replace(/\s+/g, " ");
  }
  function storeMatch(a, b) {
    var na = normalizeStore(a), nb = normalizeStore(b);
    if (na === nb) return true;
    if (na.toLowerCase() === nb.toLowerCase()) return true;
    var officeAliases = ["office", "오피스", "본사"];
    var al = na.toLowerCase(), bl = nb.toLowerCase();
    if (officeAliases.indexOf(al) >= 0 && officeAliases.indexOf(bl) >= 0) return true;
    return false;
  }
  var result = [];
  var storeTrim = normalizeStore(storeName);
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowStore = normalizeStore(row[idxStore]);
    if (!storeMatch(storeName, row[idxStore])) continue;
    var rowDate = row[idxDate];
    var rowDateStr = "";
    if (rowDate instanceof Date) {
      rowDateStr = Utilities.formatDate(rowDate, tz, "yyyy-MM-dd");
    } else if (typeof rowDate === "number") {
      var d = new Date((rowDate - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) rowDateStr = Utilities.formatDate(d, tz, "yyyy-MM-dd");
    } else {
      rowDateStr = String(rowDate || "").trim().substring(0, 10);
    }
      if ((!rowDateStr || rowDateStr.length < 10) && display[i] && display[i][idxDate] != null) {
      var dispDate = String(display[i][idxDate]).trim();
      var dm = dispDate.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
      if (dm) rowDateStr = dm[1] + "-" + ("0" + dm[2]).slice(-2) + "-" + ("0" + dm[3]).slice(-2);
      if (!rowDateStr && dispDate.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})/)) {
        var ddm = dispDate.match(/(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})/);
        if (ddm) rowDateStr = ddm[3] + "-" + ("0" + ddm[2]).slice(-2) + "-" + ("0" + ddm[1]).slice(-2);
      }
    }
    if (!rowDateStr || rowDateStr.length < 10) continue;
    if (rowDateStr < startStr || rowDateStr > endStr) continue;
    var remark = idxRemark >= 0 ? String(row[idxRemark] || "").trim() : "";
    var area = "Service";
    if (remark.indexOf("Kitchen") !== -1) area = "Kitchen";
    else if (remark.indexOf("Service") !== -1) area = "Service";
    function toHHmm(v) {
      var s = String(v || "").trim();
      if (!s) return "";
      var parts = s.split(/[:\s]/);
      var h = parseInt(parts[0], 10);
      var m = parseInt(parts[1], 10) || 0;
      if (isNaN(h)) return s;
      return ("0" + h).slice(-2) + ":" + ("0" + m).slice(-2);
    }
    result.push({
      date: rowDateStr,
      name: String(row[idxName] || "").trim(),
      nick: nameToNick[String(row[idxName] || "").trim()] || String(row[idxName] || "").trim(),
      pIn: toHHmm(row[idxIn]) || "09:00",
      pOut: toHHmm(row[idxOut]) || "18:00",
      pBS: toHHmm(row[idxBS]),
      pBE: toHHmm(row[idxBE]),
      area: area
    });
  }
  return result && result.slice ? result.slice() : result;
  } catch (err) {
    return [];
  }
}

/** [디버그] 스케줄 불러오기 원인 확인용 - 스크립트 편집기에서 getSavedWeeklyDataCheck('매장명','2026-01-27') 호출 */
function getSavedWeeklyDataCheck(storeName, mondayStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("직원시간표");
  if (!sheet) return { ok: false, reason: "직원시간표 시트 없음" };
  var data = sheet.getDataRange().getValues();
  var display = sheet.getDataRange().getDisplayValues();
  if (!data || data.length < 2) return { ok: false, reason: "데이터 행 없음(헤더만 있음)", rowCount: data ? data.length : 0 };
  var header = data[0].map(function(h) { return String(h || "").trim(); });
  var mMatch = String(mondayStr || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!mMatch) return { ok: false, reason: "월요일 형식 아님(yyyy-MM-dd 필요)", mondayStr: mondayStr };
  var y = parseInt(mMatch[1], 10), mo = parseInt(mMatch[2], 10), d = parseInt(mMatch[3], 10);
  var startStr = mondayStr.substring(0, 10);
  var endDate = new Date(Date.UTC(y, mo - 1, d + 6));
  var endStr = endDate.getUTCFullYear() + "-" + ("0" + (endDate.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + endDate.getUTCDate()).slice(-2);
  var firstRow = data[1];
  var storeCol = header.indexOf("매장명") >= 0 ? header.indexOf("매장명") : (header.indexOf("Store") >= 0 ? header.indexOf("Store") : 1);
  var dateCol = header.indexOf("날짜") >= 0 ? header.indexOf("날짜") : (header.indexOf("Date") >= 0 ? header.indexOf("Date") : 0);
  return {
    ok: true,
    reason: "확인용",
    rowCount: data.length - 1,
    header: header.slice(0, 8),
    startStr: startStr,
    endStr: endStr,
    sampleStore: firstRow[storeCol],
    sampleDateRaw: firstRow[dateCol],
    sampleDateDisplay: display[1] && display[1][dateCol] ? String(display[1][dateCol]) : "",
    storeNameSent: storeName
  };
}

function toScheduleDateStr(val, tz) {
  if (val instanceof Date) return Utilities.formatDate(val, tz, "yyyy-MM-dd");
  var s = String(val || "").trim();
  if (!s) return "";
  var m = s.match(/(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
  if (m) {
    var y = m[1], mo = ("0" + m[2]).slice(-2), d = ("0" + m[3]).slice(-2);
    return y + "-" + mo + "-" + d;
  }
  if (s.length >= 10 && s.charAt(4) === "-" && s.charAt(7) === "-") return s.substring(0, 10);
  try {
    var d = new Date(val);
    if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, "yyyy-MM-dd");
  } catch (e) {}
  return "";
}

// 2. 주간 그리드 데이터를 분석해서 시트에 일괄 저장하는 함수 (작성한 날짜 열 포함)
var SCH_HEADERS = ["날짜", "매장명", "이름", "계획출근", "계획퇴근", "계획휴게시작", "계획휴게종료", "비고", "기록 날짜"];

function saveWeeklySmartSchedule(storeName, mondayDate, scheduleArray) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var sheet = ss.getSheetByName("직원시간표");
  if (!sheet) {
    sheet = ss.insertSheet("직원시간표");
    sheet.getRange(1, 1, 1, SCH_HEADERS.length).setValues([SCH_HEADERS]).setBackground("#4c4c4c").setFontColor("white").setFontWeight("bold");
  }
  // 기존 시트에 "기록 날짜" 열이 없으면 1열만 추가 (getRange: 행, 열, 행개수, 열개수)
  var lastCol = sheet.getLastColumn();
  if (lastCol < SCH_HEADERS.length) {
    var addHeaders = SCH_HEADERS.slice(lastCol);
    sheet.getRange(1, lastCol + 1, 1, addHeaders.length).setValues([addHeaders]).setBackground("#4c4c4c").setFontColor("white").setFontWeight("bold");
  }
  var data = sheet.getDataRange().getValues();
  if (!data || data.length === 0) data = [SCH_HEADERS];
  var startStr = Utilities.formatDate(new Date(mondayDate), tz, "yyyy-MM-dd");
  var endDt = new Date(mondayDate);
  endDt.setDate(endDt.getDate() + 6);
  var endStr = Utilities.formatDate(endDt, tz, "yyyy-MM-dd");

  // 해당 매장/해당 주차만 제외한 나머지 행 유지 (deleteRow 반복 대신 한 번에 필터 후 재기록)
  var header = (data[0] && data[0].length >= SCH_HEADERS.length) ? data[0] : SCH_HEADERS;
  if (header.length < SCH_HEADERS.length) {
    for (var h = header.length; h < SCH_HEADERS.length; h++) header.push(SCH_HEADERS[h]);
  }
  var kept = [];
  for (var i = 1; i < data.length; i++) {
    var rowDateStr = toScheduleDateStr(data[i][0], tz);
    var rowStore = String(data[i][1] || "").trim();
    var isTargetWeek = rowStore === storeName && rowDateStr && rowDateStr >= startStr && rowDateStr <= endStr;
    if (!isTargetWeek) {
      var row = data[i].slice ? data[i].slice() : data[i];
      while (row.length < SCH_HEADERS.length) row.push("");
      kept.push(row);
    }
  }

  // 새로 저장할 행 추가
  var writtenAt = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm");
  var rowsToAdd = scheduleArray.map(function(s) {
    return [
      String(s.date || "").substring(0, 10),
      storeName,
      s.name,
      s.pIn || "09:00",
      s.pOut || "18:00",
      s.pBS || "",
      s.pBE || "",
      "스마트스케줄러",
      writtenAt
    ];
  });
  var allRows = kept.concat(rowsToAdd);

  // 헤더 + 데이터 한 번에 기록 (getRange: 시작행, 시작열, 행개수, 열개수)
  var numCols = SCH_HEADERS.length;
  sheet.getRange(1, 1, 1, numCols).setValues([header]).setBackground("#4c4c4c").setFontColor("white").setFontWeight("bold");
  if (allRows.length > 0) {
    sheet.getRange(2, 1, allRows.length, numCols).setValues(allRows);
  }
  var totalDataRows = 1 + allRows.length;
  var lastRow = sheet.getLastRow();
  if (lastRow > totalDataRows) {
    sheet.getRange(totalDataRows + 1, 1, lastRow, numCols).clearContent();
  }
  return "✅ " + storeName + " 주간 시간표가 저장되었습니다!";
}

/* ========== 편집기에서 실행 시 결과 확인용 (실행 후 [보기] → [실행 로그] 또는 [실행 기록]에서 확인) ========== */
/** 테스트: 명세서 이메일 발송 실행 + 결과를 로그에 출력 (실제 발송됨 - 매개변수 수정 후 실행) */
function testSendPayrollEmail() {
  var monthStr = "2026-02";
  var store = "Ekkamai";
  var name = "Ms. Surangkhana manisang";
  var res = sendPayrollStatementEmail(monthStr, store, name);
  Logger.log("=== sendPayrollStatementEmail 결과 ===");
  Logger.log(JSON.stringify(res, null, 2));
  return res;
}

/** 테스트: 아무 함수나 실행해 보고 반환값을 로그에 출력 (실제 발송 안 함) */
function testRunAndShowResult() {
  var monthStr = "2026-02";
  var res = getPayrollFromDB(monthStr);
  Logger.log("=== getPayrollFromDB 결과 ===");
  Logger.log("success: " + res.success);
  Logger.log("list 개수: " + (res.list ? res.list.length : 0));
  if (res.list && res.list.length > 0) {
    Logger.log("첫 번째 행: " + JSON.stringify(res.list[0], null, 2));
  }
  return res;
}
