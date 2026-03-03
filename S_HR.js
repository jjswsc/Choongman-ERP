/* =================================================================
   인사 관리: 직원, 급여, 휴가, 근태
   ================================================================= */

   /* =================================================================
   직원/급여
   ================================================================= */

   /* [F] 직원 관리 (Supabase employees) */
function getAdminEmployeeList(userStore, userRole) {
  try {
    var rows = supabaseSelect('employees', { order: 'id.asc' });
    var role = String(userRole || '').toLowerCase();
    var isOfficeStore = function(st) { var x = String(st || "").trim(); return x === "본사" || x === "Office" || x === "오피스" || x.toLowerCase() === "office"; };
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.store && !r.name) continue;
      var empStore = String(r.store || '').trim();
      var include = false;
      if (role.includes('director')) include = true;
      else if (role.includes('officer')) { if (!isOfficeStore(empStore)) include = true; }
      else if (role.includes('manager')) { if (!isOfficeStore(empStore)) include = true; }
      else { if (empStore === String(userStore || '').trim()) include = true; }
      if (!include) continue;
      var birthStr = r.birth ? (typeof r.birth === 'string' ? r.birth.slice(0, 10) : Utilities.formatDate(new Date(r.birth), "GMT+7", "yyyy-MM-dd")) : "";
      var joinStr = r.join_date ? (typeof r.join_date === 'string' ? r.join_date.slice(0, 10) : Utilities.formatDate(new Date(r.join_date), "GMT+7", "yyyy-MM-dd")) : "";
      var resignStr = r.resign_date ? (typeof r.resign_date === 'string' ? r.resign_date.slice(0, 10) : Utilities.formatDate(new Date(r.resign_date), "GMT+7", "yyyy-MM-dd")) : "";
      list.push({
        row: r.id, store: empStore, name: r.name, nick: r.nick || "", phone: r.phone || "", job: r.job || "",
        birth: birthStr, nation: r.nation || "", join: joinStr, resign: resignStr,
        salType: r.sal_type || "Monthly", salAmt: r.sal_amt || 0, pw: r.password, role: r.role || "Staff", email: r.email || "",
        idNumber: (r.id_number != null ? String(r.id_number).trim() : "") || "",
        address: (r.address != null ? String(r.address).trim() : "") || "",
        bankName: (r.bank_name != null ? String(r.bank_name).trim() : "") || "",
        accountNumber: (r.account_number != null ? String(r.account_number).trim() : "") || "",
        positionAllowance: (r.position_allowance != null ? Number(r.position_allowance) : 0) || 0,
        grade: (r.grade != null && r.grade !== "") ? String(r.grade).trim() : "",
        photo: (r.photo != null && r.photo !== "") ? String(r.photo).trim() : ""
      });
    }
    return list;
  } catch (e) {
    Logger.log('getAdminEmployeeList: ' + e.message);
    return [];
  }
}

/** 매장별 직원 이름 목록 (Supabase employees). store = 매장명, 반환 [{ name, store }] */
function getEmployeeNamesByStore(store) {
  if (!store) return [];
  try {
    var filter = "store=ilike." + encodeURIComponent(String(store).trim());
    var rows = supabaseSelectFilter('employees', filter);
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var name = String(rows[i].name || '').trim();
      if (name) list.push({ name: name, store: rows[i].store });
    }
    return list;
  } catch (e) {
    Logger.log('getEmployeeNamesByStore: ' + e.message);
    return [];
  }
}

/** 이름에서 Mr./Ms./Mrs. 접두사 제거 (매칭용) */
function normalizeNameForGradeMatch(name) {
  if (!name || typeof name !== "string") return "";
  var s = String(name).trim().replace(/\s+/g, " ");
  return s.replace(/^(Mr\.?|Ms\.?|Mrs\.?)\s*/i, "").trim() || s;
}

/** 직원별 최신 평가 등급 (Supabase evaluation_results 주방+서비스에서 매장+이름 기준 최신 1건) */
function getEmployeeLatestGrades() {
  var out = {};
  try {
    ["kitchen", "service"].forEach(function(type) {
      var rows = supabaseSelectFilter("evaluation_results", "eval_type=eq." + encodeURIComponent(type), { order: "eval_date.desc", limit: 2000 });
      for (var i = 0; i < (rows || []).length; i++) {
        var row = rows[i];
        var store = String(row.store_name || "").trim().replace(/\s+/g, " ");
        var name = String(row.employee_name || "").trim().replace(/\s+/g, " ");
        var grade = row.final_grade ? String(row.final_grade).trim() : "";
        var dateVal = row.eval_date ? new Date(row.eval_date) : null;
        if (!store || !name) continue;
        var key = store + "|" + name;
        var existing = out[key];
        var info = { grade: grade, date: dateVal };
        if (!existing || !existing.date || (dateVal && new Date(dateVal) > new Date(existing.date))) {
          out[key] = info;
          var nameNorm = normalizeNameForGradeMatch(name);
          if (nameNorm && nameNorm !== name) {
            var keyNorm = store + "|" + nameNorm;
            if (!out[keyNorm] || (dateVal && new Date(dateVal) > new Date((out[keyNorm].date || 0)))) out[keyNorm] = info;
          }
        }
      }
    });
    var empList = supabaseSelect('employees', { order: 'id.asc' });
    for (var e = 0; e < empList.length; e++) {
      var empStore = String(empList[e].store || "").trim().replace(/\s+/g, " ");
      var empName = String(empList[e].name || "").trim().replace(/\s+/g, " ");
      var empNick = String(empList[e].nick || "").trim().replace(/\s+/g, " ");
      if (!empStore || !empName) continue;
      var keyName = empStore + "|" + empName;
      var keyNick = empNick && empNick !== empName ? empStore + "|" + empNick : "";
      var info = out[keyName] || out[empStore + "|" + normalizeNameForGradeMatch(empName)];
      if (info && keyNick && !out[keyNick]) out[keyNick] = info;
      if (info && !out[keyName]) out[keyName] = info;
    }
  } catch (err) { Logger.log('getEmployeeLatestGrades: ' + (err && err.message)); }
  return out;
}

function saveAdminEmployee(d, userStore, userRole) {
  var role = String(userRole || "").toLowerCase();
  var isTop = role.indexOf("director") !== -1 || role.indexOf("officer") !== -1 || role.indexOf("ceo") !== -1 || role.indexOf("hr") !== -1;
  if (!isTop && userStore) {
    var empStore = String(d.store || "").trim();
    if (empStore !== String(userStore).trim()) return "❌ 해당 매장 직원만 수정할 수 있습니다.";
  }
  try {
    var payload = {
      store: String(d.store || '').trim(),
      name: String(d.name || '').trim(),
      nick: String(d.nick || '').trim(),
      phone: String(d.phone || '').trim(),
      job: String(d.job || '').trim(),
      birth: d.birth && String(d.birth).trim() ? String(d.birth).trim().slice(0, 10) : null,
      nation: String(d.nation || '').trim(),
      join_date: d.join && String(d.join).trim() ? String(d.join).trim().slice(0, 10) : null,
      resign_date: d.resign && String(d.resign).trim() ? String(d.resign).trim().slice(0, 10) : null,
      sal_type: String(d.salType || 'Monthly').trim(),
      sal_amt: Number(d.salAmt) || 0,
      password: String(d.pw || '').trim(),
      role: String(d.role || 'Staff').trim(),
      email: String(d.email || '').trim(),
      annual_leave_days: null,
      id_number: (d.idNumber != null ? String(d.idNumber).trim() : "") || "",
      address: (d.address != null ? String(d.address).trim() : "") || "",
      bank_name: (d.bankName != null ? String(d.bankName).trim() : "") || "",
      account_number: (d.accountNumber != null ? String(d.accountNumber).trim() : "") || "",
      position_allowance: (d.positionAllowance != null ? Number(d.positionAllowance) : 0) || 0,
      grade: (d.grade != null ? String(d.grade).trim() : "") || "",
      photo: (d.photo != null ? String(d.photo).trim() : "")
    };
    if (Number(d.row) == 0) {
      supabaseInsert('employees', payload);
      return "✅ 신규 직원이 등록되었습니다.";
    } else {
      supabaseUpdate('employees', Number(d.row), payload);
      return "✅ 직원 정보가 수정되었습니다.";
    }
  } catch (e) {
    Logger.log('saveAdminEmployee: ' + e.message);
    return "❌ 오류: " + e.message;
  }
}

function deleteAdminEmployee(r, userStore, userRole) {
  var rowId = Number(r);
  if (!rowId) return "❌ 잘못된 행 번호";
  try {
    var role = String(userRole || "").toLowerCase();
    var isTop = role.indexOf("director") !== -1 || role.indexOf("officer") !== -1 || role.indexOf("ceo") !== -1 || role.indexOf("hr") !== -1;
    if (!isTop && userStore) {
      var rows = supabaseSelectFilter('employees', "id=eq." + rowId);
      if (rows && rows.length > 0 && String(rows[0].store || '').trim() !== String(userStore).trim())
        return "❌ 해당 매장 직원만 삭제할 수 있습니다.";
    }
    supabaseDelete('employees', rowId);
    return "🗑️ 삭제 완료";
  } catch (e) {
    Logger.log('deleteAdminEmployee: ' + e.message);
    return "❌ 오류: " + e.message;
  }
}

/* =================================================================
   직원 평가 (주방 / 서비스)
   ================================================================= */
var EVAL_SHEET_ITEMS = { kitchen: "평가항목_주방", service: "평가항목_서비스" };
var EVAL_SHEET_RESULT = { kitchen: "평가결과_주방", service: "평가결과_서비스" };

function ensureEvaluationSheets(type) {
  return;
}

function getEvaluationItems(type, activeOnly) {
  var list = [];
  try {
    var filter = "eval_type=eq." + encodeURIComponent(type || "kitchen");
    if (activeOnly) filter += "&use_flag=eq.true";
    var rows = supabaseSelectFilter("evaluation_items", filter, { order: "sort_order.asc,item_id.asc" });
    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i];
      list.push({
        id: r.item_id,
        main: r.main_cat || "",
        sub: r.sub_cat || "",
        name: r.name || "",
        use: r.use_flag
      });
    }
  } catch (e) {
    Logger.log("getEvaluationItems: " + e.message);
  }
  return list;
}

function updateEvaluationItems(type, updates) {
  for (var u = 0; u < updates.length; u++) {
    var up = updates[u];
    try {
      var updateData = {
        main_cat: String(up.main != null ? up.main : "").trim(),
        sub_cat: String(up.sub != null ? up.sub : "").trim(),
        name: String(up.name != null ? up.name : "").trim(),
        use_flag: (up.use === true || up.use === 1 || up.use === "1" || String(up.use).toLowerCase() === "y")
      };
      if (up.sort_order != null) updateData.sort_order = Number(up.sort_order) || 0;
      supabaseUpdateByFilter("evaluation_items", "eval_type=eq." + encodeURIComponent(type) + "&item_id=eq." + encodeURIComponent(String(up.id)), updateData);
    } catch (e) {
      Logger.log("updateEvaluationItems: " + e.message);
    }
  }
  return "SUCCESS";
}

function addEvaluationItem(type, mainCat, subCat, itemName) {
  var typeVal = type || "kitchen";
  var maxId = 0;
  try {
    var rows = supabaseSelectFilter("evaluation_items", "eval_type=eq." + encodeURIComponent(typeVal), { order: "item_id.desc", limit: 1 });
    if (rows && rows.length > 0 && rows[0].item_id) maxId = Number(rows[0].item_id) || 0;
  } catch (e) {}
  try {
    supabaseInsert("evaluation_items", {
      eval_type: typeVal,
      item_id: maxId + 1,
      main_cat: String(mainCat || "").trim(),
      sub_cat: String(subCat || "").trim(),
      name: String(itemName || "(새 항목)").trim(),
      use_flag: true,
      sort_order: maxId + 1
    });
    return "SUCCESS";
  } catch (e) {
    return "ERROR: " + e.message;
  }
}

function deleteEvaluationItem(type, id) {
  try {
    var rows = supabaseSelectFilter("evaluation_items", "eval_type=eq." + encodeURIComponent(type) + "&item_id=eq." + encodeURIComponent(String(id)), { limit: 1 });
    if (rows && rows.length > 0 && rows[0].id) {
      supabaseDelete("evaluation_items", rows[0].id);
      return "SUCCESS";
    }
  } catch (e) {
    Logger.log("deleteEvaluationItem: " + e.message);
  }
  return "ERROR: 항목 없음";
}

function saveEvaluationResult(type, id, date, store, employeeName, evaluator, finalGrade, memo, jsonData) {
  var dateStr = (date && (date instanceof Date || typeof date === "object")) ? new Date(date).toISOString().slice(0, 10) : String(date || "").trim().slice(0, 10);
  if (!dateStr || dateStr.length < 10) return "ERROR: 날짜 형식";
  var typeVal = type || "kitchen";
  if (id) {
    try {
      var existing = supabaseSelectFilter("evaluation_results", "id=eq." + encodeURIComponent(String(id)), { limit: 1 });
      if (existing && existing.length > 0) {
        supabaseUpdateByFilter("evaluation_results", "id=eq." + encodeURIComponent(String(id)), {
          eval_date: dateStr,
          store_name: String(store || "").trim(),
          employee_name: String(employeeName || "").trim(),
          evaluator: String(evaluator || "").trim(),
          final_grade: String(finalGrade || "").trim(),
          memo: String(memo || "").trim(),
          json_data: String(jsonData || "").trim()
        });
        updateEmployeeGradeInSupabase(store, employeeName, finalGrade);
        return "UPDATED";
      }
    } catch (e) {
      Logger.log("saveEvaluationResult update: " + e.message);
    }
  }
  var newId = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMddHHmmss") + "_" + String(store || "").trim() + "_" + (String(employeeName || "").trim().replace(/\s/g, ""));
  try {
    supabaseInsert("evaluation_results", {
      id: newId,
      eval_type: typeVal,
      eval_date: dateStr,
      store_name: String(store || "").trim(),
      employee_name: String(employeeName || "").trim(),
      evaluator: String(evaluator || "").trim(),
      final_grade: String(finalGrade || "").trim(),
      memo: String(memo || "").trim(),
      json_data: String(jsonData || "").trim()
    });
    updateEmployeeGradeInSupabase(store, employeeName, finalGrade);
    return "SAVED";
  } catch (e) {
    return "ERROR: " + e.message;
  }
}

