/* =================================================================
   (운영 관리: 대시보드, 공지, 업무일지)
   ================================================================= */

/* =================================================================
   공지 사항
   ================================================================= */
function saveNotice(t) { PropertiesService.getScriptProperties().setProperty("SYSTEM_NOTICE", t); return "저장됨"; }


// 3. [관리자] 공지사항 등록 (Officer 이상만)
function adminSaveNotice(data, userRole) {
  // 권한 체크
  var r = String(userRole).toLowerCase();
  if (!r.includes("officer") && !r.includes("director") && !r.includes("ceo") && !r.includes("admin") && !r.includes("manager")) {
    return "❌ 권한이 없습니다. (Officer/매니저 이상만 가능)";
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("공지사항");
  if (!sheet) { ss.insertSheet("공지사항"); sheet = ss.getSheetByName("공지사항"); sheet.appendRow(["ID","날짜","제목","내용","대상매장","대상직급","작성자","첨부"]); }
  // 기존 시트에 '첨부' 열이 없으면 헤더 추가 (한 번만)
  var lastCol = sheet.getLastColumn();
  if (lastCol < 8) { sheet.getRange(1, 8).setValue("첨부"); }

  var id = Date.now(); // 고유 ID 생성
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
  sheet.appendRow([
    id,
    new Date(),
    data.title,
    data.content,
    data.targetStore,
    data.targetRole,
    data.sender,
    attachJson
  ]);
  return "✅ 공지사항이 등록되었습니다.";
}

function getOrCreateNoticeAttachmentFolder() {
  var root = DriveApp.getRootFolder();
  var it = root.getFoldersByName("공지첨부");
  if (it.hasNext()) return it.next();
  return root.createFolder("공지첨부");
}

/* [수정] 앱 공지사항 조회 (공백 제거 및 포함 여부 확인 강화) */
function getMyNotices(store, role, name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nSheet = ss.getSheetByName("공지사항");
  var rSheet = ss.getSheetByName("공지확인");
  if (!nSheet) return [];

  // 1) 읽은 기록 조회
  var readMap = {};
  if (rSheet) {
    var rData = rSheet.getDataRange().getValues();
    for (var i = 1; i < rData.length; i++) {
      if (String(rData[i][1]) == String(store) && String(rData[i][2]) == String(name)) {
        readMap[rData[i][0]] = rData[i][4]; 
      }
    }
  }

  // 2) 공지사항 필터링
  var nData = nSheet.getDataRange().getValues();
  var list = [];
  
  // 내 정보 (공백 제거 후 문자열 변환)
  var myStore = String(store).trim();
  var myRole = String(role).toLowerCase().trim();

  for (var i = nData.length - 1; i >= 1; i--) {
    var row = nData[i];
    var targetStores = String(row[4]); // 예: "강남점, 홍대점"
    var targetRoles = String(row[5]);  // 예: "manager, staff"
    
    // [핵심] 콤마로 된 목록에서 내 매장 찾기 (전체 포함)
    var storeMatch = (targetStores === "전체" || targetStores.indexOf(myStore) > -1);
    
    // [핵심] 직급 찾기 (대소문자 무시)
    var roleMatch = (targetRoles === "전체" || targetRoles.toLowerCase().indexOf(myRole) > -1);

    if (storeMatch && roleMatch) {
      var att = [];
      if (row[7]) { try { att = JSON.parse(row[7]); } catch (e) {} }
      list.push({
        id: row[0],
        date: Utilities.formatDate(new Date(row[1]), "GMT+7", "yyyy-MM-dd"),
        title: row[2],
        content: row[3],
        sender: row[6],
        status: readMap[row[0]] || "New",
        attachments: att
      });
    }
  }
  return list;
}

// 2. [앱] 공지사항 확인/다음에 버튼 처리
function logNoticeRead(id, store, name, action) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("공지확인");
  if (!sheet) { ss.insertSheet("공지확인"); sheet = ss.getSheetByName("공지확인"); sheet.appendRow(["공지ID","매장","이름","확인일시","상태"]); }
  
  // 기존 기록이 있는지 확인 (있으면 업데이트, 없으면 추가)
  var data = sheet.getDataRange().getValues();
  var foundRow = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) == id && String(data[i][1]) === store && String(data[i][2]) === name) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow > 0) {
    // 상태 수정
    sheet.getRange(foundRow, 4).setValue(new Date());
    sheet.getRange(foundRow, 5).setValue(action); // '확인' or '다음에'
  } else {
    // 신규 추가
    sheet.appendRow([id, store, name, new Date(), action]);
  }
  return "처리되었습니다.";
}

