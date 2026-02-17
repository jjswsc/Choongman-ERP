/* =================================================================
   (운영 관리: 대시보드, 공지, 업무일지)
   ================================================================= */

/* =================================================================
   공지 사항
   ================================================================= */
function saveNotice(t) { PropertiesService.getScriptProperties().setProperty("SYSTEM_NOTICE", t); return "저장됨"; }


// 3. [관리자] 공지사항 등록 (Officer 이상만, Supabase notices)
function adminSaveNotice(data, userRole) {
  var r = String(userRole).toLowerCase();
  if (!r.includes("officer") && !r.includes("director") && !r.includes("ceo") && !r.includes("admin")) {
    return "❌ 권한이 없습니다. (Officer 이상만 가능)";
  }
  var id = Date.now();
  var attachJson = "";
  if (data.attachments && data.attachments.length > 0) {
    var driveFolder = getOrCreateNoticeAttachmentFolder();
    var list = [];
    for (var i = 0; i < data.attachments.length; i++) {
      var a = data.attachments[i];
      if (!a.base64 || !a.fileName) continue;
      try {
        var blob = Utilities.newBlob(Utilities.base64Decode(a.base64), a.mimeType || "application/octet-stream", a.fileName);
        var file = driveFolder.createFile(blob);
        list.push({ id: file.getId(), url: "https://drive.google.com/uc?export=view&id=" + file.getId(), name: a.fileName, mime: (a.mimeType || "").toLowerCase() });
      } catch (e) { list.push({ error: a.fileName, msg: String(e) }); }
    }
    attachJson = JSON.stringify(list);
  }
  try {
    supabaseInsert("notices", {
      id: id,
      title: String(data.title || "").trim(),
      content: String(data.content || "").trim(),
      target_store: String(data.targetStore || "전체").trim(),
      target_role: String(data.targetRole || "전체").trim(),
      sender: String(data.sender || "").trim(),
      attachments: attachJson
    });
  } catch (e) {
    Logger.log("adminSaveNotice: " + e.message);
    return "❌ 등록 실패: " + e.message;
  }
  return "✅ 공지사항이 등록되었습니다.";
}

function getOrCreateNoticeAttachmentFolder() {
  var root = DriveApp.getRootFolder();
  var it = root.getFoldersByName("공지첨부");
  if (it.hasNext()) return it.next();
  return root.createFolder("공지첨부");
}

/* [수정] 앱 공지사항 조회 (Supabase notices + notice_reads) */
function getMyNotices(store, role, name) {
  var myStore = String(store).trim();
  var myRole = String(role).toLowerCase().trim();
  var readMap = {}; // notice_id -> status (확인/다음에)
  try {
    var userName = String(name || "").trim();
    var readRows = supabaseSelectFilter("notice_reads", "store=eq." + encodeURIComponent(myStore) + "&name=eq." + encodeURIComponent(userName)) || [];
    for (var i = 0; i < readRows.length; i++) {
      readMap[readRows[i].notice_id] = readRows[i].status || "확인";
    }
  } catch (e) { Logger.log("getMyNotices notice_reads: " + e.message); }
  var list = [];
  try {
    var rows = supabaseSelect("notices", { order: "created_at.desc" }) || [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var targetStores = String(row.target_store || "전체").trim();
      var targetRoles = String(row.target_role || "전체").trim();
      var storeMatch = (targetStores === "전체" || targetStores.indexOf(myStore) > -1);
      var roleMatch = (targetRoles === "전체" || targetRoles.toLowerCase().indexOf(myRole) > -1);
      if (!storeMatch || !roleMatch) continue;
      var att = [];
      if (row.attachments) { try { att = JSON.parse(row.attachments); } catch (e) {} }
      var created = row.created_at ? (typeof row.created_at === "string" ? row.created_at : new Date(row.created_at).toISOString()) : "";
      var dateStr = created ? created.slice(0, 10) : "";
      list.push({
        id: row.id,
        date: dateStr,
        title: row.title || "",
        content: row.content || "",
        sender: row.sender || "",
        status: readMap[row.id] || "New",
        attachments: att
      });
    }
  } catch (e) { Logger.log("getMyNotices notices: " + e.message); }
  return list;
}

