const { supabaseInsert } = require('../../lib/supabase');

/** Officer 이상만 공지 등록. 첨부는 GAS Drive 대신 JSON으로 저장 (URL 등 클라이언트에서 전달) */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const userRole = String(body.userRole || '').toLowerCase();
    if (!userRole.includes('officer') && !userRole.includes('director') && !userRole.includes('ceo') && !userRole.includes('admin')) {
      return res.status(200).json({ success: false, message: '❌ 권한이 없습니다. (Officer 이상만 가능)' });
    }

    const data = body.data || body;
    let attachJson = '';
    if (data.attachments && Array.isArray(data.attachments) && data.attachments.length > 0) {
      attachJson = JSON.stringify(data.attachments);
    }

    const id = body.id != null ? Number(body.id) : Date.now();
    await supabaseInsert('notices', {
      id,
      title: String(data.title || '').trim(),
      content: String(data.content || '').trim(),
      target_store: String(data.targetStore || data.target_store || '전체').trim(),
      target_role: String(data.targetRole || data.target_role || '전체').trim(),
      sender: String(data.sender || '').trim(),
      attachments: attachJson,
    });

    return res.status(200).json({ success: true, message: '✅ 공지사항이 등록되었습니다.' });
  } catch (e) {
    console.error('adminSaveNotice:', e.message);
    return res.status(200).json({ success: false, message: '❌ 등록 실패: ' + e.message });
  }
};
