const { supabaseSelect } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let userStore = '', userRole = '';
    if (req.method === 'GET') {
      userStore = String(req.query.userStore || '').trim();
      userRole = String(req.query.userRole || '').trim();
    } else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      userStore = String(body.userStore || '').trim();
      userRole = String(body.userRole || '').toLowerCase();
    }
    const list = await supabaseSelect('employees', { order: 'id.asc' }) || [];
    const stores = {};
    const roles = {};
    for (let i = 0; i < list.length; i++) {
      const store = String(list[i].store || '').trim();
      const role = String(list[i].role || '').trim();
      if (store && store !== '매장명') stores[store] = true;
      if (role) roles[role] = true;
    }
    const r = userRole.toLowerCase();
    const isOffice = r.indexOf('director') !== -1 || r.indexOf('officer') !== -1 || r.indexOf('ceo') !== -1 || r.indexOf('hr') !== -1;
    const storeList = isOffice ? Object.keys(stores).sort() : (userStore ? [userStore] : []);
    return res.status(200).json({ stores: storeList, roles: Object.keys(roles).sort() });
  } catch (e) {
    console.error('getNoticeOptionsForMobile:', e.message);
    return res.status(200).json({ stores: [], roles: [] });
  }
};