// 2. [앱] 공지사항 확인/다음에 버튼 처리 (Supabase notice_reads upsert)
function logNoticeRead(id, store, name, action) {
  var noticeId = Number(id);
  if (isNaN(noticeId)) return "잘못된 공지 ID입니다.";
  try {
    supabaseUpsertMany("notice_reads", [{
      notice_id: noticeId,
      store: String(store || "").trim(),
      name: String(name || "").trim(),
      read_at: new Date().toISOString(),
      status: String(action || "확인").trim()
    }], "notice_id,store,name");
  } catch (e) {
    Logger.log("logNoticeRead: " + e.message);
    return "처리 실패: " + e.message;
  }
  return "처리되었습니다.";
}

/* 1. 관리자용: 공지 발송 내역 조회 (Supabase notices, 날짜 검색 + 발신자 필터 포함) */
function getNoticeHistoryAdmin(startDate, endDate, senderFilter) {
  var start = startDate ? new Date(startDate + "T00:00:00") : new Date("2000-01-01");
  var end = endDate ? new Date(endDate + "T23:59:59") : new Date();
  var senderKey = (senderFilter && String(senderFilter).trim()) ? String(senderFilter).trim().toLowerCase() : "";
  var list = [];
  try {
    var rows = supabaseSelect("notices", { order: "created_at.desc" }) || [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var rowDate = r.created_at ? new Date(r.created_at) : new Date(0);
      if (rowDate < start || rowDate > end) continue;
      if (senderKey && String(r.sender || "").toLowerCase().indexOf(senderKey) === -1) continue;
      var att = [];
      if (r.attachments) { try { att = JSON.parse(r.attachments); } catch (e) {} }
      list.push({
        id: r.id,
        date: Utilities.formatDate(rowDate, "GMT+7", "yyyy-MM-dd HH:mm"),
        title: r.title || "",
        content: r.content || "",
        targetStore: r.target_store || "",
        targetRole: r.target_role || "",
        sender: r.sender || "",
        attachments: att
      });
    }
  } catch (e) { Logger.log("getNoticeHistoryAdmin: " + e.message); }
  return list;
}

/* [최종 완결] 수신 확인 현황 (Supabase notices + notice_reads). storeFilter 있으면 해당 매장만 */
function adminGetNoticeStats(noticeId, storeFilter) {
  var targetStores = "", targetRoles = "";
  try {
    var noticeRows = supabaseSelectFilter("notices", "id=eq." + encodeURIComponent(Number(noticeId)), { limit: 1 });
    if (!noticeRows || noticeRows.length === 0) return [];
    targetStores = String(noticeRows[0].target_store || "");
    targetRoles = String(noticeRows[0].target_role || "");
  } catch (e) { return []; }
  if (targetStores === "" && targetRoles === "") return [];

  var readMap = {};
  try {
    var readRows = supabaseSelectFilter("notice_reads", "notice_id=eq." + encodeURIComponent(Number(noticeId))) || [];
    for (var i = 0; i < readRows.length; i++) {
      var key = (readRows[i].store || "") + "_" + (readRows[i].name || "");
      var readAt = readRows[i].read_at;
      readMap[key] = readAt ? Utilities.formatDate(new Date(readAt), "GMT+7", "MM-dd HH:mm") : "-";
    }
  } catch (e) { Logger.log("adminGetNoticeStats notice_reads: " + e.message); }

  var eList = (typeof getEmployeesData === "function" ? getEmployeesData() : []) || [];
  var result = [];
  var filterStore = (storeFilter && String(storeFilter).trim()) ? String(storeFilter).trim() : "";
  for (var i = 0; i < eList.length; i++) {
    var e = eList[i];
    var eStore = String(e.store || "").trim();
    var eName = String(e.name || "").trim();
    var resignDate = e.resign_date ? String(e.resign_date).trim() : "";
    if (eName === "" || (resignDate && resignDate !== "")) continue;
    if (eStore === "" || eStore === "매장명") continue;
    if (filterStore && eStore !== filterStore) continue;
    // 공지 대상 직급: 폼에서 job/role 기준 선택 → employees의 job 또는 role로 매칭
    var eRole = String(e.job || e.role || "").trim();
    if (eRole === "") eRole = "Staff";
    var isStoreTarget = (targetStores === "전체" || targetStores.indexOf(eStore) > -1);
    var isRoleTarget = (targetRoles === "전체" || targetRoles.toLowerCase().indexOf(eRole.toLowerCase()) > -1);
    var key = eStore + "_" + eName;
    var readTime = readMap[key];
    if ((isStoreTarget && isRoleTarget) || readTime) {
      var isRead = (readTime && readTime !== "-");
      result.push({
        store: eStore,
        name: eName,
        role: eRole,
        status: isRead ? "확인" : "미확인",
        date: readTime || "-"
      });
    }
  }

  result.sort(function(a, b) {
    if (a.status === b.status) return 0;
    return a.status === "미확인" ? -1 : 1;
  });

  return result;
}

