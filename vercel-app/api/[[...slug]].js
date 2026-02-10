/**
 * 단일 API 진입점 (Hobby 플랜 12개 함수 제한 대응)
 * /api/getLoginData, /api/loginCheck 등 모든 요청을 받아 해당 핸들러로 전달
 */
module.exports = async (req, res) => {
  const pathname = (req.url || '').split('?')[0];
  const name = pathname.replace(/^\/api\/?/, '').split('/')[0];
  if (!name) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(404).json({ error: 'API name required', path: pathname });
  }
  try {
    const handler = require('./' + name + '/index.js');
    return await handler(req, res);
  } catch (e) {
    console.error('API route [' + name + ']:', e.message);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(404).json({ error: 'Not found: ' + name, message: e.message });
  }
};