function updateEmployeeGradeInSupabase(store, employeeName, finalGrade) {
  try {
    var rows = supabaseSelectFilter("employees", "store=eq." + encodeURIComponent(String(store || "").trim()) + "&name=eq." + encodeURIComponent(String(employeeName || "").trim()), { limit: 1 });
    if (rows && rows.length > 0) {
      supabaseUpdate("employees", rows[0].id, { grade: String(finalGrade || "").trim() });
    }
  } catch (e) {}
}

function updateEmployeeGradeInSheet(ss, store, employeeName, finalGrade) {
  updateEmployeeGradeInSupabase(store, employeeName, finalGrade);
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
  var typeVal = type || "kitchen";
  var filters = ["eval_type=eq." + encodeURIComponent(typeVal)];
  if (startStr) filters.push("eval_date=gte." + String(startStr).substring(0, 10));
  if (endStr) filters.push("eval_date=lte." + String(endStr).substring(0, 10));
  if (filterStore && filterStore !== "All") filters.push("store_name=eq." + encodeURIComponent(filterStore));
  if (filterEmployee && filterEmployee !== "All" && filterEmployee !== "") filters.push("employee_name=eq." + encodeURIComponent(filterEmployee));
  if (filterEvaluator && filterEvaluator !== "All" && filterEvaluator !== "") filters.push("evaluator=eq." + encodeURIComponent(filterEvaluator));
  var list = [];
  try {
    var rows = supabaseSelectFilter("evaluation_results", filters.join("&"), { order: "eval_date.desc", limit: 2000 });
    for (var i = 0; i < (rows || []).length; i++) {
      var row = rows[i];
      var store = String(row.store_name || "").trim();
      var employee = String(row.employee_name || "").trim();
      var evaluator = String(row.evaluator || "").trim();
      var dateStr = String(row.eval_date || "").substring(0, 10);
      var jsonData = row.json_data;
      var totalScore = "";
      if (jsonData) {
        try {
          var parsed = typeof jsonData === "string" ? JSON.parse(jsonData) : jsonData;
          if (parsed && parsed.totalScore != null) totalScore = String(parsed.totalScore);
        } catch (e) {}
      }
      list.push({
        id: String(row.id || ""),
        date: dateStr,
        store: store,
        employeeName: employee,
        evaluator: evaluator,
        finalGrade: String(row.final_grade || ""),
        totalScore: totalScore,
        memo: String(row.memo || ""),
        jsonData: row.json_data
      });
    }
  } catch (e) {
    Logger.log("getEvaluationHistoryOne: " + e.message);
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

/* 급여 계산용 매장 목록 (Supabase employees의 store 유일값). userRole이 C.E.O/HR이 아니면 Office/본사/오피스 제외 */
function getPayrollStoreList(userRole) {
  var empData = typeof getEmployeesData === 'function' ? getEmployeesData() : [];
  var set = {};
  for (var i = 0; i < empData.length; i++) {
    var st = String(empData[i].store || '').trim();
    if (st) set[st] = true;
  }
  var list = Object.keys(set);
  var roleStr = (userRole != null && userRole !== undefined) ? String(userRole).trim().toUpperCase() : "";
  var canSeeOffice = (roleStr === "DIRECTOR");
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

/** 직원시간표(Supabase schedules)에서 해당 월·매장·이름의 계획 근무시간 합계(분) */
function getPlannedMinutesForMonth(monthStr, store, name) {
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok";
  var startStr = monthStr + "-01";
  var firstDay = new Date(monthStr + "-01");
  var lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0);
  var endStr = Utilities.formatDate(lastDay, tz, "yyyy-MM-dd");
  var data = getSchedulesData();
  var totalMin = 0;
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var rowDateStr = (typeof row[0] === "string") ? row[0].slice(0, 10) : toAttendanceDateStr(row[0], tz);
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

/** 해당 일자의 계획 근무시간(분). Supabase schedules */
function getPlannedMinutesForDay(dateStr, store, name) {
  var data = getSchedulesData();
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var rowDateStr = (typeof row[0] === "string") ? row[0].slice(0, 10) : toAttendanceDateStr(row[0], SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok");
    if (!rowDateStr || rowDateStr !== dateStr) continue;
    if (String(row[1] || "").trim() !== String(store).trim() || String(row[2] || "").trim() !== String(name).trim()) continue;
    var minIn = timeToMinutes(row[3], dateStr);
    var minOut = timeToMinutes(row[4], dateStr);
    var minBS = timeToMinutes(row[5], dateStr);
    var minBE = timeToMinutes(row[6], dateStr);
    if (minIn == null || minOut == null || minOut <= minIn) return 0;
    var work = minOut - minIn;
    if (minBS != null && minBE != null && minBE > minBS) work -= (minBE - minBS);
    return Math.max(0, work);
  }
  return 0;
}

/** 해당 일자의 계획 퇴근 시각(Date). 강제 퇴근 기록용. 없으면 null (Supabase schedules) */
function getPlannedOutDateTime(dateStr, store, name) {
  var data = getSchedulesData();
  var dateStrNorm = (dateStr || "").trim().substring(0, 10);
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var rowDateStr = (typeof row[0] === "string") ? row[0].slice(0, 10) : toAttendanceDateStr(row[0], SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok");
    if (!rowDateStr || rowDateStr !== dateStrNorm) continue;
    if (String(row[1] || "").trim() !== String(store).trim() || String(row[2] || "").trim() !== String(name).trim()) continue;
    var planOut = row[4];
    if (!planOut) return null;
    return parsePlanTimeToDate(dateStrNorm, planOut);
  }
  return null;
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

/** 근태기록 Supabase → 시트와 동일한 [행 배열] 형태. 반환: [[log_at, store_name, name, ... , approved], id] 즉 row[14]=id (승인 시 사용) */
function getAttendanceLogsData() {
  try {
    var rows = supabaseSelect('attendance_logs', { order: 'log_at.asc' });
    var out = [];
    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i];
      out.push([
        r.log_at ? new Date(r.log_at) : null,
        r.store_name || "",
        r.name || "",
        r.log_type || "",
        r.lat || "",
        r.lng || "",
        r.planned_time || "",
        Number(r.late_min) || 0,
        Number(r.early_min) || 0,
        Number(r.ot_min) || 0,
        Number(r.break_min) || 0,
        r.reason || "",
        r.status || "",
        r.approved || "",
        r.id
      ]);
    }
    return out;
  } catch (e) {
    Logger.log('getAttendanceLogsData: ' + e.message);
    return [];
  }
}

/** 직원시간표 Supabase → 시트와 동일한 [행 배열]. [[schedule_date, store_name, name, plan_in, plan_out, break_start, break_end, memo], id]. row[8]=id. schedule_date는 타임존 적용 yyyy-MM-dd */
function getSchedulesData() {
  try {
    var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok";
    var rows = supabaseSelect('schedules', { order: 'schedule_date.asc' });
    var out = [];
    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i];
      var dateStr = toScheduleDateStr(r.schedule_date, tz) || (typeof r.schedule_date === "string" ? r.schedule_date.substring(0, 10) : "");
      out.push([
        dateStr,
        r.store_name || "",
        r.name || "",
        r.plan_in || "",
        r.plan_out || "",
        r.break_start || "",
        r.break_end || "",
        r.memo || "",
        r.id
      ]);
    }
    return out;
  } catch (e) {
    Logger.log('getSchedulesData: ' + e.message);
    return [];
  }
}

/** 근태기록에서 귀속월별 지각(분)·승인된 연장(분)·실근무(분) 집계 (급여 자동 반영용). Supabase attendance_logs 사용 */
function getAttendanceSummaryForPayroll(monthStr) {
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok";
  var startStr = monthStr + "-01";
  var firstDay = new Date(monthStr + "-01");
  var lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0);
  var endStr = Utilities.formatDate(lastDay, tz, "yyyy-MM-dd");

  var data = getAttendanceLogsData();
  var map = {};
  var byDay = {};
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;
    var rowDateStr = toAttendanceDateStr(row[0], tz);
    if (!rowDateStr || rowDateStr < startStr || rowDateStr > endStr) continue;

    var store = String(row[1] || "").trim();
    var name = String(row[2] || "").trim();
    if (!store || !name) continue;
    var key = store + "_" + name;
    if (!map[key]) map[key] = { lateMin: 0, otMin: 0, workMin: 0 };
    var dayKey = rowDateStr + "_" + key;
    if (!byDay[dayKey]) byDay[dayKey] = { inMs: null, outMs: null, breakMin: 0 };

    var type = String(row[3] || "").trim();
    var approval = String(row[13] || "").trim();
    var status = String(row[12] || "").trim();
    var isApproved = (approval === "승인" || approval === "승인완료");
    var needsApproval = (status.indexOf("위치미확인") !== -1 || status.indexOf("승인대기") !== -1);
    var dt = row[0] instanceof Date ? row[0].getTime() : (new Date(row[0])).getTime();

    if (type === "출근") {
      if (!needsApproval || isApproved) map[key].lateMin += Number(row[7]) || 0;
      if (!byDay[dayKey].inMs || dt < byDay[dayKey].inMs) byDay[dayKey].inMs = dt;
    } else if (type === "퇴근") {
      if (!byDay[dayKey].outMs || dt > byDay[dayKey].outMs) {
        byDay[dayKey].outMs = dt;
        byDay[dayKey].breakMin = Number(row[10]) || 0;
        byDay[dayKey].outApproved = isApproved;
        byDay[dayKey].otMin = Number(row[9]) || 0;  // 연장(분) - 승인된 퇴근 건만 집계 시 사용
      }
    }
  }
  for (var dk in byDay) {
    var v = byDay[dk];
    if (v.inMs != null && v.outMs != null && v.outApproved && v.outMs > v.inMs) {
      var storeName = dk.substring(11);
      if (!map[storeName]) map[storeName] = { lateMin: 0, otMin: 0, workMin: 0 };
      var minWork = Math.max(0, Math.floor((v.outMs - v.inMs) / 60000) - (v.breakMin || 0));
      map[storeName].workMin += minWork;
      map[storeName].otMin += (v.otMin != null ? Number(v.otMin) : 0) || 0;  // 승인된 퇴근의 연장분 합산
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
  try {
    var rows = supabaseSelectFilter('public_holidays', "year=eq." + y, { order: 'date.asc' });
    if (rows && rows.length > 0) {
      var list = [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var dateStr = r.date ? (typeof r.date === 'string' ? r.date.slice(0, 10) : Utilities.formatDate(new Date(r.date), "Asia/Bangkok", "yyyy-MM-dd")) : "";
        if (!dateStr) continue;
        var item = { date: dateStr, name: String(r.name || '').trim() || "-" };
        if (withRows) item.rowIndex = r.id;
        list.push(item);
      }
      if (list.length > 0) return { list: list };
    }
  } catch (e) { Logger.log('getPublicHolidaysInternal: ' + e.message); }
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

/** 공휴일 한 행 추가 (Supabase public_holidays) */
function addPublicHoliday(year, dateStr, name) {
  var y = parseInt(year, 10);
  var d = String(dateStr || "").trim().substring(0, 10);
  var n = String(name || "").trim() || "-";
  if (!d || d.length < 10) return "❌ 날짜를 yyyy-MM-dd 형식으로 입력해주세요.";
  try {
    supabaseInsert('public_holidays', { year: y, date: d, name: n });
    return "✅ 공휴일이 추가되었습니다.";
  } catch (e) {
    Logger.log('addPublicHoliday: ' + e.message);
    return "❌ 추가 실패: " + e.message;
  }
}

/** 공휴일 한 행 수정 (rowIndex = public_holidays.id) */
function updatePublicHoliday(rowIndex, year, dateStr, name) {
  var id = parseInt(rowIndex, 10);
  if (!id) return "❌ 잘못된 행 번호입니다.";
  var y = parseInt(year, 10);
  var d = String(dateStr || "").trim().substring(0, 10);
  var n = String(name || "").trim() || "-";
  if (!d || d.length < 10) return "❌ 날짜를 yyyy-MM-dd 형식으로 입력해주세요.";
  try {
    supabaseUpdate('public_holidays', id, { year: y, date: d, name: n });
    return "✅ 수정되었습니다.";
  } catch (e) {
    Logger.log('updatePublicHoliday: ' + e.message);
    return "❌ 수정 실패: " + e.message;
  }
}

/** 공휴일 한 행 삭제 (rowIndex = public_holidays.id) */
function deletePublicHoliday(rowIndex) {
  var id = parseInt(rowIndex, 10);
  if (!id) return "❌ 잘못된 행 번호입니다.";
  try {
    supabaseDelete('public_holidays', id);
    return "✅ 삭제되었습니다.";
  } catch (e) {
    Logger.log('deletePublicHoliday: ' + e.message);
    return "❌ 삭제 실패: " + e.message;
  }
}

/** 해당 월·직원이 공휴일에 근무한 일수 (Supabase attendance_logs). 공휴일 1일 근무 = 일당 추가(2배). */
function getHolidayWorkDaysInMonth(monthStr, store, name) {
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok";
  var startStr = monthStr + "-01";
  var firstDay = new Date(monthStr + "-01");
  var lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0);
  var endStr = Utilities.formatDate(lastDay, tz, "yyyy-MM-dd");
  var year = firstDay.getFullYear();
  var holidays = getPublicHolidays(year);
  var holidaySet = {};
  (holidays || []).forEach(function(h) {
    if (h.date >= startStr && h.date <= endStr) holidaySet[h.date] = true;
  });
  var data = getAttendanceLogsData();
  var workDates = {};
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][1] || "").trim() !== String(store).trim() || String(data[i][2] || "").trim() !== String(name).trim()) continue;
    var type = String(data[i][3] || "").trim();
    if (type !== "출근" && type !== "퇴근") continue;
    var st = String(data[i][12] || "").trim();
    var app = String(data[i][13] || "").trim();
    var needApp = (st.indexOf("위치미확인") !== -1 || st.indexOf("승인대기") !== -1);
    if (needApp && app !== "승인" && app !== "승인완료") continue;
    var rowDateStr = toAttendanceDateStr(data[i][0], tz);
    if (rowDateStr && rowDateStr >= startStr && rowDateStr <= endStr) workDates[rowDateStr] = true;
  }
  var count = 0;
  for (var d in workDates) { if (holidaySet[d]) count++; }
  return count;
}

