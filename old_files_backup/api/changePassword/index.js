const { supabaseSelectFilter, supabaseUpdate } = require('../../lib/supabase');

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
    const store = String(body.store || '').trim();
    const name = String(body.name || '').trim();
    const oldPw = String(body.oldPw || '').trim();
    const newPw = String(body.newPw || '').trim();

    if (!newPw) {
      return res.status(200).json({ success: false, message: '새 비밀번호를 입력하세요.' });
    }

    const filter = `store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(name)}`;
    const rows = await supabaseSelectFilter('employees', filter);
    if (!rows || rows.length === 0) {
      return res.status(200).json({ success: false, message: '일치하는 계정을 찾을 수 없습니다.' });
    }

    const row = rows[0];
    if (String(row.password || '').trim() !== oldPw) {
      return res.status(200).json({ success: false, message: '현재 비밀번호가 일치하지 않습니다.' });
    }

    await supabaseUpdate('employees', row.id, { password: newPw });
    return res.status(200).json({ success: true, message: '비밀번호가 변경되었습니다. 다시 로그인해 주세요.' });
  } catch (e) {
    console.error('changePassword:', e.message);
    return res.status(200).json({ success: false, message: '일치하는 계정을 찾을 수 없습니다.' });
  }
};
