/**
 * 단일 API 진입점 (Hobby 플랜 12개 함수 제한 대응)
 * 모든 핸들러를 정적으로 require 해서 번들에 포함시킴
 */
const handlers = {
  adminGetNoticeStats: require('./adminGetNoticeStats/index.js'),
  adminSaveNotice: require('./adminSaveNotice/index.js'),
  changePassword: require('./changePassword/index.js'),
  checkUserVisitStatus: require('./checkUserVisitStatus/index.js'),
  'debug-env': require('./debug-env/index.js'),
  deleteAdminEmployee: require('./deleteAdminEmployee/index.js'),
  deleteAdminItem: require('./deleteAdminItem/index.js'),
  deleteCheckHistory: require('./deleteCheckHistory/index.js'),
  deleteNoticeAdmin: require('./deleteNoticeAdmin/index.js'),
  deleteVendor: require('./deleteVendor/index.js'),
  getAdminEmployeeList: require('./getAdminEmployeeList/index.js'),
  getAdminItemsList: require('./getAdminItemsList/index.js'),
  getAdminOrders: require('./getAdminOrders/index.js'),
  getAllFilterOptions: require('./getAllFilterOptions/index.js'),
  getAppData: require('./getAppData/index.js'),
  getAttendanceLogs: require('./getAttendanceLogs/index.js'),
  getCheckHistory: require('./getCheckHistory/index.js'),
  getChecklistItems: require('./getChecklistItems/index.js'),
  getCommonItemData: require('./getCommonItemData/index.js'),
  getComplaintLogList: require('./getComplaintLogList/index.js'),
  getEmployeeNamesByStore: require('./getEmployeeNamesByStore/index.js'),
  getEmployeesData: require('./getEmployeesData/index.js'),
  getInboundForStore: require('./getInboundForStore/index.js'),
  getInboundHistory: require('./getInboundHistory/index.js'),
  getItemCategories: require('./getItemCategories/index.js'),
  getLeaveAllData: require('./getLeaveAllData/index.js'),
  getLeaveAllDataForMobile: require('./getLeaveAllDataForMobile/index.js'),
  getLoginData: require('./getLoginData/index.js'),
  getManagerRangeReport: require('./getManagerRangeReport/index.js'),
  getMenuPermission: require('./getMenuPermission/index.js'),
  getMyLeaveInfo: require('./getMyLeaveInfo/index.js'),
  getMobileMyAttendanceSummary: require('./getMobileMyAttendanceSummary/index.js'),
  getMyNotices: require('./getMyNotices/index.js'),
  getMyOrderHistory: require('./getMyOrderHistory/index.js'),
  getMyUsageHistory: require('./getMyUsageHistory/index.js'),
  getNotice: require('./getNotice/index.js'),
  getNoticeHistoryAdmin: require('./getNoticeHistoryAdmin/index.js'),
  getNoticeOptions: require('./getNoticeOptions/index.js'),
  getNoticeOptionsForMobile: require('./getNoticeOptionsForMobile/index.js'),
  getOfficeDepartments: require('./getOfficeDepartments/index.js'),
  getOfficeNamesByDept: require('./getOfficeNamesByDept/index.js'),
  getOfficeStaffList: require('./getOfficeStaffList/index.js'),
  getOfficeStaffListByDept: require('./getOfficeStaffListByDept/index.js'),
  getOutboundHistory: require('./getOutboundHistory/index.js'),
  getSalesVendorList: require('./getSalesVendorList/index.js'),
  getSchedulesData: require('./getSchedulesData/index.js'),
  getStoreListFromK: require('./getStoreListFromK/index.js'),
  getStoreVisitHistory: require('./getStoreVisitHistory/index.js'),
  getStoreVisitStats: require('./getStoreVisitStats/index.js'),
  getTodayAttendanceTypes: require('./getTodayAttendanceTypes/index.js'),
  getTodayMyVisits: require('./getTodayMyVisits/index.js'),
  getVendorManagementList: require('./getVendorManagementList/index.js'),
  getVendorNamesByType: require('./getVendorNamesByType/index.js'),
  getWorkLogData: require('./getWorkLogData/index.js'),
  loginCheck: require('./loginCheck/index.js'),
  logNoticeRead: require('./logNoticeRead/index.js'),
  processAttendanceApproval: require('./processAttendanceApproval/index.js'),
  processLeaveDecision: require('./processLeaveDecision/index.js'),
  processLeaveDecisionMobile: require('./processLeaveDecisionMobile/index.js'),
  processOrder: require('./processOrder/index.js'),
  processOrderDecision: require('./processOrderDecision/index.js'),
  processOrderReceive: require('./processOrderReceive/index.js'),
  processUsage: require('./processUsage/index.js'),
  registerInboundBatch: require('./registerInboundBatch/index.js'),
  requestLeave: require('./requestLeave/index.js'),
  saveAdminEmployee: require('./saveAdminEmployee/index.js'),
  saveAdminItem: require('./saveAdminItem/index.js'),
  saveCheckResult: require('./saveCheckResult/index.js'),
  saveComplaintLog: require('./saveComplaintLog/index.js'),
  saveStoreSafetyStock: require('./saveStoreSafetyStock/index.js'),
  saveVendor: require('./saveVendor/index.js'),
  saveWeeklySmartSchedule: require('./saveWeeklySmartSchedule/index.js'),
  saveWorkLogData: require('./saveWorkLogData/index.js'),
  setMenuPermission: require('./setMenuPermission/index.js'),
  submitAttendance: require('./submitAttendance/index.js'),
  submitDailyClose: require('./submitDailyClose/index.js'),
  submitStoreVisit: require('./submitStoreVisit/index.js'),
  translate: require('./translate/index.js'),
  updateChecklistItems: require('./updateChecklistItems/index.js'),
  updateComplaintLog: require('./updateComplaintLog/index.js'),
  updateManagerCheck: require('./updateManagerCheck/index.js'),
  updateOrderDeliveryDate: require('./updateOrderDeliveryDate/index.js'),
};

module.exports = async (req, res) => {
  const pathname = (req.url || '').split('?')[0];
  const name = pathname.replace(/^\/api\/?/, '').split('/')[0];
  if (!name) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(404).json({ error: 'API name required', path: pathname });
  }
  const handler = handlers[name];
  if (!handler) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(404).json({ error: 'Not found: ' + name });
  }
  try {
    return await handler(req, res);
  } catch (e) {
    console.error('API route [' + name + ']:', e.message);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ error: 'Handler error', message: e.message });
  }
};