/* 1. 관리자용: 공지 발송 내역 조회 (날짜 검색 포함) */
function getNoticeHistoryAdmin(startDate, endDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("공지사항");
  if (!sheet) return [];
  
  var data = sheet.getDataRange().getValues();
  var list = [];
  
  // 날짜 필터 준비 (값이 없으면 전체 범위)
  var start = startDate ? new Date(startDate + "T00:00:00") : new Date("2000-01-01");
  var end = endDate ? new Date(endDate + "T23:59:59") : new Date();

  // 역순(최신순)으로 가져오기
  for (var i = data.length - 1; i >= 1; i--) {
    var rowDate = new Date(data[i][1]);
    
    // 날짜 범위 체크
    if (rowDate >= start && rowDate <= end) {
      var att = [];
      if (data[i][7]) { try { att = JSON.parse(data[i][7]); } catch (e) {} }
      list.push({
        id: data[i][0],
        date: Utilities.formatDate(rowDate, "GMT+7", "yyyy-MM-dd HH:mm"),
        title: data[i][2],
        content: data[i][3],
        targetStore: data[i][4],
        targetRole: data[i][5],
        sender: data[i][6],
        attachments: att
      });
    }
  }
  return list;
}

/* [최종 완결] 수신 확인 현황 (매장 자동 채움 + 빈칸 직급 Staff 자동 인식) */
function adminGetNoticeStats(noticeId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var nSheet = ss.getSheetByName("공지사항");
  var rSheet = ss.getSheetByName("공지확인");
  var eSheet = ss.getSheetByName("직원정보");
  
  if (!nSheet || !eSheet) return [];

  // (1) 공지사항의 타겟(누구한테 보냈나) 확인
  var nData = nSheet.getDataRange().getValues();
  var targetStores = "", targetRoles = "";
  for (var i = 1; i < nData.length; i++) {
    if (String(nData[i][0]) === String(noticeId)) {
      targetStores = String(nData[i][4]); 
      targetRoles = String(nData[i][5]);
      break;
    }
  }
  if (targetStores === "") return [];

  // (2) 직원들이 읽은 기록 가져오기
  var readMap = {}; 
  if (rSheet) {
    var rData = rSheet.getDataRange().getValues();
    for (var i = 1; i < rData.length; i++) {
      if (String(rData[i][0]) === String(noticeId)) {
        var key = rData[i][1] + "_" + rData[i][2]; // 매장_이름
        readMap[key] = Utilities.formatDate(new Date(rData[i][3]), "GMT+7", "MM-dd HH:mm");
      }
    }
  }

  // (3) 전체 직원 명부를 훑으면서 대상자 찾기
  var eData = eSheet.getDataRange().getValues();
  var result = [];
  
  var lastStore = ""; // 매장명 기억용 (병합된 셀 처리)

  for (var i = 1; i < eData.length; i++) {
    var rawStore = String(eData[i][0]).trim(); // A열: 매장
    var rawRole = String(eData[i][4]).trim();  // E열: 직급
    var eName = String(eData[i][1]).trim();    // B열: 이름
    var resignDate = eData[i][10];             // K열: 퇴사일

    // 1. 퇴사자이거나 이름이 아예 없으면 패스
    if (eName === "" || (resignDate && resignDate !== "")) continue;

    // 2. 매장명 처리 (비어있으면 윗줄 매장명 사용)
    if (rawStore !== "") {
      lastStore = rawStore;
    }
    var eStore = lastStore;

    // 매장명이 여전히 없으면(첫 줄 오류 등) 패스
    if (eStore === "" || eStore === "매장명") continue;

    // 3. 직급 처리 (비어있으면 무조건 'Staff'로 간주)
    // ★ 여기가 핵심: 직급이 비어있어도 'Staff'라고 이름표를 붙여서 조회되게 함
    var eRole = rawRole;
    if (eRole === "") eRole = "Staff";

    // 4. 타겟 매칭 (이 공지를 받아야 할 사람인가?)
    var isStoreTarget = (targetStores === "전체" || targetStores.indexOf(eStore) > -1);
    var isRoleTarget = (targetRoles === "전체" || targetRoles.toLowerCase().indexOf(eRole.toLowerCase()) > -1);

    // ★ 안전장치: 혹시 앱에서 읽은 기록이 있다면, 타겟 설정과 상관없이 무조건 명단에 포함
    var key = eStore + "_" + eName;
    var readTime = readMap[key];
    
    if ((isStoreTarget && isRoleTarget) || readTime) {
      result.push({
        store: eStore,
        name: eName,
        role: eRole,
        status: readTime ? "확인" : "미확인",
        date: readTime || "-"
      });
    }
  }

  // (4) 정렬: 안 읽은 사람(미확인)을 맨 위로!
  result.sort(function(a, b) {
    if (a.status === b.status) return 0;
    return a.status === "미확인" ? -1 : 1;
  });

  return result;
}