/* 2. [계산] 급여 미리보기 - 직원정보 Supabase, 근태/공휴일 Supabase 반영 */
function calculatePayrollPreview(monthStr, storeFilter, userRole) {
  var empData = typeof getEmployeesData === 'function' ? getEmployeesData() : [];
  if (!empData.length) return { success: false, msg: "'직원정보'가 비어 있습니다." };

  var attSummary = getAttendanceSummaryForPayroll(monthStr);
  var list = [];
  var storeFilterStr = (storeFilter != null && storeFilter !== undefined) ? String(storeFilter).trim() : "";
  var isAll = (storeFilterStr === "" || storeFilterStr === "All" || storeFilterStr === "전체");
  var isOffice = (storeFilterStr === "Office" || storeFilterStr === "오피스" || storeFilterStr === "본사" || storeFilterStr.toLowerCase() === "office");
  var roleStr = (userRole != null && userRole !== undefined) ? String(userRole).trim().toUpperCase() : "";
  var canSeeOffice = (roleStr === "DIRECTOR");

  if (isOffice && !canSeeOffice) return { success: true, list: [] };

  var targetDate = new Date(monthStr + "-01");
  var targetMonth = targetDate.getMonth();

  for (var i = 0; i < empData.length; i++) {
    var e = empData[i];
    if (!e.name) continue;

    var store = e.store;
    var name = e.name;
    var dept = (e.job != null && e.job !== undefined) ? String(e.job).trim() : "";
    
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
    
    var role = e.role || "";
    var salType = String(e.sal_type || "").trim().toLowerCase();
    var isHourly = (salType === "시급" || salType === "hourly" || salType === "hour" || salType === "part-time" || salType === "part time");
    var salAmt = Number(e.sal_amt) || 0;
    var salary = salAmt;
    var posAllow = (e.position_allowance != null ? Number(e.position_allowance) : 0) || 0;  // 직책수당 (employees.position_allowance)

    var joinDate = (e.join_date ? new Date(e.join_date) : null) || new Date();

    var hazAllow = 0;
    var birthBonus = 0;
    if (e.birth) {
       var birth = new Date(e.birth);
       var workYears = (targetDate - joinDate) / (1000 * 60 * 60 * 24 * 365);
       if(birth.getMonth() === targetMonth && workYears >= 1) birthBonus = 500;
    }

    var attKey = store + "_" + name;
    var lateMin = 0, lateDed = 0, ot15 = 0, ot20 = 0, ot30 = 0, otAmt = 0;
    var workMin = (attSummary[attKey] && attSummary[attKey].workMin != null) ? attSummary[attKey].workMin : 0;

    if (isHourly) {
      // 시급: 기본급 = 근무시간×시급, 지각 공제 = 지각분×시급, OT = 연장분×시급×1.5
      var hourlyRate = salAmt;
      salary = (hourlyRate > 0 && workMin > 0) ? Math.floor((workMin / 60) * hourlyRate) : 0;
      if (attSummary[attKey]) {
        lateMin = attSummary[attKey].lateMin || 0;
        lateDed = (hourlyRate > 0 && lateMin > 0) ? Math.floor((lateMin / 60) * hourlyRate) : 0;
        var otMin = attSummary[attKey].otMin || 0;
        ot15 = Math.round((otMin / 60) * 10) / 10;
        otAmt = (hourlyRate > 0 && otMin > 0) ? Math.floor((otMin / 60) * hourlyRate * (typeof OT_MULTIPLIER !== "undefined" ? OT_MULTIPLIER : 1.5)) : 0;
      }
    } else {
      // 월급: 208시간 기준 시급으로 지각 공제·OT 1.5배
      salary = salAmt;
      var hoursBase = (typeof LATE_DED_HOURS_BASE !== "undefined" ? LATE_DED_HOURS_BASE : 208);
      if (attSummary[attKey]) {
        lateMin = attSummary[attKey].lateMin || 0;
        lateDed = hoursBase > 0 && salary ? Math.floor((lateMin / 60) * (salary / hoursBase)) : 0;
        var otMin = attSummary[attKey].otMin || 0;
        ot15 = Math.round((otMin / 60) * 10) / 10;
        var hourlyRateForOt = (hoursBase > 0 && salary) ? (salary / hoursBase) : 0;
        otAmt = (hourlyRateForOt > 0) ? Math.floor((otMin / 60) * hourlyRateForOt * (typeof OT_MULTIPLIER !== "undefined" ? OT_MULTIPLIER : 1.5)) : 0;
      }
    }

    // C. 공제 - SSO (연도별 상한·최대공제. 시급은 당월 소득 기준)
    var payrollYear = targetDate.getFullYear();
    var ssoLimits = getSSOLimitsByYear(payrollYear);
    var contributable = Math.min(salary, ssoLimits.ceiling);
    var sso = Math.min(Math.floor(contributable * 0.05), ssoLimits.maxDed);

    // E. 공휴일 근무 수당 (월급=일당×일수, 시급=시급×8시간×2배×일수)
    var holidayWorkDays = getHolidayWorkDaysInMonth(monthStr, store, name);
    var holidayPay = 0;
    if (holidayWorkDays > 0) {
      if (isHourly && salAmt > 0) holidayPay = Math.floor(holidayWorkDays * 8 * salAmt * 2);
      else if (salary > 0) holidayPay = Math.floor((salary / 30) * holidayWorkDays);
    }

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

/* 3. [저장] 급여 DB (Supabase payroll_records) - month, store, name 기준 upsert */
function savePayrollToDB(monthStr, jsonList) {
  var newData = JSON.parse(jsonList);
  if (!newData || newData.length === 0) return "❌ 저장할 데이터가 없습니다.";
  var normMonth = (monthStr && String(monthStr).trim()) ? String(monthStr).trim().substring(0, 7) : "";
  if (!normMonth) return "❌ 귀속월을 선택해주세요.";
  var rows = [];
  for (var i = 0; i < newData.length; i++) {
    var r = newData[i];
    rows.push({
      month: normMonth,
      store: String(r.store || "").trim(),
      name: String(r.name || "").trim(),
      dept: String(r.dept || "").trim(),
      role: String(r.role || "").trim(),
      salary: Number(r.salary) || 0,
      pos_allow: Number(r.posAllow) || 0,
      haz_allow: Number(r.hazAllow) || 0,
      birth_bonus: Number(r.birthBonus) || 0,
      holiday_pay: Number(r.holidayPay) != null ? Number(r.holidayPay) : 0,
      spl_bonus: Number(r.splBonus) || 0,
      ot_15: Number(r.ot15) || 0,
      ot_20: Number(r.ot20) || 0,
      ot_30: Number(r.ot30) || 0,
      ot_amt: Number(r.otAmt) || 0,
      late_min: Number(r.lateMin) || 0,
      late_ded: Number(r.lateDed) || 0,
      sso: Number(r.sso) || 0,
      tax: Number(r.tax) || 0,
      other_ded: Number(r.otherDed) || 0,
      net_pay: Number(r.netPay) || 0,
      status: String(r.status || "확정").trim()
    });
  }
  try {
    var CHUNK = 50;
    for (var j = 0; j < rows.length; j += CHUNK) {
      var chunk = rows.slice(j, j + CHUNK);
      supabaseUpsertMany('payroll_records', chunk, 'month,store,name');
    }
    return "✅ " + monthStr + " 급여 내역이 DB에 저장되었습니다!";
  } catch (e) {
    return "❌ 저장 실패: " + (e && e.message ? e.message : String(e));
  }
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

/* 4. [조회] 급여 DB (Supabase payroll_records) */
function getPayrollFromDB(monthStr) {
  try {
    var normMonth = (monthStr != null && String(monthStr).trim()) ? String(monthStr).trim().substring(0, 7) : "";
    if (!normMonth || normMonth.length < 7) return { success: false, msg: "조회할 월(yyyy-MM)을 선택해주세요." };

    var rows = supabaseSelectFilter('payroll_records', "month=eq." + encodeURIComponent(normMonth), { order: 'store.asc' });
    var list = [];
    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i];
      list.push({
        id: r.id, month: r.month, store: r.store, name: r.name, dept: r.dept || "", role: r.role || "",
        salary: Number(r.salary) || 0, posAllow: Number(r.pos_allow) || 0, hazAllow: Number(r.haz_allow) || 0, birthBonus: Number(r.birth_bonus) || 0,
        holidayPay: Number(r.holiday_pay) || 0, splBonus: Number(r.spl_bonus) || 0,
        ot15: Number(r.ot_15) || 0, ot20: Number(r.ot_20) || 0, ot30: Number(r.ot_30) || 0, otAmt: Number(r.ot_amt) || 0,
        lateMin: Number(r.late_min) || 0, lateDed: Number(r.late_ded) || 0,
        sso: Number(r.sso) || 0, tax: Number(r.tax) || 0, otherDed: Number(r.other_ded) || 0,
        netPay: Number(r.net_pay) || 0, status: r.status || ""
      });
    }
    return { success: true, list: list };
  } catch (err) {
    return { success: false, msg: "조회 오류: " + (err && err.message ? err.message : String(err)) };
  }
}

/** 직원 매장+이름에 해당하는 이메일 반환 (Supabase employees) */
function getEmployeeEmail(store, name) {
  var list = getEmployeesData();
  var s = String(store || "").trim(), n = String(name || "").trim();
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].store || "").trim() === s && String(list[i].name || "").trim() === n) {
      var email = String(list[i].email || "").trim();
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
  try {
    supabaseInsert('leave_requests', {
      store: String(d.store || '').trim(),
      name: String(d.name || '').trim(),
      type: String(d.type || '').trim(),
      leave_date: String(d.date || '').trim().slice(0, 10),
      reason: String(d.reason || '').trim(),
      status: '대기'
    });
    return "✅ 신청 완료";
  } catch (e) {
    Logger.log('requestLeave: ' + e.message);
    return "❌ 신청 실패: " + e.message;
  }
}

function getMyLeaveInfo(store, name) {
  try {
    var filter = "store=eq." + encodeURIComponent(String(store || '').trim()) + "&name=eq." + encodeURIComponent(String(name || '').trim());
    var rows = supabaseSelectFilter('leave_requests', filter, { order: 'leave_date.desc' });
    var history = []; var usedAnn = 0; var usedSick = 0; var thisYear = new Date().getFullYear();
    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i];
      var dateStr = r.leave_date ? (typeof r.leave_date === 'string' ? r.leave_date.slice(0, 10) : Utilities.formatDate(new Date(r.leave_date), "GMT+7", "yyyy-MM-dd")) : "";
      var status = String(r.status || '').trim(); var type = String(r.type || '').trim();
      history.push({ date: dateStr, type: type, reason: r.reason || "", status: status });
      if ((status === '승인' || status === 'Approved') && dateStr && parseInt(dateStr.slice(0, 4), 10) === thisYear) {
        var val = type.indexOf('반차') !== -1 ? 0.5 : 1.0;
        if (type.indexOf('병가') !== -1) usedSick += val; else usedAnn += val;
      }
    }
    return { history: history, stats: { usedAnn: usedAnn, usedSick: usedSick, remain: 6 - usedAnn } };
  } catch (e) {
    Logger.log('getMyLeaveInfo: ' + e.message);
    return { history: [], stats: { usedAnn: 0, usedSick: 0, remain: 6 } };
  }
}

/* [G] 휴가/거래처 */
function getLeaveAllData() {
  var users = []; var nickMap = {};
  try {
    var empList = supabaseSelect('employees', { order: 'id.asc' });
    for (var u = 0; u < empList.length; u++) {
      var s = String(empList[u].store || '').trim();
      var n = String(empList[u].name || '').trim();
      if (s && n) { var key = s + "|" + n; nickMap[key] = empList[u].nick || ""; users.push({ store: s, name: n, nick: empList[u].nick || "" }); }
    }
  } catch (e) { Logger.log('getLeaveAllData employees: ' + e.message); }
  try {
    var leaveRows = supabaseSelect('leave_requests', { order: 'leave_date.desc' });
    var leaves = [];
    for (var i = 0; i < (leaveRows || []).length; i++) {
      var r = leaveRows[i];
      var reqStore = String(r.store || '').trim();
      var reqName = String(r.name || '').trim();
      var userKey = reqStore + "|" + reqName;
      var dateStr = r.leave_date ? (typeof r.leave_date === 'string' ? r.leave_date.slice(0, 10) : Utilities.formatDate(new Date(r.leave_date), "GMT+7", "yyyy-MM-dd")) : "";
      var reqDate = (r.request_at || r.created_at) ? (typeof (r.request_at || r.created_at) === 'string' ? String(r.request_at || r.created_at).slice(0, 10) : Utilities.formatDate(new Date(r.request_at || r.created_at), "GMT+7", "yyyy-MM-dd")) : "";
      leaves.push({ row: r.id, store: reqStore, name: reqName, nick: nickMap[userKey] || "", type: r.type || "", date: dateStr, requestDate: reqDate, reason: r.reason || "", status: r.status || "" });
    }
    return { users: users, leaves: leaves };
  } catch (e) {
    Logger.log('getLeaveAllData leave_requests: ' + e.message);
    return { users: users, leaves: [] };
  }
}

