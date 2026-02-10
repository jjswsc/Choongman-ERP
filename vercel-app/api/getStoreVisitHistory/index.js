const { supabaseSelect, supabaseSelectFilter } = require('../../lib/supabase');

function fmtTime(visitTime, createdAt) {
  let t = String(visitTime != null ? visitTime : '').trim();
  if (t.length >= 5) return t.indexOf('T') >= 0 ? t.substring(t.indexOf('T') + 1, t.indexOf('T') + 6) : t.substring(0, 5);
  if (createdAt) {
    const iso = typeof createdAt === 'string' ? createdAt : (createdAt.toISOString ? createdAt.toISOString() : '');
    if (iso && iso.indexOf('T') >= 0) return iso.substring(iso.indexOf('T') + 1, iso.indexOf('T') + 6);
  }
  return '';
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let start = '', end = '', store = '', employeeName = '', department = '';
    if (req.method === 'GET') {
      start = req.query.start || req.query.startStr || ''; end = req.query.end || req.query.endStr || '';
      store = req.query.store || ''; employeeName = req.query.employeeName || ''; department = req.query.department || '';
    } else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      start = body.start || body.startStr || ''; end = body.end || body.endStr || '';
      store = body.store || ''; employeeName = body.employeeName || ''; department = body.department || '';
    }
    const startStr = String(start).substring(0, 10);
    const endStr = String(end).substring(0, 10);
    const storeFilter = (store === 'All' || !store) ? 'All' : String(store).trim();
    const empFilter = (employeeName === 'All' || !employeeName) ? 'All' : String(employeeName).trim();
    const deptFilter = (department === 'All' || !department) ? null : String(department).trim();
    let namesInDept = [];
    if (deptFilter) {
      const empList = await supabaseSelect('employees', { order: 'id.asc' }) || [];
      for (let i = 0; i < empList.length; i++) {
        const st = String(empList[i].store || '').toLowerCase();
        if (st.indexOf('office') === -1 && st !== '본사' && st !== '오피스') continue;
        const rowDept = (String(empList[i].job || '').trim() || 'Staff');
        if (rowDept !== deptFilter) continue;
        const n = String(empList[i].nick || '').trim() || String(empList[i].name || '').trim();
        if (n && namesInDept.indexOf(n) === -1) namesInDept.push(n);
      }
    }
    const filters = ['visit_date=gte.' + startStr, 'visit_date=lte.' + endStr];
    if (storeFilter !== 'All') filters.push('store_name=eq.' + encodeURIComponent(storeFilter));
    if (empFilter !== 'All') filters.push('name=eq.' + encodeURIComponent(empFilter));
    const list = await supabaseSelectFilter('store_visits', filters.join('&'), { order: 'visit_date.desc,visit_time.desc', limit: 2000 }) || [];
    const result = list
      .filter((d) => !deptFilter || namesInDept.length === 0 || namesInDept.indexOf(String(d.name || '').trim()) >= 0)
      .map((d) => ({ date: String(d.visit_date || '').substring(0, 10), time: fmtTime(d.visit_time, d.created_at), name: d.name, store: d.store_name, type: d.visit_type, purpose: d.purpose, duration: d.duration_min }));
    return res.status(200).json(result);
  } catch (e) {
    console.error('getStoreVisitHistory:', e.message);
    return res.status(200).json([]);
  }
};