/* [추가] 공지사항 발송용 매장/직급 목록 불러오기 */
function getNoticeOptions() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName("직원정보");
  if (!s) return { stores: [], roles: [] };
  
  var data = s.getDataRange().getValues();
  var stores = {};
  var roles = {};
  
  // 2번째 줄부터 데이터 읽기
  for (var i = 1; i < data.length; i++) {
    var store = String(data[i][0]).trim(); // A열 (매장)
    var role = String(data[i][4]).trim();  // E열 (직급)
    
    // 빈칸이나 헤더는 제외하고 저장
    if (store && store !== "매장명" && store !== "Store") stores[store] = true;
    if (role && role !== "직급" && role !== "Job") roles[role] = true;
  }
  
  var roleList = Object.keys(roles);
  var priorityRoles = ["Assis Manager", "Assistant Manager", "Manager", "Service", "Kitchen", "Accounting"];
  roleList.sort(function(a, b) {
    var aLower = (a || "").toLowerCase();
    var bLower = (b || "").toLowerCase();
    var aIdx = priorityRoles.findIndex(function(r) { return (r || "").toLowerCase() === aLower; });
    var bIdx = priorityRoles.findIndex(function(r) { return (r || "").toLowerCase() === bLower; });
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return (a || "").localeCompare(b || "");
  });
  return {
    stores: Object.keys(stores).sort(),
    roles: roleList
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

/* [추가] 관리자용: 공지사항 삭제 기능 */
function deleteNoticeAdmin(id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("공지사항");
  if (!sheet) return "Error";
  
  var data = sheet.getDataRange().getValues();
  // 1행(헤더) 제외하고 역순으로 탐색 (삭제 시 인덱스 꼬임 방지)
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(id)) { // ID가 일치하면
      sheet.deleteRow(i + 1); // 해당 줄 삭제
      return "Success";
    }
  }
  return "Not found";
}

/* =================================================================
   업무 일지
   ================================================================= */
