const { supabaseUpdateByFilter } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const updates = Array.isArray(body.updates) ? body.updates : [];
    for (let u = 0; u < updates.length; u++) {
      const up = updates[u];
      await supabaseUpdateByFilter('checklist_items', 'item_id=eq.' + encodeURIComponent(String(up.id)), {
        name: String(up.name != null ? up.name : '').trim(),
        use_flag: up.use === true || up.use === 1 || up.use === '1' || String(up.use).toLowerCase() === 'y',
      });
    }
    return res.status(200).json({ success: true, message: 'SUCCESS' });
  } catch (e) {
    console.error('updateChecklistItems:', e.message);
    return res.status(200).json({ success: false, message: e.message });
  }
};