function processLeaveDecision(r, d) {
  try {
    supabaseUpdate('leave_requests', Number(r), { status: String(d || '').trim() });
    return "처리됨";
  } catch (e) {
    Logger.log('processLeaveDecision: ' + e.message);
    return "❌ 처리 실패: " + e.message;
  }
}

/** [모바일 Admin] 휴가 목록 (오피스=전매장, 매니저=해당 매장만) */
function getLeaveAllDataForMobile(userStore, userRole) {
  var raw = getLeaveAllData();
  var r = String(userRole || "").toLowerCase();
  var isOffice = r.indexOf("director") !== -1 || r.indexOf("officer") !== -1 || r.indexOf("ceo") !== -1 || r.indexOf("hr") !== -1;
  var leaves = (raw.leaves || []).filter(function(l) { return isOffice || (l.store && String(l.store).trim() === String(userStore).trim()); });
  return { users: raw.users || [], leaves: leaves };
}

/** [모바일 Admin] 휴가 승인/반려 (권한: 해당 행의 매장이 본인 범위 내인지 검사). row = leave_requests.id */
function processLeaveDecisionMobile(row, decision, userStore, userRole) {
  var rowId = Number(row);
  if (!rowId) return "❌ 잘못된 행";
  try {
    var rows = supabaseSelectFilter('leave_requests', "id=eq." + rowId);
    if (!rows || rows.length === 0) return "❌ 해당 휴가 신청을 찾을 수 없습니다.";
    var rowStore = String(rows[0].store || '').trim();
    var r = String(userRole || "").toLowerCase();
    var isOffice = r.indexOf("director") !== -1 || r.indexOf("officer") !== -1 || r.indexOf("ceo") !== -1 || r.indexOf("hr") !== -1;
    if (!isOffice && String(userStore).trim() !== rowStore) return "❌ 해당 매장만 승인할 수 있습니다.";
    return processLeaveDecision(rowId, decision);
  } catch (e) {
    return "❌ " + (e.message || "처리 실패");
  }
}

/* [Code.gs 최종 수정] 휴가 통계 (직원정보·휴가신청 Supabase) */
function getLeaveStats(startStr, endStr, filterStore) {
  var empData = typeof getEmployeesData === 'function' ? getEmployeesData() : [];
  var leaveData = [];
  try {
    var leaveRows = supabaseSelect('leave_requests', { order: 'leave_date.asc' });
    for (var i = 0; i < (leaveRows || []).length; i++) {
      var r = leaveRows[i];
      leaveData.push([
        null, r.store, r.name, r.type, r.leave_date ? (typeof r.leave_date === 'string' ? r.leave_date : Utilities.formatDate(new Date(r.leave_date), "GMT+7", "yyyy-MM-dd")) : "", r.reason, r.status
      ]);
    }
  } catch (e) { Logger.log('getLeaveStats leave_requests: ' + e.message); }

  var result = [];
  
  // 조회 기간 설정
  var start = startStr ? new Date(startStr) : new Date('2000-01-01');
  var end = endStr ? new Date(endStr) : new Date('2100-12-31');
  start.setHours(0,0,0,0);
  end.setHours(23,59,59,999);

  var targetStore = filterStore ? String(filterStore).trim() : "All";

  // 직원 한 명씩 순서대로 계산 (Supabase employees 또는 시트 형식 호환)
  for (var i = 0; i < empData.length; i++) {
    var row = empData[i];
    var empStoreRaw = row.store != null ? row.store : (row[0]);
    var empStore = String(empStoreRaw || '').trim();
    var empName = String((row.name != null ? row.name : row[1]) || '').trim();
    var annualLimit = (row.annual_leave_days != null ? Number(row.annual_leave_days) : 15) || 15; 

    // 매장 필터링
    if (targetStore !== "All" && empStore !== targetStore) continue;
    if (!empName) continue;

    var usedPeriodAnnual = 0; 
    var usedPeriodSick = 0;   
    var usedTotalAnnual = 0;  
    var usedTotalSick = 0;    

    // 휴가 신청 기록 (leaveData: [ null, store, name, type, date, reason, status ])
    for (var j = 0; j < leaveData.length; j++) {
      var lName = String(leaveData[j][2] || '').trim();
      var lType = String(leaveData[j][3] || '').trim();
      var lDateRaw = leaveData[j][4];
      var lStatus = String(leaveData[j][6] || '').trim();

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
      remain: annualLimit - usedTotalAnnual // 잔여 = 직원 연차 부여일수(annual_leave_days) - 사용한 연차
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

/** 시트의 계획시간(오전/오후 또는 24h)을 해당 날짜의 Date로 변환. 파싱 실패 시 null. #NUM! 방지용 */
function parsePlanTimeToDate(dateStr, planVal) {
  if (!dateStr || planVal == null || (typeof planVal === "string" && planVal.trim() === "")) return null;
  if (planVal instanceof Date && !isNaN(planVal.getTime())) {
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    d.setHours(planVal.getHours(), planVal.getMinutes(), planVal.getSeconds(), 0);
    return d;
  }
  var s = String(planVal).trim();
  if (!s) return null;
  var h, mn, sec;
  var m = s.match(/오후\s*(\d{1,2})\s*:\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?/);
  if (m) {
    h = parseInt(m[1], 10);
    if (h !== 12) h += 12;
    mn = parseInt(m[2], 10);
    sec = m[3] ? parseInt(m[3], 10) : 0;
  } else {
    m = s.match(/오전\s*(\d{1,2})\s*:\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?/);
    if (m) {
      h = parseInt(m[1], 10);
      if (h === 12) h = 0;
      mn = parseInt(m[2], 10);
      sec = m[3] ? parseInt(m[3], 10) : 0;
    } else {
      m = s.match(/(\d{1,2})\s*:\s*(\d{1,2})(?:\s*:\s*(\d{1,2}))?/);
      if (!m) return null;
      h = parseInt(m[1], 10);
      mn = parseInt(m[2], 10);
      sec = m[3] ? parseInt(m[3], 10) : 0;
    }
  }
  var d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  d.setHours(h, mn, sec, 0);
  return isNaN(d.getTime()) ? null : d;
}

/** 분 단위 숫자 보정: NaN/Infinity면 0, 아니면 정수 */
function safeMinutes(val) {
  var n = Number(val);
  if (typeof n !== "number" || isNaN(n) || !isFinite(n)) return 0;
  return Math.floor(n);
}

/* [S_HR.gs] 근태 기록 메인 엔진 - 휴게 초과 감지 포함. 출근/퇴근/휴식시작/휴식종료는 하루 1회만 기록 가능 */
function submitAttendance(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone() || "Asia/Bangkok";
  var todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  var nowTime = new Date();

  // 0. [하루 1회 제한] 오늘 같은 유형 기록이 이미 있으면 저장하지 않음 (Supabase attendance_logs)
  var oncePerDayTypes = ["출근", "퇴근", "휴식시작", "휴식종료"];
  if (oncePerDayTypes.indexOf(data.type) !== -1) {
    var logData = getAttendanceLogsData();
    var storeMatch = String(data.storeName || "").trim();
    var nameMatch = String(data.name || "").trim();
    if (data.type === "퇴근") {
      // [퇴근 특별 처리] 퇴근→출근 시나리오(실수로 퇴근 먼저 누른 경우): 새 근무 세션으로 간주하여 퇴근 재기록 허용
      var todayRows = [];
      for (var i = 0; i < logData.length; i++) {
        var rowDate = "";
        if (logData[i][0]) { try { rowDate = Utilities.formatDate(new Date(logData[i][0]), tz, "yyyy-MM-dd"); } catch (e) {} }
        if (rowDate === todayStr && String(logData[i][1] || "").trim() === storeMatch && String(logData[i][2] || "").trim() === nameMatch) {
          todayRows.push({ t: new Date(logData[i][0]).getTime(), type: String(logData[i][3] || "").trim() });
        }
      }
      todayRows.sort(function(a, b) { return b.t - a.t; }); // 최신순
      var lastOutTime = null, lastInTime = null;
      for (var k = 0; k < todayRows.length; k++) {
        if (todayRows[k].type === "퇴근" && lastOutTime === null) lastOutTime = todayRows[k].t;
        if (todayRows[k].type === "출근" && lastInTime === null) lastInTime = todayRows[k].t;
      }
      // 최근 출근이 최근 퇴근보다 뒤(더 최신)면 → 퇴근 후 재출근한 새 세션 → 퇴근 허용
      if (lastOutTime != null && lastInTime != null && lastInTime > lastOutTime) {
        // 허용: 다음 로직으로 진행
      } else if (lastOutTime != null) {
        return "오늘 이미 [퇴근] 기록이 있습니다. 하루에 한 번만 기록할 수 있습니다.";
      }
    } else {
      for (var i = 0; i < logData.length; i++) {
        var rowDate = "";
        if (logData[i][0]) { try { rowDate = Utilities.formatDate(new Date(logData[i][0]), tz, "yyyy-MM-dd"); } catch (e) {} }
        if (rowDate === todayStr && String(logData[i][1] || "").trim() === storeMatch &&
            String(logData[i][2] || "").trim() === nameMatch &&
            String(logData[i][3] || "").trim() === String(data.type || "").trim()) {
          return "오늘 이미 [" + data.type + "] 기록이 있습니다. 하루에 한 번만 기록할 수 있습니다.";
        }
      }
    }
  }

  // 1. [위치 검증] Supabase vendors의 gps_name/name + lat/lng 사용. GPS 미동작/거리 초과 시에도 기록 저장 → 매니저 승인 시 인정
  var targetLat = 0, targetLng = 0;
  var locationOk = false;
  try {
    var vendors = supabaseSelect("vendors", { limit: 2000 });
    var storeNameTrim = String(data.storeName || "").trim();
    for (var i = 0; i < (vendors || []).length; i++) {
      var v = vendors[i];
      var gpsName = String(v.gps_name || "").trim();
      var name = String(v.name || "").trim();
      if (gpsName === storeNameTrim || (gpsName === "" && name === storeNameTrim)) {
        targetLat = Number(v.lat);
        targetLng = Number(v.lng);
        if (targetLat !== 0 || targetLng !== 0) break;
      }
    }
    if ((targetLat !== 0 || targetLng !== 0) && data.lat !== "Unknown" && data.lat !== "" && data.lng !== "" && data.lng !== "Unknown") {
      var distance = calcDistance(targetLat, targetLng, data.lat, data.lng);
      if (distance <= 100) locationOk = true;
    }
  } catch (e) {
    Logger.log("근태 위치 검증: " + e.message);
  }

  var needManagerApproval = !locationOk;

  // 2. [계획 대조] 오늘 시간표 (Supabase schedules)
  var schData = getSchedulesData();
  var planIn = "", planOut = "", planBS = "", planBE = "";
  for (var j = 0; j < schData.length; j++) {
    var rowDate = (schData[j][0] && typeof schData[j][0] === "string") ? schData[j][0].slice(0, 10) : (schData[j][0] ? Utilities.formatDate(new Date(schData[j][0]), "GMT+7", "yyyy-MM-dd") : "");
    if (rowDate === todayStr && String(schData[j][2] || "").trim() === String(data.name || "").trim()) {
      planIn = schData[j][3];
      planOut = schData[j][4];
      planBS = schData[j][5];
      planBE = schData[j][6];
      break;
    }
  }

  // 3. [자동 판정 로직] 계획시간이 "오후 7:00:00" 등이면 Date 파싱 실패로 NaN → #NUM! 방지
  var lateMin = 0, earlyMin = 0, otMin = 0, breakMin = 0, status = "정상", planTime = "";

  if (data.type === "출근" && planIn) {
    planTime = planIn;
    var pInDate = parsePlanTimeToDate(todayStr, planIn);
    if (pInDate && nowTime > pInDate) {
      lateMin = safeMinutes((nowTime - pInDate) / (1000 * 60));
      if (lateMin > 1) status = "지각";
    }
  }
  else if (data.type === "퇴근" && planOut) {
    planTime = planOut;
    var pOutDate = parsePlanTimeToDate(todayStr, planOut);
    if (pOutDate) {
      if (nowTime < pOutDate) {
        earlyMin = safeMinutes((pOutDate - nowTime) / (1000 * 60));
        status = "조퇴";
      } else {
        otMin = safeMinutes((nowTime - pOutDate) / (1000 * 60));
        if (otMin >= 30) status = "연장";
      }
    }
  }
  else if (data.type === "휴식종료") {
    var logs = logSheet.getDataRange().getValues();
    for (var k = logs.length - 1; k >= 0; k--) {
      if (logs[k][2] === data.name && logs[k][3] === "휴식시작" &&
          Utilities.formatDate(new Date(logs[k][0]), tz, "yyyy-MM-dd") === todayStr) {
        var actualStart = new Date(logs[k][0]);
        breakMin = isNaN(actualStart.getTime()) ? 0 : safeMinutes((nowTime - actualStart) / (1000 * 60));
        if (planBS && planBE) {
          var pBSDate = parsePlanTimeToDate(todayStr, planBS);
          var pBEDate = parsePlanTimeToDate(todayStr, planBE);
          if (pBSDate && pBEDate) {
            var planDur = safeMinutes((pBEDate - pBSDate) / (1000 * 60));
            status = (breakMin > planDur) ? "휴게초과" : "휴게정상";
          }
        }
        break;
      }
    }
  }

  if (needManagerApproval) {
    status = "위치미확인(승인대기)";
  }

  // 4. [기록 저장] Supabase attendance_logs
  try {
    supabaseInsert('attendance_logs', {
      log_at: nowTime.toISO ? nowTime.toISOString() : new Date(nowTime).toISOString(),
      store_name: String(data.storeName || '').trim(),
      name: String(data.name || '').trim(),
      log_type: String(data.type || '').trim(),
      lat: String(data.lat != null ? data.lat : '').trim(),
      lng: String(data.lng != null ? data.lng : '').trim(),
      planned_time: planTime != null ? String(planTime).trim() : '',
      late_min: safeMinutes(lateMin),
      early_min: safeMinutes(earlyMin),
      ot_min: safeMinutes(otMin),
      break_min: safeMinutes(breakMin),
      reason: '',
      status: status,
      approved: '대기'
    });
  } catch (e) {
    Logger.log('recordAttendance insert: ' + e.message);
    throw e;
  }

  if (needManagerApproval) {
    return "ATT_GPS_PENDING";  // 클라이언트에서 번역 메시지 표시 후 '오늘 기록'에 행 추가
  }
  return "✅ " + data.type + " 완료! (" + status + ")";
}

/** [모바일] 오늘 해당 직원이 이미 기록한 근태 유형 목록 반환 (Supabase attendance_logs)
 *  최신 50건만 조회(log_at.desc)하여 오늘 Break 후 Resume 버튼이 정상 활성화되도록 함.
 *  이전: getAttendanceLogsData()가 log_at.asc 2000건 → 오늘(최신) 기록 누락 가능 */
function getTodayAttendanceTypes(storeName, name) {
  try {
    var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok";
    var todayStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
    var storeStr = String(storeName || "").trim();
    var nameStr = String(name || "").trim();
    if (!storeStr || !nameStr) return [];
    var filter = "store_name=ilike." + encodeURIComponent(storeStr) + "&name=ilike." + encodeURIComponent(nameStr);
    var rows = supabaseSelectFilter("attendance_logs", filter, { order: "log_at.desc", limit: 50 });
    if (!rows || rows.length === 0) return [];
    var types = [];
    var idxOfLastClockOut = -1;
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].log_type || "").trim() === "퇴근") {
        idxOfLastClockOut = i;
        break;
      }
    }
    if (idxOfLastClockOut >= 0) {
      var hasNewSessionAfterClockOut = false;
      for (var j = 0; j < idxOfLastClockOut; j++) {
        if (String(rows[j].log_type || "").trim() === "출근") {
          hasNewSessionAfterClockOut = true;
          break;
        }
      }
      if (!hasNewSessionAfterClockOut) {
        for (var k = 0; k < rows.length; k++) {
          var rDate = rows[k].log_at ? Utilities.formatDate(new Date(rows[k].log_at), tz, "yyyy-MM-dd") : "";
          if (rDate !== todayStr) continue;
          var t = String(rows[k].log_type || "").trim();
          if (t && types.indexOf(t) === -1) types.push(t);
        }
        return types;
      }
    }
    for (var m = 0; m < rows.length; m++) {
      var typ = String(rows[m].log_type || "").trim();
      if (typ && types.indexOf(typ) === -1) types.push(typ);
      if (typ === "출근") break;
    }
    return types;
  } catch (e) { return []; }
}

