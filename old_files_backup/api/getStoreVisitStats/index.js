const { supabaseSelect, supabaseSelectFilter } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let startStr = '', endStr = '';
    if (req.method === 'GET') {
      startStr = String(req.query.startStr || req.query.start || '').substring(0, 10);
      endStr = String(req.query.endStr || req.query.end || '').substring(0, 10);
    } else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      startStr = String(body.startStr || body.start || '').substring(0, 10);
      endStr = String(body.endStr || body.end || '').substring(0, 10);
    }
    const visitData = await supabaseSelectFilter('store_visits', 'visit_date=gte.' + startStr + '&visit_date=lte.' + endStr, { order: 'visit_date', limit: 2000 }) || [];
    const nameToDept = {};
    const empList = await supabaseSelect('employees', { order: 'id.asc' }) || [];
    for (let i = 0; i < empList.length; i++) {
      const st = String(empList[i].store || '').toLowerCase();
      if (st.indexOf('office') === -1 && st !== '본사' && st !== '오피스') continue;
      const rowDept = String(empList[i].job || '').trim() || 'Staff';
      const nameToShow = String(empList[i].nick || '').trim() || String(empList[i].name || '').trim();
      if (nameToShow) nameToDept[nameToShow] = rowDept;
    }
    const byDeptMap = {}, byEmployeeMap = {}, byStoreMap = {};
    for (let i = 0; i < visitData.length; i++) {
      const d = visitData[i];
      const duration = Number(d.duration_min) || 0;
      if (duration <= 0) continue;
      const name = String(d.name || '').trim();
      const store = String(d.store_name || '').trim();
      const dept = nameToDept[name] || '기타';
      byEmployeeMap[name] = (byEmployeeMap[name] || 0) + duration;
      byStoreMap[store] = (byStoreMap[store] || 0) + duration;
      byDeptMap[dept] = (byDeptMap[dept] || 0) + duration;
    }
    const byDept = Object.keys(byDeptMap).map((k) => ({ label: k, minutes: byDeptMap[k] })).sort((a, b) => b.minutes - a.minutes);
    const byEmployee = Object.keys(byEmployeeMap).map((k) => ({ label: k, minutes: byEmployeeMap[k] })).sort((a, b) => b.minutes - a.minutes);
    const byStore = Object.keys(byStoreMap).map((k) => ({ label: k, minutes: byStoreMap[k] })).sort((a, b) => b.minutes - a.minutes);
    return res.status(200).json({ byDept, byEmployee, byStore });
  } catch (e) {
    console.error('getStoreVisitStats:', e.message);
    return res.status(200).json({ byDept: [], byEmployee: [], byStore: [] });
  }
};
