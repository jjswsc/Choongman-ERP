const { supabaseSelectFilter, supabaseDelete } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const id = Number(body.id);
    if (isNaN(id)) return res.status(200).json({ success: false, message: 'Error' });
    const readRows = await supabaseSelectFilter('notice_reads', 'notice_id=eq.' + id) || [];
    for (let i = 0; i < readRows.length; i++) await supabaseDelete('notice_reads', readRows[i].id);
    await supabaseDelete('notices', id);
    return res.status(200).json({ success: true, message: 'Success' });
  } catch (e) {
    console.error('deleteNoticeAdmin:', e.message);
    return res.status(200).json({ success: false, message: 'Not found' });
  }
};