/* 1. 업무일지 데이터 조회 (본명 -> 닉네임 자동 변환 추가) */
function getWorkLogData(dateStr, name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("업무일지_DB");
  var staffSheet = ss.getSheetByName("직원정보");
  if(!sheet) return {finish:[], continueItems:[], todayItems:[]};

  // [핵심] 조회하려는 사람의 '진짜 저장된 이름(닉네임)' 찾기
  var staffData = staffSheet.getDataRange().getValues();
  var searchKey = String(name).toLowerCase().replace(/\s+/g, "");
  var targetName = name; // 못 찾으면 입력된 이름 그대로

  for(var k=1; k<staffData.length; k++) {
    var fName = String(staffData[k][1]).toLowerCase().replace(/\s+/g, ""); 
    var nName = String(staffData[k][2]).toLowerCase().replace(/\s+/g, ""); 
    if(searchKey.includes(fName) || fName.includes(searchKey) || (nName && searchKey.includes(nName))) {
       targetName = staffData[k][2] || staffData[k][1]; // 닉네임 우선 채택
       break;
    }
  }

  var data = sheet.getDataRange().getValues();
  var finish = [];
  var continueItems = [];
  var todayItems = [];
  
  // 1. [오늘] 데이터 가져오기
  for(var i=1; i<data.length; i++) {
    var rowDate = Utilities.formatDate(new Date(data[i][1]), "GMT+7", "yyyy-MM-dd");
    var rowName = data[i][3];
    
    // ★ 변환된 targetName으로 비교 (이제 직원이 본명으로 접속해도 닉네임 데이터를 찾아줍니다)
    if(rowDate === dateStr && String(rowName) === String(targetName)) {
      var item = {
        id: data[i][0],
        content: data[i][4],
        progress: Number(data[i][5]),
        status: String(data[i][6]), 
        priority: data[i][7],
        managerCheck: data[i][8], 
        managerComment: data[i][9]
      };
      
      if(item.status === 'Finish' || item.progress >= 100) {
          finish.push(item);
      } else if(item.status === 'Continue') {
          continueItems.push(item);
      } else {
          todayItems.push(item);
      }
    }
  }

  // 2. [과거] 미완료 업무 자동 이월 (날짜가 지났는데 아직 Continue인 것들)
  var existingContent = continueItems.map(x => x.content); 

  for(var i=data.length-1; i>=1; i--) {
    var rowName = data[i][3];
    var rowDate = Utilities.formatDate(new Date(data[i][1]), "GMT+7", "yyyy-MM-dd");
    var rowStatus = String(data[i][6]);
    var rowProgress = Number(data[i][5]);
    
    // 내 이름(닉네임)이고, 날짜가 지났고, 상태가 Continue면 가져옴
    if(String(rowName) === String(targetName) && rowDate < dateStr && rowStatus === 'Continue') {
       var content = data[i][4];
       if(!existingContent.includes(content)) {
          continueItems.push({
             id: data[i][0], 
             content: content,
             progress: rowProgress,
             priority: data[i][7],
             status: 'Continue',
             managerComment: "⚡ 이월됨 (" + rowDate + ")"
          });
          existingContent.push(content);
       }
    }
    if(continueItems.length >= 20) break;
  }

  return { finish: finish, continueItems: continueItems, todayItems: todayItems };
}

