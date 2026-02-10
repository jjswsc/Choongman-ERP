const { supabaseSelect } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const list = await supabaseSelect('employees', { order: 'id.asc' }) || [];
    const deptSet = {};
    const staffList = [];
    for (let i = 0; i < list.length; i++) {
      const st = String(list[i].store || '').toLowerCase();
      if (st.indexOf('office') === -1 && st !== '본사' && st !== '오피스') continue;
      const rowName = String(list[i].nick || '').trim() || String(list[i].name || '').trim();
      const rowDept = String(list[i].job || '').trim();
      if (rowName) staffList.push(rowName);
      if (rowDept) deptSet[rowDept] = true;
    }
    const uniqueStaff = [...new Set(staffList)].sort();
    return res.status(200).json({ depts: Object.keys(deptSet).sort(), staff: uniqueStaff });
  } catch (e) {
    console.error('getAllFilterOptions:', e.message);
    return res.status(200).json({ depts: [], staff: [] });
  }
};