/**
 * [관리자] 출근만 있고 퇴근이 없는 경우, 시간표 계획 퇴근 시각으로 강제 퇴근 기록. 매니저 승인 필요.
 * @param {string} dateStr yyyy-MM-dd
 * @param {string} storeName 매장명
 * @param {string} employeeName 직원명
 * @returns {string} 성공/오류 메시지
 */
function recordForcedClockOut(dateStr, storeName, employeeName) {
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok";
  dateStr = (dateStr || "").trim();
  if (dateStr.length < 10) return "날짜 형식이 올바르지 않습니다.(yyyy-MM-dd)";
  dateStr = dateStr.substring(0, 10);
  storeName = String(storeName || "").trim();
  employeeName = String(employeeName || "").trim();
  if (!storeName || !employeeName) return "매장명과 직원명을 입력해 주세요.";

  var data = getAttendanceLogsData();
  var hasIn = false, hasOut = false;
  for (var i = 0; i < data.length; i++) {
    var rowDate = "";
    if (data[i][0]) { try { rowDate = Utilities.formatDate(new Date(data[i][0]), tz, "yyyy-MM-dd"); } catch (e) {} }
    if (rowDate !== dateStr) continue;
    if (String(data[i][1] || "").trim() !== storeName || String(data[i][2] || "").trim() !== employeeName) continue;
    var typ = String(data[i][3] || "").trim();
    if (typ === "출근") hasIn = true;
    if (typ === "퇴근") hasOut = true;
  }
  if (!hasIn) return "해당 날짜에 출근 기록이 없습니다.";
  if (hasOut) return "이미 퇴근 기록이 있습니다. 강제 퇴근을 추가할 수 없습니다.";

  var plannedOutDate = getPlannedOutDateTime(dateStr, storeName, employeeName);
  if (!plannedOutDate || isNaN(plannedOutDate.getTime())) return "해당 날짜/매장/직원의 시간표(계획 퇴근)가 없습니다. 직원시간표를 확인해 주세요.";

  var planTimeStr = Utilities.formatDate(plannedOutDate, tz, "HH:mm");
  try {
    supabaseInsert('attendance_logs', {
      log_at: plannedOutDate.toISOString ? plannedOutDate.toISOString() : new Date(plannedOutDate).toISOString(),
      store_name: storeName,
      name: employeeName,
      log_type: "퇴근",
      lat: "",
      lng: "",
      planned_time: planTimeStr,
      late_min: 0,
      early_min: 0,
      ot_min: 0,
      break_min: 0,
      reason: "",
      status: "강제퇴근(승인대기)",
      approved: "대기"
    });
    return "강제 퇴근이 기록되었습니다. (계획 퇴근 " + planTimeStr + ") 매니저 승인 후 인정됩니다.";
  } catch (e) {
    return "저장 실패: " + (e && e.message ? e.message : String(e));
  }
}

/** [관리자] 기간 내 출근만 있고 퇴근 없는 건을 일괄 강제 퇴근 기록. 승인대기 조회 전 호출하면 퇴근미기록이 강제퇴근(승인대기)로 바뀜 */
function processDailyForcedClockOutForRange(startStr, endStr) {
  startStr = (startStr || "").trim().substring(0, 10);
  endStr = (endStr || "").trim().substring(0, 10);
  if (!startStr || !endStr) return { processed: 0, errors: [] };
  if (startStr > endStr) { var t = startStr; startStr = endStr; endStr = t; }
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok";
  var data = getAttendanceLogsData();
  var byKey = {};
  for (var i = 0; i < data.length; i++) {
    var rowDate = "";
    if (data[i][0]) { try { rowDate = Utilities.formatDate(new Date(data[i][0]), tz, "yyyy-MM-dd"); } catch (e) {} }
    if (!rowDate || rowDate < startStr || rowDate > endStr) continue;
    var store = String(data[i][1] || "").trim();
    var name = String(data[i][2] || "").trim();
    var type = String(data[i][3] || "").trim();
    var key = rowDate + "|" + store + "|" + name;
    if (!byKey[key]) byKey[key] = { date: rowDate, store: store, name: name, in: false, out: false };
    if (type === "출근") byKey[key].in = true;
    if (type === "퇴근") byKey[key].out = true;
  }
  var processed = 0;
  var errors = [];
  for (var k in byKey) {
    var r = byKey[k];
    if (!r.in || r.out) continue;
    var res = recordForcedClockOut(r.date, r.store, r.name);
    if (res.indexOf("✅") !== -1 || res.indexOf("강제 퇴근이 기록") !== -1) processed++;
    else if (res.indexOf("이미 퇴근") === -1) errors.push(r.date + " " + r.store + " " + r.name + ": " + res);
  }
  return { processed: processed, errors: errors };
}

/** [수정됨] 직원시간표(Supabase)에 한 건이라도 있는 매장명 집합 */
function getStoresWithSchedule() {
  try {
    var data = getSchedulesData();
    if (!data || data.length === 0) return {};
    var set = {};
    for (var i = 0; i < data.length; i++) {
      var store = String(data[i][1] != null ? data[i][1] : "").trim();
      if (store) set[store] = true;
    }
    return set;
  } catch (e) {
    Logger.log("getStoresWithSchedule Error: " + e.message);
    return {};
  }
}

/** 근태/스케줄 조회용 매장 목록 (직원시간표·근태에 사용되는 매장명만 반환 - 거래처명이 아님) */
function getScheduleStoreList() {
  try {
    var set = getStoresWithSchedule();
    var list = (set && typeof set === "object") ? Object.keys(set) : [];
    list.sort();
    return list;
  } catch (e) {
    Logger.log("getScheduleStoreList: " + e.message);
    return [];
  }
}

/** UI 매장 드롭다운용 통합 목록 (직원정보 + 스케줄에 있는 매장명만, 거래처 제외). role은 getPayrollStoreList에 전달 */
function getStoreListForUI(role) {
  try {
    var seen = {};
    var list = [];
    var fromPayroll = getPayrollStoreList(role || "");
    for (var i = 0; i < (fromPayroll || []).length; i++) {
      var s = String(fromPayroll[i] || "").trim();
      if (s && !seen[s]) { seen[s] = true; list.push(s); }
    }
    var fromSch = getScheduleStoreList();
    for (var j = 0; j < (fromSch || []).length; j++) {
      var t = String(fromSch[j] || "").trim();
      if (t && !seen[t]) { seen[t] = true; list.push(t); }
    }
    list.sort();
    return list;
  } catch (e) {
    Logger.log("getStoreListForUI: " + e.message);
    return [];
  }
}

/** 시간표 있는 매장: 위치미확인/승인대기(GPS벗어남) 기록 제외 → 전체 조회 시 응답 크기 제한으로 정상 동작. 시간표 없는 매장: 그대로 표시 */
function filterAttendanceGpsByScheduleRule(result, storesWithSchedule) {
  if (!result || result.length === 0) return result;
  if (!storesWithSchedule || typeof storesWithSchedule !== "object") return result;
  return result.filter(function(item) {
    var status = String(item.status || "").trim();
    var isGpsOutside = (status.indexOf("위치미확인") !== -1 || status.indexOf("승인대기") !== -1);
    if (!isGpsOutside) return true;
    var store = String(item.store != null ? item.store : "").trim();
    if (storesWithSchedule[store]) return false;
    return true;
  });
}

/** [웹 전용] 근태 기록 조회 - 전체 매장(mode=all) / 오피스만(mode=office). Supabase attendance_logs, row=id(승인용) */
function getAttendanceListByMode(startStr, endStr, mode, employeeFilter) {
  if (!startStr || !endStr) return [];
  startStr = toNormalizedDateStr(startStr);
  endStr = toNormalizedDateStr(endStr);
  if (!startStr || !endStr) return [];
  if (startStr > endStr) { var t = startStr; startStr = endStr; endStr = t; }
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok";
  var data = getAttendanceLogsData();
  var result = [];
  var useAllEmp = !employeeFilter || employeeFilter === "전체 직원";
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!row) continue;
    var rowDateStr = toAttendanceDateStr(row[0], tz);
    if (!rowDateStr && row[0]) {
      try { var d = new Date(row[0]); if (!isNaN(d.getTime())) rowDateStr = Utilities.formatDate(d, tz, "yyyy-MM-dd"); } catch (e) {}
    }
    if (!rowDateStr || rowDateStr.length < 10) continue;
    if (rowDateStr < startStr || rowDateStr > endStr) continue;
    var rowStore = String(row[1] != null ? row[1] : "").trim();
    if (mode === "office") {
      var n = rowStore.toLowerCase();
      if (n.indexOf("office") === -1 && n.indexOf("오피스") === -1 && n.indexOf("본사") === -1) continue;
    }
    if (!useAllEmp && String(row[2] || "").trim() !== employeeFilter) continue;
    result.push({
      row: row[14],
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
      status: row[12] != null ? String(row[12]) : "정상",
      approval: String(row[13] != null ? row[13] : "").trim() || "대기"
    });
  }
  return result.reverse();
}

/**
 * [웹 전용] 근태 기록 조회 - 단일 진입점. approvalOnly=true면 지각·O.T·위치미확인(승인대기) 건만 반환.
 *
 * ★ 전체 매장 + 전체 직원 조회가 되게 만든 핵심:
 *   - "전체 매장" 선택 시 mode=all → getAttendanceList(start, end, "All", emp) 한 경로만 사용.
 *   - getAttendanceList에서 storeFilter="All"이면 isAll=true로 모든 매장 포함, emp=""면 전체 직원.
 *   - 클라이언트(JS_HR loadAttendanceRecords)에서 전체 매장일 때 반드시 employeeVal="" 로 보냄.
 *
 * ★ 전체 조회: 시간표 있는 매장은 GPS벗어남 기록 제외(응답 크기 제한 회피). '승인대기' 필터 선택 시 별도 조회로 GPS 미확인 건 모두 표시·승인 가능.
 */