/* [수정] 업무 마감 처리 (이월 상태 명확화: Carry Over) */
function submitDailyClose(date, name, jsonStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dbSheet = ss.getSheetByName("업무일지_DB");
  var staffSheet = ss.getSheetByName("직원정보");
  
  // 1. 직원 정보 매핑
  var staffData = staffSheet.getDataRange().getValues();
  var savedName = name;
  var savedDept = "기타";
  var searchKey = String(name).toLowerCase().replace(/\s+/g, "");

  for(var i=1; i<staffData.length; i++) {
    var fName = String(staffData[i][1]).toLowerCase().replace(/\s+/g, ""); 
    var nName = String(staffData[i][2]).toLowerCase().replace(/\s+/g, ""); 
    if(searchKey.includes(fName) || fName.includes(searchKey) || (nName && searchKey.includes(nName))) {
       savedName = staffData[i][2] || staffData[i][1]; 
       savedDept = staffData[i][4] || "Staff"; 
       break;
    }
  }

  var logs = JSON.parse(jsonStr);
  var dbData = dbSheet.getDataRange().getValues();
  var timeZone = ss.getSpreadsheetTimeZone();

  logs.forEach(item => {
    var progress = Number(item.progress);
    var rowIndex = -1;

    if(item.id) {
      for(var k=1; k<dbData.length; k++) {
        if(String(dbData[k][0]) === String(item.id)) { rowIndex = k + 1; break; }
      }
    }

    // [CASE 1] 100% 달성 -> Finish (완료)
    if (progress >= 100) {
      if (rowIndex > 0) {
        dbSheet.getRange(rowIndex, 6).setValue(100);
        dbSheet.getRange(rowIndex, 7).setValue("Finish"); 
      } else {
        var newId = date + "_" + savedName + "_" + new Date().getTime();
        dbSheet.appendRow([newId, date, savedDept, savedName, item.content, 100, "Finish", item.priority, "대기", ""]);
      }
    } 
    // [CASE 2] 100% 미만 -> Carry Over (내일로 넘김)
    else {
      // 2-1. 오늘 기록은 'Carry Over'로 저장 (명확한 용어 사용)
      if (rowIndex > 0) {
        dbSheet.getRange(rowIndex, 6).setValue(progress);
        dbSheet.getRange(rowIndex, 7).setValue("Carry Over"); // ★ 상태 변경됨
      } else {
        var newId = date + "_" + savedName + "_" + new Date().getTime();
        dbSheet.appendRow([newId, date, savedDept, savedName, item.content, progress, "Carry Over", item.priority, "대기", ""]);
      }

      // 2-2. 내일 날짜로 새 항목 생성
      var todayDate = new Date(date); 
      var tomorrow = new Date(todayDate);
      tomorrow.setDate(todayDate.getDate() + 1);
      var nextDateStr = Utilities.formatDate(tomorrow, timeZone, "yyyy-MM-dd");

      var nextId = nextDateStr + "_CARRY_" + new Date().getTime() + Math.floor(Math.random()*100);
      
      dbSheet.appendRow([
          nextId, 
          nextDateStr,
          savedDept, 
          savedName, 
          item.content, 
          progress, 
          "Continue", 
          item.priority, 
          "대기", 
          "⚡ 이월됨 (" + date + " 부터)" 
      ]);
    }
  });

  return "✅ 마감 완료! (완료건 저장, 미완료건 내일로 이월됨)";
}

/* 3. 일반 중간 저장 (이름 변환 적용) */
function saveWorkLogData(date, name, jsonStr) {
  var dbSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("업무일지_DB");
  if(!dbSheet) dbSheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("업무일지_DB");
  var logs = JSON.parse(jsonStr);
  
  // 이름 변환
  var staffSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("직원정보");
  var staffData = staffSheet.getDataRange().getValues();
  var savedName = name; 
  var savedDept = "기타"; 
  var searchKey = String(name).toLowerCase().replace(/office/g, "").replace(/\s+/g, "");

  for(var i=1; i<staffData.length; i++) {
    var fName = String(staffData[i][1]).toLowerCase().replace(/\s+/g, ""); 
    var nName = String(staffData[i][2]).toLowerCase().replace(/\s+/g, ""); 
    if(searchKey.includes(fName) || fName.includes(searchKey) || (nName && searchKey.includes(nName))) {
       savedName = staffData[i][2] || staffData[i][1];
       savedDept = staffData[i][4] || "Staff";
       break;
    }
  }

  var dbData = dbSheet.getDataRange().getValues();
  
  logs.forEach(item => {
    var progressVal = Number(item.progress);
    var status = (progressVal >= 100) ? 'Finish' : (item.type === 'continue' ? 'Continue' : 'Today');
    var rowIndex = -1;

    if(item.id) {
      for(var i=1; i<dbData.length; i++) {
        if(String(dbData[i][0]) === String(item.id)) { rowIndex = i + 1; break; }
      }
    }

    if(rowIndex > 0) {
      dbSheet.getRange(rowIndex, 3).setValue(savedDept);   
      dbSheet.getRange(rowIndex, 4).setValue(savedName);   
      dbSheet.getRange(rowIndex, 5).setValue(item.content);  
      dbSheet.getRange(rowIndex, 6).setValue(progressVal); 
      dbSheet.getRange(rowIndex, 7).setValue(status);       
      dbSheet.getRange(rowIndex, 8).setValue(item.priority); 
    } else {
      var newId = date + "_" + savedName + "_" + new Date().getTime() + "_" + Math.floor(Math.random()*100);
      dbSheet.appendRow([newId, date, savedDept, savedName, item.content, progressVal, status, item.priority, "대기", ""]);
    }
  });
  return "SUCCESS";
}