/* [추가] 공지사항 발송용 매장/부서(job) 목록 불러오기 (Supabase employees - job 열 기준) */
function getNoticeOptions() {
  var list = (typeof getEmployeesData === "function" ? getEmployeesData() : []) || [];
  var stores = {};
  var jobs = {};
  for (var i = 0; i < list.length; i++) {
    var store = String(list[i].store || "").trim();
    var job = String(list[i].job || list[i].role || "").trim();
    if (store && store !== "매장명" && store !== "Store") stores[store] = true;
    if (job && job !== "직급" && job !== "Job" && job !== "부서") jobs[job] = true;
  }
  var jobList = Object.keys(jobs).sort(function(a, b) { return (a || "").localeCompare(b || ""); });
  return {
    stores: Object.keys(stores).sort(),
    roles: jobList
  };
}

/** [모바일 Admin] 공지/연차/근태용 매장·직급 옵션 (오피스=전매장, 매니저=해당 매장만) */
function getNoticeOptionsForMobile(userStore, userRole) {
  var opt = getNoticeOptions();
  var r = String(userRole || "").toLowerCase();
  var isOffice = r.indexOf("director") !== -1 || r.indexOf("officer") !== -1 || r.indexOf("ceo") !== -1 || r.indexOf("hr") !== -1;
  var stores = isOffice ? (opt.stores || []) : (userStore ? [String(userStore).trim()] : []);
  return { stores: stores, roles: (opt.roles || []) };
}

/* [추가] 관리자용: 공지사항 삭제 (Supabase: notice_reads 먼저 삭제 후 notices 삭제) */
function deleteNoticeAdmin(id) {
  var nId = Number(id);
  if (isNaN(nId)) return "Error";
  try {
    var readRows = supabaseSelectFilter("notice_reads", "notice_id=eq." + nId) || [];
    for (var i = 0; i < readRows.length; i++) {
      supabaseDelete("notice_reads", readRows[i].id);
    }
    supabaseDelete("notices", nId);
    return "Success";
  } catch (e) {
    Logger.log("deleteNoticeAdmin: " + e.message);
    return "Not found";
  }
}

/* =================================================================
   업무 일지
   ================================================================= */
/* 1. 업무일지 데이터 조회 (Supabase work_logs + 직원 이름 변환) */
function getWorkLogData(dateStr, name) {
  var staffList = (typeof getEmployeesData === "function" ? getEmployeesData() : []) || [];
  var searchKey = String(name).toLowerCase().replace(/\s+/g, "");
  var targetName = name;
  for (var k = 0; k < staffList.length; k++) {
    var fName = String(staffList[k].name || "").toLowerCase().replace(/\s+/g, "");
    var nName = String(staffList[k].nick || "").toLowerCase().replace(/\s+/g, "");
    if (searchKey.includes(fName) || fName.includes(searchKey) || (nName && searchKey.includes(nName))) {
      targetName = (staffList[k].nick && String(staffList[k].nick).trim()) ? staffList[k].nick : staffList[k].name;
      break;
    }
  }
  var finish = [];
  var continueItems = [];
  var todayItems = [];
  try {
    var rows = supabaseSelectFilter("work_logs", "name=eq." + encodeURIComponent(targetName), { order: "log_date.desc" }) || [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var rowDateStr = r.log_date ? (typeof r.log_date === "string" ? r.log_date.slice(0, 10) : r.log_date) : "";
      if (!rowDateStr) continue;
      if (String(r.name) !== String(targetName)) continue;
      var item = {
        id: r.id,
        content: r.content || "",
        progress: Number(r.progress) || 0,
        status: String(r.status || ""),
        priority: r.priority || "",
        managerCheck: r.manager_check || "",
        managerComment: r.manager_comment || ""
      };
      if (rowDateStr === dateStr) {
        if (item.status === "Finish" || item.progress >= 100) finish.push(item);
        else if (item.status === "Continue") continueItems.push(item);
        else todayItems.push(item);
      }
    }
    var existingContent = continueItems.map(function(x) { return x.content; });
    for (var j = 0; j < rows.length; j++) {
      var r2 = rows[j];
      var rowDateStr2 = r2.log_date ? (typeof r2.log_date === "string" ? r2.log_date.slice(0, 10) : r2.log_date) : "";
      if (String(r2.name) !== String(targetName) || rowDateStr2 >= dateStr || String(r2.status) !== "Continue") continue;
      if (existingContent.indexOf(r2.content || "") !== -1) continue;
      continueItems.push({
        id: r2.id,
        content: r2.content || "",
        progress: Number(r2.progress) || 0,
        priority: r2.priority || "",
        status: "Continue",
        managerComment: "⚡ 이월됨 (" + rowDateStr2 + ")"
      });
      existingContent.push(r2.content || "");
      if (continueItems.length >= 20) break;
    }
  } catch (e) { Logger.log("getWorkLogData: " + e.message); }
  return { finish: finish, continueItems: continueItems, todayItems: todayItems };
}

