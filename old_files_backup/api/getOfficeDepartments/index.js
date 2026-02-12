const { supabaseSelect } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const data = await supabaseSelect('employees', { order: 'id.asc' }) || [];
    const set = {};
    for (let i = 0; i < data.length; i++) {
      const st = String(data[i].store || '').toLowerCase();
      if (st.indexOf('office') === -1 && st !== '본사' && st !== '오피스') continue;
      const rowDept = (String(data[i].job || '').trim() || 'Staff');
      set[rowDept] = true;
    }
    return res.status(200).json(Object.keys(set).sort());
  } catch (e) {
    console.error('getOfficeDepartments:', e.message);
    return res.status(200).json([]);
  }
};
