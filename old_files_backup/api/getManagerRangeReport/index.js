const { supabaseSelectFilter } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let startStr = '', endStr = '';
    if (req.method === 'GET') { startStr = req.query.startStr || req.query.start || ''; endStr = req.query.endStr || req.query.end || ''; }
    else { const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); startStr = b.startStr || b.start || ''; endStr = b.endStr || b.end || ''; }
    const rows = await supabaseSelectFilter('work_logs', 'log_date=gte.' + encodeURIComponent(startStr) + '&log_date=lte.' + encodeURIComponent(endStr), { order: 'log_date.asc' }) || [];
    const result = rows.map((r) => ({
      id: r.id,
      date: r.log_date ? String(r.log_date).slice(0, 10) : '',
      dept: r.dept || '',
      name: r.name || '',
      content: r.content || '',
      progress: Number(r.progress) || 0,
      status: r.status || '',
      priority: r.priority || '',
      managerCheck: r.manager_check || '',
      managerComment: r.manager_comment || '',
    }));
    return res.status(200).json(result);
  } catch (e) {
    console.error('getManagerRangeReport:', e.message);
    return res.status(200).json([]);
  }
};
