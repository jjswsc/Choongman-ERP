const { supabaseSelectFilter, supabaseInsert } = require('../../lib/supabase');

async function nextComplaintNumber(dateStr) {
  const base = (dateStr || '').replace(/-/g, '');
  if (base.length !== 8) return base + '-001';
  const list = await supabaseSelectFilter('complaint_logs', 'log_date=eq.' + dateStr, { limit: 500 }) || [];
  let max = 0;
  for (let i = 0; i < list.length; i++) {
    const numCell = String(list[i].number || '');
    if (/^\d{8}-\d{3}$/.test(numCell)) {
      const seq = parseInt(numCell.split('-')[1], 10);
      if (seq > max) max = seq;
    }
  }
  return base + '-' + String(max + 1).padStart(3, '0');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const data = body.dataStr ? JSON.parse(body.dataStr) : (body.data || body);
    const dateStr = (data.date || '').toString().trim().slice(0, 10);
    const num = await nextComplaintNumber(dateStr);
    await supabaseInsert('complaint_logs', {
      number: num,
      log_date: dateStr && dateStr.length >= 10 ? dateStr : null,
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
    });
    return res.status(200).json({ success: true, message: '저장되었습니다.' });
  } catch (e) {
    console.error('saveComplaintLog:', e.message);
    return res.status(200).json({ success: false, message: '저장 실패: ' + e.message });
  }
};
