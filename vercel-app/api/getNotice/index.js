// GAS PropertiesService 대신 환경 변수 사용. Vercel에서 SYSTEM_NOTICE 설정 가능
const path = require('path');
const fs = require('fs');
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const notice = (process.env.SYSTEM_NOTICE || '공지사항 없음').trim() || '공지사항 없음';
  return res.status(200).json({ notice });
};
