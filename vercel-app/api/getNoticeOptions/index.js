const { supabaseSelect } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const list = await supabaseSelect('employees', { order: 'id.asc' }) || [];
    const stores = {};
    const roles = {};
    for (let i = 0; i < list.length; i++) {
      const store = String(list[i].store || '').trim();
      const role = String(list[i].role || '').trim();
      if (store && store !== '매장명' && store !== 'Store') stores[store] = true;
      if (role && role !== '직급' && role !== 'Job') roles[role] = true;
    }
    const priorityRoles = ['Assis Manager', 'Assistant Manager', 'Manager', 'Service', 'Kitchen', 'Accounting'];
    const roleList = Object.keys(roles).sort((a, b) => {
      const aIdx = priorityRoles.findIndex((r) => (r || '').toLowerCase() === (a || '').toLowerCase());
      const bIdx = priorityRoles.findIndex((r) => (r || '').toLowerCase() === (b || '').toLowerCase());
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return (a || '').localeCompare(b || '');
    });
    return res.status(200).json({ stores: Object.keys(stores).sort(), roles: roleList });
  } catch (e) {
    console.error('getNoticeOptions:', e.message);
    return res.status(200).json({ stores: [], roles: [] });
  }
};
