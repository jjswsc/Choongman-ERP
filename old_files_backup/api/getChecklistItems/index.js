const { supabaseSelect, supabaseSelectFilter } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const activeOnly = req.query.activeOnly === 'true' || req.query.activeOnly === '1';
    const rows = activeOnly
      ? await supabaseSelectFilter('checklist_items', 'use_flag=eq.true', { order: 'item_id.asc' })
      : await supabaseSelect('checklist_items', { order: 'item_id.asc' });
    const list = (rows || []).map((r) => ({
      id: r.item_id != null ? r.item_id : r.id,
      main: r.main_cat || '',
      sub: r.sub_cat || '',
      name: r.name || '',
      use: r.use_flag,
    }));
    return res.status(200).json(list);
  } catch (e) {
    console.error('getChecklistItems:', e.message);
    return res.status(200).json([]);
  }
};
