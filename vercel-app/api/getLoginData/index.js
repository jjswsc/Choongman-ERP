const { supabaseSelect } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const empList = await supabaseSelect('employees', { order: 'id.asc' });
    const userMap = {};
    for (let i = 0; i < (empList || []).length; i++) {
      const store = String(empList[i].store || '').trim();
      const name = String(empList[i].name || '').trim();
      if (store && name) {
        if (!userMap[store]) userMap[store] = [];
        userMap[store].push(name);
      }
    }
    const vendorRows = await supabaseSelect('vendors', { order: 'id.asc' });
    const vendorList = [];
    for (let v = 0; v < (vendorRows || []).length; v++) {
      const n = String(vendorRows[v].name || '').trim();
      if (n) vendorList.push(n);
    }
    return res.status(200).json({ users: userMap, vendors: vendorList });
  } catch (e) {
    console.error('getLoginData:', e.message);
    return res.status(200).json({ users: {}, vendors: [] });
  }
};