function getAttendanceListFromPayload(payloadStr) {
  try {
    var p = JSON.parse(payloadStr || "{}");
    var startStr = String(p.start != null ? p.start : p.startDate || "").trim();
    var endStr = String(p.end != null ? p.end : p.endDate || "").trim();
    // 클라이언트에서 날짜가 비어 전달되면 기본 기간(이번 달) 사용 (날짜 없음 조회 실패 방지)
    if (!startStr || !endStr) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var tz = ss.getSpreadsheetTimeZone() || "Asia/Bangkok";
      var now = new Date();
      startStr = startStr || Utilities.formatDate(now, tz, "yyyy-MM-01");
      endStr = endStr || Utilities.formatDate(now, tz, "yyyy-MM-dd");
      Logger.log("근태 조회: 날짜 비어있어 기본 기간 사용 start=" + startStr + " end=" + endStr);
    }
    var store = String(p.store != null ? p.store : p.storeFilter || "").trim();
    var emp = String(p.emp != null ? p.emp : p.employeeFilter || "").trim();
    var mode = String(p.mode != null ? p.mode : "").toLowerCase().trim();
    var approvalOnly = !!(p.approvalOnly === true || p.approvalOnly === "true");
    var dailySummary = !!(p.dailySummary === true || p.dailySummary === "true");
    // mode가 비어있어도 store 값으로 보정 (클라이언트 전달 오류 대비)
    if (mode !== "all" && mode !== "office") {
      var storeLower = store.toLowerCase().replace(/\s/g, "");
      if (!store || store === "all" || storeLower === "all" || store === "전체 매장" || store === "전체" || storeLower.indexOf("전체") !== -1)
        mode = "all";
      else if (storeLower.indexOf("office") !== -1 || storeLower.indexOf("오피스") !== -1 || storeLower.indexOf("본사") !== -1)
        mode = "office";
    }
    if (dailySummary) {
      var storeParam = (mode === "all" || !store || store === "all" || String(store).toLowerCase().replace(/\s/g, "") === "all" || String(store).indexOf("전체") !== -1) ? "All" : store;
      var dailyList = getAttendanceDailySummary(startStr, endStr, storeParam, emp) || [];
      if (approvalOnly && dailyList.length > 0) {
        dailyList = dailyList.filter(function(r) {
          if (r.onlyIn === true) return true;
          var approval = String(r.approval || "").trim();
          if (approval === "승인완료" || approval === "반려") return false;
          var st = String(r.status || "").trim();
          return (r.lateMin > 0 || r.otMin > 0 || st.indexOf("위치미확인") !== -1 || st.indexOf("승인대기") !== -1 || st.indexOf("강제퇴근") !== -1);
        });
      }
      return dailyList;
    }
    var skipScheduleFilter = approvalOnly;
    var list = [];
    if (mode === "office") {
      list = getAttendanceListByMode(startStr, endStr, "office", emp, skipScheduleFilter);
    } else {
      var storeParam = (mode === "all" || !store || store === "all" || String(store).toLowerCase().replace(/\s/g, "") === "all" || String(store).indexOf("전체") !== -1) ? "All" : store;
      list = getAttendanceList(startStr, endStr, storeParam, emp, skipScheduleFilter);
      if ((!list || list.length === 0) && (mode === "all" || storeParam === "All")) {
        var listByMode = getAttendanceListByMode(startStr, endStr, "all", emp, skipScheduleFilter);
        if (listByMode && listByMode.length > 0) list = listByMode;
      }
    }
    if (approvalOnly && list && list.length > 0) {
      list = list.filter(function(r) {
        var approval = String(r.approval || "").trim();
        if (approval === "승인완료" || approval === "반려") return false;
        var late = Number(r.late) || 0;
        var ot = Number(r.ot) || 0;
        var status = String(r.status || "").trim();
        var needsGps = (status.indexOf("위치미확인") !== -1 || status.indexOf("승인대기") !== -1);
        return (late > 0 || ot > 0 || needsGps);
      });
    }
    return list || [];
  } catch (e) {
    Logger.log("getAttendanceListFromPayload 오류: " + e.message);
    return [];
  }
}

/* [관리자 전용] 근태 기록 조회 - 인자 4개 또는 객체 1개. 상태(위치미확인 등)로 필터하지 않음 → 모두 조회 후 승인 가능 */
function getAttendanceList(startDate, endDate, storeFilter, employeeFilter) {
  try {
    var startStr, endStr, storeFilterStr, employeeFilterStr;

    if (startDate && typeof startDate === "object" && startDate !== null && (endDate == null || typeof endDate !== "string")) {
      // 객체 1개로 호출된 경우 (모바일 등)
      startStr = String((startDate.startDate != null ? startDate.startDate : startDate.start) || "").trim();
      endStr = String((startDate.endDate != null ? startDate.endDate : startDate.end) || "").trim();
      var sf = (startDate.storeFilter != null ? startDate.storeFilter : startDate.store);
      storeFilterStr = (sf != null && sf !== undefined) ? String(sf).trim() : "";
      employeeFilterStr = String((startDate.employeeFilter != null ? startDate.employeeFilter : startDate.employee) || "").trim();
    } else {
      // 인자 4개 또는 getAttendanceListFromPayload에서 호출
      startStr = String(startDate != null ? startDate : "").trim();
      endStr = String(endDate != null ? endDate : "").trim();
      storeFilterStr = (storeFilter != null && storeFilter !== undefined) ? String(storeFilter).trim() : "";
      employeeFilterStr = (employeeFilter != null && employeeFilter !== undefined) ? String(employeeFilter).trim() : "";
    }

    // ★ 전체 매장: 미전달/빈값/undefined 문자열/공백만 → "All"로 통일
    if (!storeFilterStr || storeFilterStr === "undefined" || storeFilterStr.toLowerCase() === "undefined" || storeFilterStr.replace(/\s/g, "") === "") {
      storeFilterStr = "All";
    }

    if (!startStr || !endStr) { Logger.log("근태 조회: 날짜 없음"); return []; }
    startStr = toNormalizedDateStr(startStr);
    endStr = toNormalizedDateStr(endStr);
    if (!startStr || !endStr) return [];
    if (startStr > endStr) { var tmp = startStr; startStr = endStr; endStr = tmp; }

    var rawFilter = storeFilterStr.toLowerCase().replace(/\s/g, "").trim();
    if (rawFilter === "") rawFilter = "all";
    var isAll = (rawFilter === "all" || rawFilter === "allstores" ||
      storeFilterStr.toLowerCase().indexOf("전체") !== -1 || storeFilterStr.toLowerCase().indexOf("all") !== -1 ||
      storeFilterStr === "전체 매장" || storeFilterStr === "전체");
    function isOfficeType(name) {
      if (name == null || name === undefined) return false;
      var n = String(name).toLowerCase().trim();
      if (n === "") return false;
      return n.indexOf("office") !== -1 || n.indexOf("오피스") !== -1 || n.indexOf("본사") !== -1;
    }
    var isOfficeFilter = !isAll && isOfficeType(storeFilterStr);
    var useAllEmployees = !employeeFilterStr || employeeFilterStr === "전체 직원";
    var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok";
    var data = getAttendanceLogsData();
    var result = [];

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (!row) continue;
      var rowDateStr = toAttendanceDateStr(row[0], tz);
      if (!rowDateStr && row[0]) {
        try { var d = new Date(row[0]); if (!isNaN(d.getTime())) rowDateStr = Utilities.formatDate(d, tz, "yyyy-MM-dd"); } catch (e) {}
      }
      if (!rowDateStr || rowDateStr.length < 10) continue;
      if (rowDateStr < startStr || rowDateStr > endStr) continue;
      var rowStore = String(row[1] != null ? row[1] : "").trim();
      var rowStoreLower = rowStore.toLowerCase();
      var storeMatch = false;
      if (isAll) storeMatch = true;
      else if (isOfficeFilter) storeMatch = isOfficeType(rowStore);
      else storeMatch = (rowStoreLower === rawFilter || rowStore === storeFilterStr || (rawFilter.length > 0 && rowStoreLower.indexOf(rawFilter) === 0));
      if (!storeMatch) continue;
      if (!useAllEmployees) {
        var rowName = String(row[2] || "").trim();
        if (rowName !== employeeFilterStr) continue;
      }
      result.push({
        row: row[14],
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

    if (result.length === 0) {
      Logger.log("근태 조회 결과 없음: start=" + startStr + ", end=" + endStr + ", filter=[" + storeFilterStr + "] rawFilter=[" + rawFilter + "] isAll=" + isAll + " isOffice=" + isOfficeFilter);
    }
    // 시간표 있는 매장도 출근/퇴근 기록이 조회되도록 스케줄 기반 GPS 필터 미적용 (승인대기는 approvalOnly 필터로 별도 조회 가능)
    return result.reverse();
  } catch (err) {
    Logger.log("근태 조회 오류: " + err.message);
    return [];
  }
}

/**
 * [근태 기록/승인] 일별 요약 - 하루 총 근무시간(실제) + 시간표 계획 근무시간 비교
 * storeFilter/employeeFilter는 getAttendanceList와 동일 규칙. 반환: [{ date, store, name, inTimeStr, outTimeStr, breakMin, actualWorkMin, actualWorkHrs, plannedWorkMin, plannedWorkHrs, diffMin, lateMin, earlyMin, otMin, status, approval, approvalRow }, ...]
 */
function getAttendanceDailySummary(startStr, endStr, storeFilter, employeeFilter) {
  try {
    var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok";
    startStr = toNormalizedDateStr(startStr);
    endStr = toNormalizedDateStr(endStr);
    if (!startStr || !endStr) return [];
    if (startStr > endStr) { var t = startStr; startStr = endStr; endStr = t; }
    var storeFilterStr = (storeFilter != null && storeFilter !== undefined) ? String(storeFilter).trim() : "All";
    if (!storeFilterStr || storeFilterStr.replace(/\s/g, "") === "") storeFilterStr = "All";
    var rawFilter = storeFilterStr.toLowerCase().replace(/\s/g, "").trim();
    if (rawFilter === "") rawFilter = "all";
    var isAll = (rawFilter === "all" || rawFilter === "allstores" || storeFilterStr.toLowerCase().indexOf("전체") !== -1 || storeFilterStr.toLowerCase().indexOf("all") !== -1 || storeFilterStr === "전체 매장" || storeFilterStr === "전체");
    function isOfficeType(n) {
      if (n == null || n === undefined) return false;
      var s = String(n).toLowerCase().trim();
      return s.indexOf("office") !== -1 || s.indexOf("오피스") !== -1 || s.indexOf("본사") !== -1;
    }
    var isOfficeFilter = !isAll && isOfficeType(storeFilterStr);
    var employeeFilterStr = (employeeFilter != null && employeeFilter !== undefined) ? String(employeeFilter).trim() : "";
    var useAllEmployees = !employeeFilterStr || employeeFilterStr === "전체 직원";
    var data = getAttendanceLogsData();
    var byKey = {};

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (!row) continue;
      var rowDateStr = toAttendanceDateStr(row[0], tz);
      if (!rowDateStr && row[0]) { try { rowDateStr = Utilities.formatDate(new Date(row[0]), tz, "yyyy-MM-dd"); } catch (e) {} }
      if (!rowDateStr || rowDateStr.length < 10 || rowDateStr < startStr || rowDateStr > endStr) continue;
      var rowStore = String(row[1] != null ? row[1] : "").trim();
      var rowStoreLower = rowStore.toLowerCase();
      var storeMatch = isAll || (isOfficeFilter && isOfficeType(rowStore)) || (rowStoreLower === rawFilter || rowStore === storeFilterStr || (rawFilter.length > 0 && rowStoreLower.indexOf(rawFilter) === 0));
      if (!storeMatch) continue;
      if (!useAllEmployees && String(row[2] || "").trim() !== employeeFilterStr) continue;
      var store = rowStore;
      var name = String(row[2] || "").trim();
      var type = String(row[3] || "").trim();
      var key = rowDateStr + "|" + store + "|" + name;
      if (!byKey[key]) {
        byKey[key] = { date: rowDateStr, store: store, name: name, inTime: null, outTime: null, breakMin: 0, lateMin: 0, earlyMin: 0, otMin: 0, status: "", approval: "대기", approvalRow: null };
      }
      var rec = byKey[key];
      var rowId = row[14];
      if (type === "출근") {
        if (!rec.inTime || (row[0] && new Date(row[0]).getTime() < new Date(rec.inTime).getTime())) {
          rec.inTime = row[0];
          rec.lateMin = Number(row[7]) || 0;
        }
      } else if (type === "퇴근") {
        if (!rec.outTime || (row[0] && new Date(row[0]).getTime() > new Date(rec.outTime).getTime())) {
          rec.outTime = row[0];
          rec.earlyMin = Number(row[8]) || 0;
          rec.otMin = Number(row[9]) || 0;
          rec.status = String(row[12] || "").trim() || rec.status;
          rec.approval = String(row[13] || "").trim() || "대기";
          rec.approvalRow = rowId;
        }
      } else if (type === "휴식종료") {
        rec.breakMin += (Number(row[10]) || 0);
      }
    }

    var result = [];
    for (var k in byKey) {
      var r = byKey[k];
      if (r.inTime == null) continue;
      var plannedWorkMin = getPlannedMinutesForDay(r.date, r.store, r.name);
      var plannedWorkHrs = Math.round((plannedWorkMin / 60) * 10) / 10;
      if (r.outTime != null) {
        var inMs = new Date(r.inTime).getTime();
        var outMs = new Date(r.outTime).getTime();
        if (!isNaN(inMs) && !isNaN(outMs)) {
          var actualWorkMin = Math.max(0, Math.floor((outMs - inMs) / 60000) - (r.breakMin || 0));
          var actualWorkHrs = Math.round((actualWorkMin / 60) * 10) / 10;
          var diffMin = actualWorkMin - plannedWorkMin;
          var st = r.status || "정상";
          var app = r.approval || "대기";
          var needsApp = (app !== "승인완료" && app !== "반려");
          var approvalType = null;
          if (needsApp) {
            if (r.lateMin > 0) approvalType = "late";
            else if (st.indexOf("강제퇴근") !== -1) approvalType = "forced_out";
            else if (st.indexOf("위치미확인") !== -1 || st.indexOf("승인대기") !== -1) approvalType = "gps";
            else if (r.otMin > 0) approvalType = "ot";
          }
          result.push({
            date: r.date,
            store: r.store,
            name: r.name,
            inTimeStr: toAttendanceTimestampStr(r.inTime, tz, null),
            outTimeStr: toAttendanceTimestampStr(r.outTime, tz, null),
            breakMin: r.breakMin || 0,
            actualWorkMin: actualWorkMin,
            actualWorkHrs: actualWorkHrs,
            plannedWorkMin: plannedWorkMin,
            plannedWorkHrs: plannedWorkHrs,
            diffMin: diffMin,
            lateMin: r.lateMin || 0,
            earlyMin: r.earlyMin || 0,
            otMin: r.otMin || 0,
            status: st,
            approval: app,
            approvalRow: r.approvalRow,
            onlyIn: false,
            approvalType: approvalType
          });
        }
      } else {
        result.push({
          date: r.date,
          store: r.store,
          name: r.name,
          inTimeStr: toAttendanceTimestampStr(r.inTime, tz, null),
          outTimeStr: "미기록",
          breakMin: r.breakMin || 0,
          actualWorkMin: null,
          actualWorkHrs: null,
          plannedWorkMin: plannedWorkMin,
          plannedWorkHrs: plannedWorkHrs,
          diffMin: null,
          lateMin: r.lateMin || 0,
          earlyMin: 0,
          otMin: 0,
          status: "퇴근미기록",
          approval: "-",
          approvalRow: null,
          onlyIn: true,
          approvalType: "forced_out"
        });
      }
    }
    result.sort(function(a, b) {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      if (a.store !== b.store) return a.store.localeCompare(b.store);
      return a.name.localeCompare(b.name);
    });
    return result;
  } catch (e) {
    Logger.log("getAttendanceDailySummary 오류: " + e.message);
    return [];
  }
}

/** [디버그] 근태 조회 원인 확인용 - 스크립트 편집기에서 runGetAttendanceListDebug() 실행 후 [보기]-[실행 로그] 확인 */
function runGetAttendanceListDebug() {
  var params = { startDate: "2026-01-01", endDate: "2026-01-31", storeFilter: "All", employeeFilter: "" };
  var list = getAttendanceList(params);
  var data = getAttendanceLogsData();
  var sample = data.length >= 2 ? [data[0].slice(0, 14), data[1].slice(0, 14)] : (data.length === 1 ? [data[0].slice(0, 14)] : []);
  Logger.log("storeFilter=All 시 조회 건수: " + (list ? list.length : 0));
  Logger.log("근태기록(Supabase) 건수: " + data.length);
  Logger.log("샘플 2건(일시,매장,이름): " + JSON.stringify(sample));
  return { count: list ? list.length : 0, totalLogs: data.length, sample: sample };
}

/** 조회 기간용: 입력값을 yyyy-MM-dd 문자열로 정규화 (2026/1/31, 2026. 1. 31, 2026-01-31T00:00:00 등 통일) */
function toNormalizedDateStr(val) {
  if (val == null && val !== 0) return "";
  var s = String(val || "").trim();
  if (!s) return "";
  if (s.indexOf("T") >= 0) s = s.split("T")[0];
  var m = s.match(/(\d{4})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})/);
  if (m) return m[1] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[3]).slice(-2);
  var m2 = s.match(/(\d{1,2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{4})/);
  if (m2) {
    var n1 = parseInt(m2[1], 10), n2 = parseInt(m2[2], 10), y = m2[3];
    var mo, day;
    if (n2 > 12) { mo = n1; day = n2; } else if (n1 > 12) { mo = n2; day = n1; } else { mo = n1; day = n2; }
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) return y + "-" + ("0" + mo).slice(-2) + "-" + ("0" + day).slice(-2);
  }
  if (s.length >= 10 && s.charAt(4) === "-" && s.charAt(7) === "-") return s.substring(0, 10);
  return "";
}

