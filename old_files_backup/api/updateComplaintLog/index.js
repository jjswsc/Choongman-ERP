const { supabaseUpdateByFilter } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const rowOrId = String(body.rowOrId != null ? body.rowOrId : body.id || '').trim();
    const data = body.dataStr ? JSON.parse(body.dataStr) : (body.data || body);
    if (!rowOrId) return res.status(200).json({ success: false, message: '잘못된 행입니다.' });
    const patch = {
      log_date: (data.date || '').toString().trim().slice(0, 10) || null,
      log_time: String(data.time || '').trim(),
      store_name: String(data.store || '').trim(),
      writer: String(data.writer || '').trim(),
      customer: String(data.customer || '').trim(),
      contact: String(data.contact || '').trim(),
      visit_path: String(data.visitPath || '').trim(),
      platform: String(data.platform || '').trim(),
      complaint_type: String(data.type || '').trim(),
      menu: String(data.menu || '').trim(),
      title: String(data.title || '').trim(),
      content: String(data.content || '').trim(),
      severity: String(data.severity || '').trim(),
      action: String(data.action || '').trim(),
      status: String(data.status || '접수').trim(),
      handler: String(data.handler || '').trim(),
      done_date: (data.doneDate || '').toString().trim().slice(0, 10) || null,
      photo_url: String(data.photoUrl || '').trim(),
      remark: String(data.remark || '').trim(),
    };
    await supabaseUpdateByFilter('complaint_logs', 'id=eq.' + encodeURIComponent(rowOrId), patch);
    return res.status(200).json({ success: true, message: '수정되었습니다.' });
  } catch (e) {
    console.error('updateComplaintLog:', e.message);
    return res.status(200).json({ success: false, message: '수정 실패: ' + e.message });
  }
};
