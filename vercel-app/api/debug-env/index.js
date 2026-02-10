// 환경 변수 로드 여부만 확인 (키 값은 노출 안 함)
const path = require('path');
const fs = require('fs');
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });
else require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const hasUrl = !!(process.env.SUPABASE_URL || '').trim();
  const hasKey = !!process.env.SUPABASE_ANON_KEY;
  const urlPrefix = (process.env.SUPABASE_URL || '').trim().substring(0, 30);
  return res.status(200).json({
    ok: true,
    hasUrl,
    hasKey,
    urlPrefix: hasUrl ? urlPrefix + '...' : '(없음)',
    hint: hasUrl && hasKey ? 'env 로드됨. Supabase URL/키 확인.' : 'SUPABASE_URL 또는 SUPABASE_ANON_KEY가 .env에 있는지 확인하세요.',
  });
};
