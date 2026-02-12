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
    const rows = await supabaseSelect('vendors', { limit: 2000 });
    const list = [];
    const seen = {};
    for (let i = 0; i < (rows || []).length; i++) {
      const gpsName = String(rows[i].gps_name || '').trim();
      const name = String(rows[i].name || '').trim();
      const val = gpsName || name;
      if (val && !seen[val]) {
        seen[val] = true;
        list.push(val);
      }
    }
    return res.status(200).json(list);
  } catch (e) {
    console.error('getStoreListFromK:', e.message);
    return res.status(200).json([]);
  }
};