/* 5. [관리자용] 승인 및 코멘트 업데이트 */
function updateManagerCheck(id, status, comment) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("업무일지_DB");
  var data = sheet.getDataRange().getValues();
  
  for(var i=1; i<data.length; i++) {
    if(String(data[i][0]) === String(id)) {
      sheet.getRange(i+1, 9).setValue(status); // I열: 승인상태
      if(comment) sheet.getRange(i+1, 10).setValue(comment); // J열: 코멘트
      break;
    }
  }
  return "UPDATED";
}

/* [수정] 관리자 필터: 닉네임(C열) 사용 */
function getAllFilterOptions() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("직원정보");
  if(!sheet) return { depts: [], staff: [] };

  var data = sheet.getDataRange().getValues();
  var deptSet = new Set(); 
  var staffList = [];

  for(var i=1; i<data.length; i++) {
    var rowType = String(data[i][0]).toLowerCase(); 
    
    // ★ [수정] 닉네임(C열) 가져오기
    var rowName = String(data[i][2]).trim(); 
    if(rowName === "") rowName = String(data[i][1]).trim(); // 없으면 풀네임

    var rowDept = String(data[i][4]).trim(); 

    // A열 Office 체크 + 이름 존재 여부
    if(rowName !== "" && rowType.includes("office")) {
      staffList.push(rowName);
      if(rowDept !== "") deptSet.add(rowDept);
    }
  }

  return {
    depts: Array.from(deptSet).sort(),
    staff: staffList.sort()
  };
}

/* 1. 오피스 직원 목록 (닉네임 C열 우선 + 부서 E열 확보) */
function getOfficeStaffList(callerName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("직원정보");
  if (!sheet) return { list: [], isAdmin: false, error: "시트없음" };

  var data = sheet.getDataRange().getValues();
  var list = [];
  var isAdmin = false;
  
  // 관리자 키워드
  var adminTitles = ["Manager", "Director", "CEO", "GM", "Head", "Admin", 
                     "점장", "관리자", "대표", "ผจก", "MD", "Owner", "Office"];

  // 내 이름 정리 (비교용)
  var cleanCaller = String(callerName || "").toLowerCase().replace(/\s+/g, "");

  // 1행(헤더) 건너뛰고 2행부터 시작
  for(var i=1; i<data.length; i++) {
    // 0=A, 1=B, 2=C, 3=D, 4=E
    var rowType = String(data[i][0]); // A열: 구분 (Office)
    var rowFullName = String(data[i][1]).trim(); // B열: 풀네임
    var rowNickName = String(data[i][2]).trim(); // C열: 닉네임
    var rowDept = String(data[i][4]).trim();     // E열: 직급(부서)

    // 이름이 아예 없으면 패스
    if(rowFullName === "" && rowNickName === "") continue;

    // ★ [핵심 1] A열에 "Office"가 포함된 사람만 (대소문자 무시)
    if(rowType.toLowerCase().includes("office")) {
        
        // ★ [핵심 2] 화면에 보여줄 이름 결정 (닉네임 있으면 닉네임, 없으면 풀네임)
        var nameToShow = (rowNickName !== "") ? rowNickName : rowFullName;
        
        // 부서가 비어있으면 'Staff'라고라도 넣어줌 (기타 방지)
        var deptToShow = (rowDept !== "") ? rowDept : "Staff";

        list.push({ 
            name: nameToShow, 
            dept: deptToShow 
        });

        // ★ [핵심 3] 관리자 권한 체크 (풀네임 or 닉네임 중 하나라도 맞으면 OK)
        var cleanFull = rowFullName.toLowerCase().replace(/\s+/g, "");
        var cleanNick = rowNickName.toLowerCase().replace(/\s+/g, "");

        if(cleanCaller.includes(cleanFull) || cleanFull.includes(cleanCaller) ||
           (cleanNick !== "" && (cleanCaller.includes(cleanNick) || cleanNick.includes(cleanCaller)))) {
            
            // 직급 확인
            for(var k=0; k<adminTitles.length; k++) {
                if(rowDept.toLowerCase().includes(adminTitles[k].toLowerCase())) {
                    isAdmin = true;
                    break;
                }
            }
        }
    }
  }
  
  return { list: list, isAdmin: isAdmin };
}

