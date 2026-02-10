const { supabaseSelectFilter } = require('../../lib/supabase');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let store = '', name = '';
    if (req.method === 'GET') { store = req.query.store || ''; name = req.query.name || ''; }
    else { const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); store = b.store || ''; name = b.name || ''; }
    const storeTrim = String(store).trim();
    const nameTrim = String(name).trim();
    if (!storeTrim || !nameTrim) return res.status(200).json({});
    const rows = await supabaseSelectFilter('menu_permissions', 'store=eq.' + encodeURIComponent(storeTrim) + '&name=eq.' + encodeURIComponent(nameTrim), { limit: 1 }) || [];
    if (rows.length > 0 && rows[0].permissions) {
      const p = rows[0].permissions;
      if (typeof p === 'string') { try { return res.status(200).json(JSON.parse(p) || {}); } catch (_) { return res.status(200).json({}); } }
      return res.status(200).json(p || {});
    }
    return res.status(200).json({});
  } catch (e) { console.error('getMenuPermission:', e.message); return res.status(200).json({}); }
};