/* [수정] 업무 마감 처리 (Supabase work_logs, 이월 Carry Over) */
function submitDailyClose(date, name, jsonStr) {
  var staffList = (typeof getEmployeesData === "function" ? getEmployeesData() : []) || [];
  var savedName = name;
  var savedDept = "기타";
  var searchKey = String(name).toLowerCase().replace(/\s+/g, "");
  for (var i = 0; i < staffList.length; i++) {
    var fName = String(staffList[i].name || "").toLowerCase().replace(/\s+/g, "");
    var nName = String(staffList[i].nick || "").toLowerCase().replace(/\s+/g, "");
    if (searchKey.includes(fName) || fName.includes(searchKey) || (nName && searchKey.includes(nName))) {
      savedName = (staffList[i].nick && String(staffList[i].nick).trim()) ? staffList[i].nick : staffList[i].name;
      savedDept = staffList[i].job || "Staff";
      break;
    }
  }
  var logs = JSON.parse(jsonStr);
  var timeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || "Asia/Bangkok";
  try {
    for (var idx = 0; idx < logs.length; idx++) {
      var item = logs[idx];
      var progress = Number(item.progress);
      var existing = (item.id) ? (supabaseSelectFilter("work_logs", "id=eq." + encodeURIComponent(String(item.id)), { limit: 1 }) || []) : [];
      if (progress >= 100) {
        if (existing.length > 0) {
          supabaseUpdate("work_logs", String(item.id), { progress: 100, status: "Finish" });
        } else {
          supabaseInsert("work_logs", { id: date + "_" + savedName + "_" + new Date().getTime(), log_date: date, dept: savedDept, name: savedName, content: item.content || "", progress: 100, status: "Finish", priority: item.priority || "", manager_check: "대기", manager_comment: "" });
        }
      } else {
        if (existing.length > 0) {
          supabaseUpdate("work_logs", String(item.id), { progress: progress, status: "Carry Over" });
        } else {
          supabaseInsert("work_logs", { id: date + "_" + savedName + "_" + new Date().getTime(), log_date: date, dept: savedDept, name: savedName, content: item.content || "", progress: progress, status: "Carry Over", priority: item.priority || "", manager_check: "대기", manager_comment: "" });
        }
        var tomorrow = new Date(date + "T12:00:00");
        tomorrow.setDate(tomorrow.getDate() + 1);
        var nextDateStr = Utilities.formatDate(tomorrow, timeZone, "yyyy-MM-dd");
        var nextId = nextDateStr + "_CARRY_" + new Date().getTime() + Math.floor(Math.random() * 100);
        supabaseInsert("work_logs", { id: nextId, log_date: nextDateStr, dept: savedDept, name: savedName, content: item.content || "", progress: progress, status: "Continue", priority: item.priority || "", manager_check: "대기", manager_comment: "⚡ 이월됨 (" + date + " 부터)" });
      }
    }
  } catch (e) {
    Logger.log("submitDailyClose: " + e.message);
    return "❌ 마감 처리 실패: " + e.message;
  }
  return "✅ 마감 완료! (완료건 저장, 미완료건 내일로 이월됨)";
}

