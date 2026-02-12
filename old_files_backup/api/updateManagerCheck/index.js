const { supabaseUpdate } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const id = String(body.id || '').trim();
    const status = String(body.status || '').trim();
    const comment = body.comment != null ? String(body.comment).trim() : undefined;
    const patch = { manager_check: status };
    if (comment != null) patch.manager_comment = comment;
    await supabaseUpdate('work_logs', id, patch);
    return res.status(200).json({ success: true, message: 'UPDATED' });
  } catch (e) {
    console.error('updateManagerCheck:', e.message);
    return res.status(200).json({ success: false, message: 'ERROR' });
  }
};