/** 일시 값을 yyyy-MM-dd 문자열로 변환 (시트 표기 "2026. 1. 20.", "2026. 1. 20 오후 12:33:16" 등 지원) */
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
  var m = s.match(/(\d{4})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})/);
  if (m) {
    var y = m[1], mo = ("0" + m[2]).slice(-2), d = ("0" + m[3]).slice(-2);
    return y + "-" + mo + "-" + d;
  }
  var m2 = s.match(/(\d{1,2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{4})/);
  if (m2) {
    var n1 = parseInt(m2[1], 10), n2 = parseInt(m2[2], 10), y = m2[3];
    var mo, day;
    if (n2 > 12) { mo = n1; day = n2; } else if (n1 > 12) { mo = n2; day = n1; } else { mo = n1; day = n2; }
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) return y + "-" + ("0" + mo).slice(-2) + "-" + ("0" + day).slice(-2);
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

/* [추가] 관리자 근태 승인 처리 (row = Supabase attendance_logs id) */
function approveAttendance(row, status) {
  try {
    supabaseUpdate('attendance_logs', row, { status: "정상(승인)", approved: "승인완료" });
    return "✅ 승인되었습니다.";
  } catch (e) {
    return "❌ " + (e && e.message ? e.message : String(e));
  }
}

/** 해당 직원의 가장 최근 근태 기록에 사유(reason) 업데이트 (Supabase) */
function updateLastReason(reason, name) {
  var data = getAttendanceLogsData();
  for (var i = data.length - 1; i >= 0; i--) {
    if (String(data[i][2] || "").trim() === String(name || "").trim()) {
      try {
        supabaseUpdate('attendance_logs', data[i][14], { reason: String(reason || "").trim() });
        return "✅ 사유가 저장되었습니다.";
      } catch (e) {
        return "❌ 저장 실패: " + (e && e.message ? e.message : String(e));
      }
    }
  }
  return "❌ 기록을 찾을 수 없습니다.";
}

/* [관리자 기능] 근태 승인/반려 처리 (row = Supabase attendance_logs id). optOtMinutes 있으면 연장(분) 반영. userStore/userRole 전달 시 매니저는 자기 매장만 승인 가능 */
function processAttendanceApproval(row, decision, optOtMinutes, userStore, userRole) {
  var rows = supabaseSelectFilter('attendance_logs', 'id=eq.' + encodeURIComponent(row), { limit: 1 });
  if (!rows || rows.length === 0) return "❌ 해당 기록을 찾을 수 없습니다.";
  var rowStore = String(rows[0].store_name || "").trim();
  var r = String(userRole || "").toLowerCase();
  var isManager = (r === "manager");
  if (isManager && typeof userStore !== "undefined" && userStore !== null) {
    if (String(userStore).trim() !== rowStore) return "❌ 해당 매장만 승인할 수 있습니다.";
  }
  var patch = { approved: decision };
  if (decision === "승인완료") patch.status = "정상(승인)";
  else if (decision === "반려") patch.status = "반려";
  if (decision === "승인완료" && optOtMinutes != null && optOtMinutes !== "" && !isNaN(Number(optOtMinutes))) {
    patch.ot_min = Math.max(0, Math.min(9999, Math.round(Number(optOtMinutes))));
  }
  try {
    supabaseUpdate('attendance_logs', row, patch);
    return "✅ 처리가 완료되었습니다.";
  } catch (e) {
    return "❌ " + (e && e.message ? e.message : String(e));
  }
}

/** [모바일 Admin] 근태 승인 대기 목록 (날짜·매장 필터). 관리자 페이지와 동일하게 지각·GPS·O.T·강제퇴근 4가지만 반환 */
function getAttendancePendingForMobile(userStore, userRole, startDate, endDate, storeFilterOverride) {
  var r = String(userRole || "").toLowerCase();
  var isOffice = r.indexOf("director") !== -1 || r.indexOf("officer") !== -1 || r.indexOf("ceo") !== -1 || r.indexOf("hr") !== -1;
  var storeFilter = (storeFilterOverride && String(storeFilterOverride).trim()) ? String(storeFilterOverride).trim() : (isOffice ? "All" : (userStore ? String(userStore).trim() : "All"));
  var list = getAttendanceDailySummary(startDate || "", endDate || "", storeFilter) || [];
  return list.filter(function(x) {
    if (x.onlyIn === true) return false;
    var approval = String(x.approval || "").trim();
    if (approval === "승인완료" || approval === "반려") return false;
    var status = String(x.status || "").trim();
    var isLate = (Number(x.lateMin) || 0) > 0;
    var isOt = (Number(x.otMin) || 0) > 0;
    var isGps = (status.indexOf("위치미확인") !== -1 || status.indexOf("승인대기") !== -1);
    var isForcedOut = status.indexOf("강제퇴근") !== -1;
    return (isLate || isOt || isGps || isForcedOut) && (x.approvalRow != null && x.approvalRow > 0);
  });
}

/** [모바일 Admin] 근태 승인/반려 (row = Supabase id, 권한: 해당 행의 매장이 본인 범위 내인지 검사) */
function processAttendanceApprovalMobile(row, decision, userStore, userRole) {
  var rows = supabaseSelectFilter('attendance_logs', 'id=eq.' + encodeURIComponent(row), { limit: 1 });
  if (!rows || rows.length === 0) return "❌ 해당 기록을 찾을 수 없습니다.";
  var rowStore = String(rows[0].store_name || "").trim();
  var r = String(userRole || "").toLowerCase();
  var isOffice = r.indexOf("director") !== -1 || r.indexOf("officer") !== -1 || r.indexOf("ceo") !== -1 || r.indexOf("hr") !== -1;
  if (!isOffice && String(userStore).trim() !== rowStore) return "❌ 해당 매장만 승인할 수 있습니다.";
  return processAttendanceApproval(row, decision);
}

/* =================================================================
   시간표(스케줄러)
   ================================================================= */ 

/* [관리자] 시간표 관리용 데이터 호출 (Supabase schedules). row = id(승인/수정용) */
function getScheduleForAdmin(date, storeFilter) {
  try {
    var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok";
    var data = getSchedulesData();
    var targetDate = (date && String(date).trim()) ? String(date).trim().substring(0, 10) : "";
    if (!targetDate) return [];
    if (targetDate.length !== 10 || targetDate.charAt(4) !== "-" || targetDate.charAt(7) !== "-") {
      try { targetDate = Utilities.formatDate(new Date(date), tz, "yyyy-MM-dd"); } catch (e) { return []; }
    }
    var result = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var rowDateStr = (typeof row[0] === "string") ? row[0].slice(0, 10) : toScheduleDateStr(row[0], tz);
      if (!rowDateStr || rowDateStr !== targetDate) continue;
      if (storeFilter !== "All" && storeFilter !== "" && String(row[1] || "").trim() !== String(storeFilter || "").trim()) continue;
      result.push({
        row: row[8],
        store: row[1],
        name: row[2],
        pIn: row[3] || "",
        pOut: row[4] || "",
        pBS: row[5] || "",
        pBE: row[6] || ""
      });
    }
    return result;
  } catch (err) {
    return [];
  }
}

/* [관리자] 시간표 데이터 행 수정 (d.row = Supabase schedules id) */
function updateScheduleRow(d) {
  var id = d.row != null ? d.row : d.id;
  if (id == null || id === "") return "행 정보가 없습니다.";
  try {
    supabaseUpdate('schedules', id, {
      plan_in: String(d.pIn || "").trim(),
      plan_out: String(d.pOut || "").trim(),
      break_start: String(d.pBS || "").trim(),
      break_end: String(d.pBE || "").trim()
    });
    return "Success";
  } catch (e) {
    return "❌ " + (e && e.message ? e.message : String(e));
  }
}

// 1. 선택한 매장의 직원들만 이름표로 만들기 위해 가져오는 함수 (Supabase employees)
function getStoreStaffOnly(storeName) {
  var list = getEmployeesData();
  var storeNorm = String(storeName || "").trim().replace(/\s+/g, " ");
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var rowStore = String(list[i].store || "").trim().replace(/\s+/g, " ");
    if (rowStore !== storeNorm) continue;
    out.push({
      name: String(list[i].name || "").trim(),
      nick: String(list[i].nick || list[i].name || "").trim(),
      dept: list[i].job || ""
    });
  }
  return out;
}

/* [조회] 저장된 주간 스케줄 (Supabase schedules). storeName + 해당 주(월~일) 필터 */
function getSavedWeeklyData(storeName, mondayStr) {
  try {
    var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok";
    var startStr = toScheduleDateStr(mondayStr, tz);
    if (!startStr || startStr.length < 10) return [];
    var startDate = new Date(startStr + "T12:00:00");
    var endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000);
    var endStr = Utilities.formatDate(endDate, tz, "yyyy-MM-dd");

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
    function formatTimeSafe(v) {
      if (v == null || v === "") return "";
      if (v instanceof Date) return Utilities.formatDate(v, tz, "HH:mm");
      var s = String(v).trim();
      if (s.indexOf("T") !== -1) {
        var tPart = s.split("T")[1];
        if (tPart) {
          var mm = tPart.match(/(\d{1,2}):(\d{2})/);
          if (mm) return ("0" + mm[1]).slice(-2) + ":" + mm[2];
        }
      }
      var match = s.match(/^\s*(\d{1,2})\s*[:\s]\s*(\d{1,2})/);
      if (match) return ("0" + match[1]).slice(-2) + ":" + ("0" + match[2]).slice(-2);
      if (s.length >= 5 && s.charAt(2) === ":") return s.substring(0, 5);
      return s;
    }

    var nameToNick = {};
    var empList = getEmployeesData();
    for (var e = 0; e < empList.length; e++) {
      var nm = String(empList[e].name || "").trim();
      var nick = String(empList[e].nick || empList[e].name || "").trim() || nm;
      if (nm) nameToNick[nm] = nick;
    }

    var data = getSchedulesData();
    var result = [];
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (!storeMatch(storeName, row[1])) continue;
      var rowDateStr = toScheduleDateStr(row[0], tz) || ((typeof row[0] === "string") ? row[0].slice(0, 10) : "");
      if (!rowDateStr || rowDateStr.length < 10) continue;
      if (rowDateStr < startStr || rowDateStr > endStr) continue;
      var remark = String(row[7] || "").trim().toLowerCase();
      var area = "Service";
      if (remark.indexOf("kitchen") !== -1 || remark.indexOf("주방") !== -1) area = "Kitchen";
      else if (remark.indexOf("office") !== -1 || remark.indexOf("오피스") !== -1) area = "Office";
      else if (remark.indexOf("service") !== -1 || remark.indexOf("서비스") !== -1) area = "Service";
      var nameStr = String(row[2] || "").trim();
      result.push({
        date: rowDateStr,
        name: nameStr,
        nick: nameToNick[nameStr] || nameStr,
        pIn: formatTimeSafe(row[3]) || "09:00",
        pOut: formatTimeSafe(row[4]) || "18:00",
        pBS: formatTimeSafe(row[5]),
        pBE: formatTimeSafe(row[6]),
        area: area
      });
    }
    return result;
  } catch (err) {
    return [];
  }
}

