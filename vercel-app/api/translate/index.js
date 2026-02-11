/**
 * 공지 등 텍스트 번역 - Apps Script LanguageApp과 동일한 방식
 * 1순위: Google Translate 웹 API (무료, Apps Script와 동일 품질)
 * 2순위: MyMemory (폴백)
 * POST body: { text: string, targetLang: string } 단건
 *         또는 { texts: string[], targetLang: string } 배치
 */
const LANG_MAP = { en: 'en', th: 'th', mm: 'my', la: 'lo' };
const UA = 'Mozilla/5.0 (compatible; ChoongmanERP/1.0)';

async function translateViaGoogle(text, targetLang) {
  if (!String(text || '').trim()) return '';
  const tl = LANG_MAP[targetLang] || 'en';
  const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=ko&tl=' + tl + '&dt=t&q=' + encodeURIComponent(String(text).slice(0, 5000));
  const resp = await fetch(url, { headers: { 'User-Agent': UA } });
  const data = await resp.json();
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0].map((x) => x[0]).join('') || text;
  }
  return text;
}

async function translateViaMyMemory(text, targetLang) {
  if (!String(text || '').trim()) return '';
  const tl = LANG_MAP[targetLang] || 'en';
  const langpair = 'ko|' + tl;
  const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(String(text).slice(0, 500)) + '&langpair=' + langpair;
  const resp = await fetch(url, { headers: { 'User-Agent': UA } });
  const data = await resp.json();
  return (data && data.response && data.response.translatedText) ? data.response.translatedText : text;
}

async function translateOne(text, targetLang) {
  if (!String(text || '').trim()) return '';
  if (targetLang === 'ko') return text;
  try {
    const r = await translateViaGoogle(text, targetLang);
    if (r && r !== text && r.trim()) return r;
  } catch (e) {
    console.warn('translate google:', e.message);
  }
  try {
    return await translateViaMyMemory(text, targetLang);
  } catch (e2) {
    console.warn('translate mymemory:', e2.message);
    return text;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    body = body || {};
    const targetLang = String(body.targetLang || 'en').toLowerCase().slice(0, 2);

    if (body.texts && Array.isArray(body.texts)) {
      const results = [];
      for (let i = 0; i < body.texts.length; i++) {
        const t = await translateOne(body.texts[i], targetLang);
        results.push(t);
        if (i < body.texts.length - 1) await new Promise((r) => setTimeout(r, 50));
      }
      return res.status(200).json({ translated: results });
    }

    const text = String(body.text || '').trim();
    const translated = await translateOne(text, targetLang);
    return res.status(200).json({ translated: text ? translated : '' });
  } catch (e) {
    console.error('translate:', e.message);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (body.texts && Array.isArray(body.texts)) return res.status(200).json({ translated: body.texts.map((t) => String(t || '').trim()) });
    return res.status(200).json({ translated: (body.text || '').toString().trim() });
  }
};