/* 3. 일반 중간 저장 (Supabase work_logs) */
function saveWorkLogData(date, name, jsonStr) {
  var staffList = (typeof getEmployeesData === "function" ? getEmployeesData() : []) || [];
  var savedName = name;
  var savedDept = "기타";
  var searchKey = String(name).toLowerCase().replace(/office/g, "").replace(/\s+/g, "");
  for (var i = 0; i < staffList.length; i++) {
    var fName = String(staffList[i].name || "").toLowerCase().replace(/\s+/g, "");
    var nName = String(staffList[i].nick || "").toLowerCase().replace(/\s+/g, "");
    if (searchKey.includes(fName) || fName.includes(searchKey) || (nName && searchKey.includes(nName))) {
      savedName = (staffList[i].nick && String(staffList[i].nick).trim()) ? staffList[i].nick : staffList[i].name;
      savedDept = staffList[i].job || "Staff";
      break;
    }
  }
  var logs = JSON.parse(jsonStr);
  try {
    for (var idx = 0; idx < logs.length; idx++) {
      var item = logs[idx];
      var progressVal = Number(item.progress);
      var status = (progressVal >= 100) ? "Finish" : (item.type === "continue" ? "Continue" : "Today");
      var existing = (item.id) ? (supabaseSelectFilter("work_logs", "id=eq." + encodeURIComponent(String(item.id)), { limit: 1 }) || []) : [];
      var patch = { dept: savedDept, name: savedName, content: item.content || "", progress: progressVal, status: status, priority: item.priority || "" };
      if (existing.length > 0) {
        supabaseUpdate("work_logs", String(item.id), patch);
      } else {
        var newId = date + "_" + savedName + "_" + new Date().getTime() + "_" + Math.floor(Math.random() * 100);
        supabaseInsert("work_logs", { id: newId, log_date: date, dept: savedDept, name: savedName, content: item.content || "", progress: progressVal, status: status, priority: item.priority || "", manager_check: "대기", manager_comment: "" });
      }
    }
  } catch (e) {
    Logger.log("saveWorkLogData: " + e.message);
    return "FAIL";
  }
  return "SUCCESS";
}

/* 5. [관리자용] 승인 및 코멘트 업데이트 (Supabase work_logs) */
function updateManagerCheck(id, status, comment) {
  try {
    var patch = { manager_check: String(status || "").trim() };
    if (comment != null) patch.manager_comment = String(comment).trim();
    supabaseUpdate("work_logs", String(id), patch);
  } catch (e) {
    Logger.log("updateManagerCheck: " + e.message);
    return "ERROR";
  }
  return "UPDATED";
}

/* [수정] 관리자 필터 (업무일지 work_logs에 나타날 수 있는 전체 부서·직원) - Office만이 아닌 전 직원 기준 */
function getAllFilterOptions() {
  var list = (typeof getEmployeesData === "function" ? getEmployeesData() : []) || [];
  var deptSet = {};
  var staffList = [];
  for (var i = 0; i < list.length; i++) {
    var rowName = String(list[i].nick || "").trim() || String(list[i].name || "").trim();
    var rowDept = String(list[i].job || "").trim();
    if (rowDept === "") rowDept = "Staff";
    if (rowName !== "") staffList.push(rowName);
    deptSet[rowDept] = true;
  }
  // work_logs에 "기타"로 저장되는 경우 포함
  if (!deptSet["기타"]) deptSet["기타"] = true;
  return {
    depts: Object.keys(deptSet).sort(),
    staff: staffList.filter(function(v, i, a) { return a.indexOf(v) === i; }).sort()
  };
}

/* 1. 오피스 직원 목록 (Supabase employees - store=Office/본사/오피스) */
function getOfficeStaffList(callerName) {
  var data = (typeof getEmployeesData === "function" ? getEmployeesData() : []) || [];
  var list = [];
  var isAdmin = false;
  var adminTitles = ["Manager", "Director", "CEO", "GM", "Head", "Admin", "점장", "관리자", "대표", "ผจก", "MD", "Owner", "Office"];
  var cleanCaller = String(callerName || "").toLowerCase().replace(/\s+/g, "");
  for (var i = 0; i < data.length; i++) {
    var st = String(data[i].store || "").toLowerCase();
    if (st.indexOf("office") === -1 && st !== "본사" && st !== "오피스") continue;
    var rowFullName = String(data[i].name || "").trim();
    var rowNickName = String(data[i].nick || "").trim();
    var rowDept = String(data[i].job || "").trim();
    if (rowFullName === "" && rowNickName === "") continue;
    var nameToShow = (rowNickName !== "") ? rowNickName : rowFullName;
    var deptToShow = (rowDept !== "") ? rowDept : "Staff";
    list.push({ name: nameToShow, dept: deptToShow });
    var cleanFull = rowFullName.toLowerCase().replace(/\s+/g, "");
    var cleanNick = rowNickName.toLowerCase().replace(/\s+/g, "");
    if (cleanCaller.includes(cleanFull) || cleanFull.includes(cleanCaller) || (cleanNick !== "" && (cleanCaller.includes(cleanNick) || cleanNick.includes(cleanCaller)))) {
      for (var k = 0; k < adminTitles.length; k++) {
        if (rowDept.toLowerCase().indexOf(adminTitles[k].toLowerCase()) !== -1) { isAdmin = true; break; }
      }
    }
  }
  return { list: list, isAdmin: isAdmin };
}

