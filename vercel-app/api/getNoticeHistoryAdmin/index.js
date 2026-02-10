const { supabaseSelect } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let startDate = '';
    let endDate = '';
    if (req.method === 'GET') {
      startDate = String(req.query.startDate || '').trim();
      endDate = String(req.query.endDate || '').trim();
    } else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      startDate = String(body.startDate || '').trim();
      endDate = String(body.endDate || '').trim();
    }
    const start = startDate ? new Date(startDate + 'T00:00:00') : new Date('2000-01-01');
    const end = endDate ? new Date(endDate + 'T23:59:59') : new Date();

    const rows = await supabaseSelect('notices', { order: 'created_at.desc' }) || [];
    const list = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowDate = r.created_at ? new Date(r.created_at) : new Date(0);
      if (rowDate < start || rowDate > end) continue;
      let att = [];
      if (r.attachments) {
        try { att = JSON.parse(r.attachments); } catch (_) {}
      }
      const dateStr = rowDate.toISOString().slice(0, 16).replace('T', ' ');
      list.push({
        id: r.id,
        date: dateStr,
        title: r.title || '',
        content: r.content || '',
        targetStore: r.target_store || '',
        targetRole: r.target_role || '',
        sender: r.sender || '',
        attachments: att,
      });
    }
    return res.status(200).json(list);
  } catch (e) {
    console.error('getNoticeHistoryAdmin:', e.message);
    return res.status(200).json([]);
  }
};
