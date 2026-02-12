const { supabaseSelect } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let department = '';
    if (req.method === 'GET') department = req.query.department;
    else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      department = body.department;
    }
    const data = await supabaseSelect('employees', { order: 'id.asc' }) || [];
    const list = [];
    const deptFilter = (department === 'All' || department === '' || department == null) ? null : String(department).trim();
    for (let i = 0; i < data.length; i++) {
      const st = String(data[i].store || '').toLowerCase();
      if (st.indexOf('office') === -1 && st !== '본사' && st !== '오피스') continue;
      const rowDept = (String(data[i].job || '').trim() || 'Staff');
      if (deptFilter !== null && rowDept !== deptFilter) continue;
      const nameToShow = String(data[i].nick || '').trim() || String(data[i].name || '').trim();
      if (!nameToShow) continue;
      list.push({ name: nameToShow, dept: rowDept });
    }
    return res.status(200).json({ list });
  } catch (e) {
    console.error('getOfficeStaffListByDept:', e.message);
    return res.status(200).json({ list: [] });
  }
};