/** [모바일] 주간 시간표 조회 (Supabase) - storeFilter: 매장명 또는 "All", areaFilter: "All" | "Service" | "Kitchen" */
function getMobileWeeklySchedule(storeFilter, mondayStr, areaFilter) {
  try {
    var mondayNorm = (mondayStr && String(mondayStr).trim()) ? String(mondayStr).trim() : "";
    var match = mondayNorm.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) mondayNorm = match[1] + "-" + ("0" + match[2]).slice(-2) + "-" + ("0" + match[3]).slice(-2);
    else {
      match = mondayNorm.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
      if (match) mondayNorm = match[1] + "-" + ("0" + match[2]).slice(-2) + "-" + ("0" + match[3]).slice(-2);
    }
    if (!mondayNorm || mondayNorm.length < 10) return [];
    var filter = (storeFilter != null && storeFilter !== undefined) ? String(storeFilter).trim() : "";
    var isAll = !filter || filter === "" || filter.toLowerCase() === "all" || filter === "전체" || filter === "전체 매장";
    var area = (areaFilter != null && areaFilter !== undefined) ? String(areaFilter).trim() : "";
    if (area.toLowerCase() === "all" || area === "전체" || area === "") area = "All";
    var out = [];
    if (isAll) {
      var storesObj = getStoresWithSchedule();
      var storeList = (storesObj && typeof storesObj === "object") ? Object.keys(storesObj) : [];
      if (storeList.length === 0) return [];
      for (var s = 0; s < storeList.length; s++) {
        var rows = getSavedWeeklyData(storeList[s], mondayNorm);
        for (var r = 0; r < rows.length; r++) {
          var row = rows[r];
          row.store = storeList[s];
          if (area === "All" || (row.area || "Service") === area) out.push(row);
        }
      }
      return out;
    }
    var rows = getSavedWeeklyData(filter, mondayNorm);
    if (rows.length === 0) {
      var stores = getStoresWithSchedule();
      var storeList = (stores && typeof stores === "object") ? Object.keys(stores) : [];
      for (var s = 0; s < storeList.length; s++) {
        if (String(storeList[s] || "").trim().toLowerCase() === filter.toLowerCase()) {
          rows = getSavedWeeklyData(storeList[s], mondayNorm);
          break;
        }
      }
    }
    for (var i = 0; i < rows.length; i++) {
      rows[i].store = rows[i].store || filter;
      if (area === "All" || (rows[i].area || "Service") === area) out.push(rows[i]);
    }
    return out;
  } catch (e) {
    Logger.log("getMobileWeeklySchedule Error: " + e.message);
    return [];
  }
}

/** [모바일] 주간 시간표 조회 실패 시 원인 파악용 - 반환: { reason: string } (Supabase 기준) */
function getMobileWeeklyScheduleDebug(storeFilter, mondayStr, areaFilter) {
  try {
    var mondayNorm = (mondayStr && String(mondayStr).trim()) ? String(mondayStr).trim() : "";
    var match = mondayNorm.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) mondayNorm = match[1] + "-" + ("0" + match[2]).slice(-2) + "-" + ("0" + match[3]).slice(-2);
    else {
      match = mondayNorm.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
      if (match) mondayNorm = match[1] + "-" + ("0" + match[2]).slice(-2) + "-" + ("0" + match[3]).slice(-2);
    }
    if (!mondayNorm || mondayNorm.length < 10) return { reason: "기간 형식 오류 (yyyy-MM-dd 필요). 전달값: " + String(mondayStr) };
    var filter = (storeFilter != null && storeFilter !== undefined) ? String(storeFilter).trim() : "";
    var isAll = !filter || filter === "" || filter.toLowerCase() === "all" || filter === "전체" || filter === "전체 매장";
    var storesObj = getStoresWithSchedule();
    var storeList = (storesObj && typeof storesObj === "object") ? Object.keys(storesObj) : [];
    if (storeList.length === 0) return { reason: "저장된 시간표가 없습니다. (Supabase schedules)" };
    if (isAll) {
      var total = 0;
      for (var s = 0; s < storeList.length; s++) {
        var rows = getSavedWeeklyData(storeList[s], mondayNorm);
        total += (rows && rows.length) ? rows.length : 0;
      }
      if (total === 0) return { reason: "기간 " + mondayNorm + " ~ 해당 주에 맞는 데이터가 없습니다." };
      return { reason: "" };
    }
    var rows = getSavedWeeklyData(filter, mondayNorm);
    if (rows.length === 0) {
      var hint = storeList.length > 0 ? " 등록된 매장: " + storeList.slice(0, 5).join(", ") + (storeList.length > 5 ? " 외 " + (storeList.length - 5) + "개" : "") : "";
      return { reason: "매장 '" + filter + "' / 기간 " + mondayNorm + " 에 해당하는 행이 없습니다." + hint };
    }
    return { reason: "" };
  } catch (e) {
    return { reason: "오류: " + (e.message || String(e)) };
  }
}

/** [모바일] 당일/지정일 실시간 근무 현황 - storeFilter: 매장명 또는 "All", dateStr: yyyy-MM-dd (없으면 오늘) */
function getMobileTodayAttendance(storeFilter, dateStr) {
  try {
    var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok";
    var targetStr = (dateStr && String(dateStr).trim().substring(0, 10)) || Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
    return getAttendanceDailySummary(targetStr, targetStr, storeFilter || "All", "");
  } catch (e) {
    return [];
  }
}

/** [모바일] 내 출퇴근 기록 (기간) - storeName, userName, startStr, endStr. 반환: [{ date, time, type, store, name }, ...] */
function getMobileMyPunchRecords(storeName, userName, startStr, endStr) {
  try {
    if (!storeName || !userName) return [];
    var list = getAttendanceList(startStr || "", endStr || "", storeName, userName);
    return (list || []).map(function(r) {
      var ts = r.timestamp || "";
      var datePart = (ts.indexOf(" ") !== -1) ? ts.split(" ")[0] : ts.substring(0, 10);
      var timePart = (ts.indexOf(" ") !== -1) ? ts.split(" ")[1] : (ts.length >= 16 ? ts.substring(11, 16) : "");
      return { date: datePart, time: timePart, type: r.type || "", store: r.store || "", name: r.name || "" };
    });
  } catch (e) {
    return [];
  }
}

/** [모바일] 내 근태 월별 요약 - yearMonth: "yyyy-MM". 반환: { normalDays, otHours, otDays, lateMinutes, lateDays } */
function getMobileMyAttendanceSummary(storeName, userName, yearMonth) {
  try {
    if (!storeName || !userName || !yearMonth) return { normalDays: 0, otHours: 0, otDays: 0, lateMinutes: 0, lateDays: 0 };
    var m = String(yearMonth).trim().match(/^(\d{4})-(\d{1,2})/);
    if (!m) return { normalDays: 0, otHours: 0, otDays: 0, lateMinutes: 0, lateDays: 0 };
    var startStr = m[1] + "-" + ("0" + m[2]).slice(-2) + "-01";
    var lastDay = new Date(parseInt(m[1], 10), parseInt(m[2], 10), 0);
    var endStr = m[1] + "-" + ("0" + (lastDay.getMonth() + 1)).slice(-2) + "-" + ("0" + lastDay.getDate()).slice(-2);
    var list = getAttendanceDailySummary(startStr, endStr, storeName, userName);
    var normalDays = 0, otMinutes = 0, otDays = 0, lateMinutes = 0, lateDays = 0;
    (list || []).forEach(function(r) {
      var late = Number(r.lateMin) || 0;
      var ot = Number(r.otMin) || 0;
      var hasOut = r.onlyIn !== true && r.outTimeStr !== "미기록";
      if (late > 0) { lateMinutes += late; lateDays++; }
      if (ot > 0) { otMinutes += ot; otDays++; }
      if (hasOut && late === 0) normalDays++;
    });
    return {
      normalDays: normalDays,
      otHours: Math.round((otMinutes / 60) * 10) / 10,
      otDays: otDays,
      lateMinutes: lateMinutes,
      lateDays: lateDays
    };
  } catch (e) {
    return { normalDays: 0, otHours: 0, otDays: 0, lateMinutes: 0, lateDays: 0 };
  }
}

/** [디버그] 스케줄 불러오기 원인 확인용 (Supabase) - getSavedWeeklyDataCheck('매장명','2026-01-27') */
function getSavedWeeklyDataCheck(storeName, mondayStr) {
  var data = getSchedulesData();
  if (!data || data.length === 0) return { ok: false, reason: "저장된 시간표 없음(Supabase)", rowCount: 0 };
  var mMatch = String(mondayStr || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!mMatch) return { ok: false, reason: "월요일 형식 아님(yyyy-MM-dd 필요)", mondayStr: mondayStr };
  var y = parseInt(mMatch[1], 10), mo = parseInt(mMatch[2], 10), d = parseInt(mMatch[3], 10);
  var startStr = mondayStr.substring(0, 10);
  var endDate = new Date(Date.UTC(y, mo - 1, d + 6));
  var endStr = endDate.getUTCFullYear() + "-" + ("0" + (endDate.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + endDate.getUTCDate()).slice(-2);
  var firstRow = data[0];
  return {
    ok: true,
    reason: "확인용",
    rowCount: data.length,
    startStr: startStr,
    endStr: endStr,
    sampleStore: firstRow[1],
    sampleDateRaw: firstRow[0],
    storeNameSent: storeName
  };
}

function toScheduleDateStr(val, tz) {
  if (val instanceof Date) return Utilities.formatDate(val, tz, "yyyy-MM-dd");
  var s = String(val || "").trim();
  if (!s) return "";
  if (s.indexOf("T") !== -1) {
    try {
      var d = new Date(val);
      if (!isNaN(d.getTime())) return Utilities.formatDate(d, tz, "yyyy-MM-dd");
    } catch (e) {}
  }
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

// 2. 주간 그리드 데이터를 Supabase schedules에 저장 (해당 매장/해당 주 기존 행 삭제 후 일괄 삽입)
var SCH_HEADERS = ["날짜", "매장명", "이름", "계획출근", "계획퇴근", "계획휴게시작", "계획휴게종료", "비고", "기록 날짜"];

function saveWeeklySmartSchedule(storeName, mondayDate, scheduleArray) {
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok";
  var startStr = Utilities.formatDate(new Date(mondayDate), tz, "yyyy-MM-dd");
  var endDt = new Date(mondayDate);
  endDt.setDate(endDt.getDate() + 6);
  var endStr = Utilities.formatDate(endDt, tz, "yyyy-MM-dd");
  var storeNorm = String(storeName || "").trim();
  if (!storeNorm) return "❌ 매장명이 없습니다.";

  var data = getSchedulesData();
  for (var i = data.length - 1; i >= 0; i--) {
    var row = data[i];
    var rowStore = String(row[1] || "").trim();
    var rowDateStr = (typeof row[0] === "string") ? row[0].slice(0, 10) : toScheduleDateStr(row[0], tz);
    if (rowStore === storeNorm && rowDateStr && rowDateStr >= startStr && rowDateStr <= endStr) {
      try { supabaseDelete('schedules', row[8]); } catch (e) { Logger.log('delete schedule id ' + row[8] + ': ' + e.message); }
    }
  }

  if (!scheduleArray || scheduleArray.length === 0) return "✅ " + storeName + " 해당 주 시간표가 삭제되었습니다.";
  var toInsert = [];
  for (var j = 0; j < scheduleArray.length; j++) {
    var s = scheduleArray[j];
    var remark = (s.remark && String(s.remark).trim()) ? String(s.remark).trim() : "스마트스케줄러";
    toInsert.push({
      schedule_date: String(s.date || "").substring(0, 10),
      store_name: storeNorm,
      name: String(s.name || "").trim(),
      plan_in: String(s.pIn || "09:00").trim(),
      plan_out: String(s.pOut || "18:00").trim(),
      break_start: String(s.pBS || "").trim(),
      break_end: String(s.pBE || "").trim(),
      memo: remark
    });
  }
  try {
    var CHUNK = 50;
    for (var k = 0; k < toInsert.length; k += CHUNK) {
      supabaseInsertMany('schedules', toInsert.slice(k, k + CHUNK));
    }
    return "✅ " + storeName + " 주간 시간표가 저장되었습니다!";
  } catch (e) {
    return "❌ 저장 실패: " + (e && e.message ? e.message : String(e));
  }
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