/** 오피스 직원 부서 목록 (직원정보 E열, A열 Office만) - 매장 방문 현황 부서 필터용 */
function getOfficeDepartments() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("직원정보");
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var set = {};
  for (var i = 1; i < data.length; i++) {
    var rowType = String(data[i][0] || "");
    var rowDept = String(data[i][4] || "").trim();
    if (rowType.toLowerCase().indexOf("office") === -1) continue;
    if (rowDept === "") rowDept = "Staff";
    set[rowDept] = true;
  }
  var list = Object.keys(set).sort();
  return list;
}

/** 특정 부서 오피스 직원 이름 목록 (방문 기록 필터용) - 직원정보 E열 기준 */
function getOfficeNamesByDept(department) {
  if (!department || department === "All" || String(department).trim() === "") return [];
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("직원정보");
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  var names = [];
  var deptFilter = String(department).trim();
  for (var i = 1; i < data.length; i++) {
    var rowType = String(data[i][0] || "");
    var rowFullName = String(data[i][1] || "").trim();
    var rowNickName = String(data[i][2] || "").trim();
    var rowDept = String(data[i][4] || "").trim();
    if (rowDept === "") rowDept = "Staff";
    if (rowType.toLowerCase().indexOf("office") === -1) continue;
    if (rowDept !== deptFilter) continue;
    var nameToShow = (rowNickName !== "") ? rowNickName : rowFullName;
    if (nameToShow && names.indexOf(nameToShow) === -1) names.push(nameToShow);
  }
  return names;
}

/** 특정 부서 오피스 직원 목록 (이름/부서) - 매장 방문 현황 직원 드롭다운용 */
function getOfficeStaffListByDept(department) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("직원정보");
  if (!sheet) return { list: [] };
  var data = sheet.getDataRange().getValues();
  var list = [];
  var deptFilter = (department === "All" || department === "" || department == null) ? null : String(department).trim();
  for (var i = 1; i < data.length; i++) {
    var rowType = String(data[i][0] || "");
    var rowFullName = String(data[i][1] || "").trim();
    var rowNickName = String(data[i][2] || "").trim();
    var rowDept = String(data[i][4] || "").trim();
    if (rowDept === "") rowDept = "Staff";
    if (rowType.toLowerCase().indexOf("office") === -1) continue;
    if (deptFilter !== null && rowDept !== deptFilter) continue;
    var nameToShow = (rowNickName !== "") ? rowNickName : rowFullName;
    if (rowFullName === "" && rowNickName === "") continue;
    list.push({ name: nameToShow, dept: rowDept });
  }
  return { list: list };
}

/* [최종 통합] 관리자 조회 (중복 제거 & 날짜 에러 방지 완료) */
function getManagerRangeReport(startStr, endStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("업무일지_DB");
  if(!sheet) return [];

  var data = sheet.getDataRange().getValues();
  var result = [];
  var timeZone = ss.getSpreadsheetTimeZone();
  
  // 조회 로직: 헤더(1행) 제외하고 2행부터 끝까지
  for(var i=1; i<data.length; i++) {
    // 1. 날짜 데이터 안전하게 변환
    var rawDate = data[i][1];
    if (!rawDate) continue; // 날짜 없으면 건너뜀

    var rowDateObj = new Date(rawDate); 
    var rowDate = Utilities.formatDate(rowDateObj, timeZone, "yyyy-MM-dd");
    
    // 2. 날짜 구간 필터링 (문자열 비교)
    if(rowDate >= startStr && rowDate <= endStr) {
      result.push({
        id: data[i][0],
        date: rowDate,
        dept: data[i][2],
        name: data[i][3],
        content: data[i][4],
        progress: data[i][5],
        status: data[i][6], // Finish, Carry Over, Today, Continue
        priority: data[i][7],
        managerCheck: data[i][8],
        managerComment: data[i][9]
      });
    }
  }
  
  return result; 
}