/** 오피스 직원 부서 목록 (Supabase employees - Office만) - 매장 방문 현황 부서 필터용 */
function getOfficeDepartments() {
  var data = (typeof getEmployeesData === "function" ? getEmployeesData() : []) || [];
  var set = {};
  for (var i = 0; i < data.length; i++) {
    var st = String(data[i].store || "").toLowerCase();
    if (st.indexOf("office") === -1 && st !== "본사" && st !== "오피스") continue;
    var rowDept = String(data[i].job || "").trim();
    if (rowDept === "") rowDept = "Staff";
    set[rowDept] = true;
  }
  return Object.keys(set).sort();
}

/** 특정 부서 오피스 직원 이름 목록 (Supabase employees) - 방문 기록 필터용 */
function getOfficeNamesByDept(department) {
  if (!department || department === "All" || String(department).trim() === "") return [];
  var data = (typeof getEmployeesData === "function" ? getEmployeesData() : []) || [];
  var names = [];
  var deptFilter = String(department).trim();
  for (var i = 0; i < data.length; i++) {
    var st = String(data[i].store || "").toLowerCase();
    if (st.indexOf("office") === -1 && st !== "본사" && st !== "오피스") continue;
    var rowDept = String(data[i].job || "").trim();
    if (rowDept === "") rowDept = "Staff";
    if (rowDept !== deptFilter) continue;
    var nameToShow = String(data[i].nick || "").trim() || String(data[i].name || "").trim();
    if (nameToShow && names.indexOf(nameToShow) === -1) names.push(nameToShow);
  }
  return names;
}

/** 특정 부서 오피스 직원 목록 (Supabase employees) - 매장 방문 현황 직원 드롭다운용 */
function getOfficeStaffListByDept(department) {
  var data = (typeof getEmployeesData === "function" ? getEmployeesData() : []) || [];
  var list = [];
  var deptFilter = (department === "All" || department === "" || department == null) ? null : String(department).trim();
  for (var i = 0; i < data.length; i++) {
    var st = String(data[i].store || "").toLowerCase();
    if (st.indexOf("office") === -1 && st !== "본사" && st !== "오피스") continue;
    var rowDept = String(data[i].job || "").trim();
    if (rowDept === "") rowDept = "Staff";
    if (deptFilter !== null && rowDept !== deptFilter) continue;
    var nameToShow = String(data[i].nick || "").trim() || String(data[i].name || "").trim();
    if (nameToShow === "") continue;
    list.push({ name: nameToShow, dept: rowDept });
  }
  return { list: list };
}

/* [최종 통합] 관리자 조회 (Supabase work_logs, 날짜 구간) */
function getManagerRangeReport(startStr, endStr) {
  var result = [];
  try {
    var rows = supabaseSelectFilter("work_logs", "log_date=gte." + encodeURIComponent(startStr) + "&log_date=lte." + encodeURIComponent(endStr), { order: "log_date.asc" }) || [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var rowDate = r.log_date ? (typeof r.log_date === "string" ? r.log_date.slice(0, 10) : r.log_date) : "";
      result.push({
        id: r.id,
        date: rowDate,
        dept: r.dept || "",
        name: r.name || "",
        content: r.content || "",
        progress: Number(r.progress) || 0,
        status: r.status || "",
        priority: r.priority || "",
        managerCheck: r.manager_check || "",
        managerComment: r.manager_comment || ""
      });
    }
  } catch (e) { Logger.log("getManagerRangeReport: " + e.message); }
  return result;
}