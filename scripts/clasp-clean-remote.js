/**
 * Apps Script 원격 프로젝트에서 불필요한 파일 일괄 제거
 * (.claspignore 기준으로 old_files_backup, erp-ui 등 제외)
 *
 * 사용법:
 *   1. Google Cloud Console에서 Apps Script API 활성화
 *   2. OAuth 클라이언트(데스크톱 앱) 생성 후 credentials.json 다운로드
 *   3. npm install (처음 한 번)
 *   4. node scripts/clasp-clean-remote.js
 */

const path = require("path");
const fs = require("fs");

const EXCLUDE_PREFIXES = [
  "old_files_backup",
  "erp-ui",
  "chungman-erp",
  "vercel-app",
  "backup_before_680",
  "node_modules",
  "assets",
];

const EXCLUDE_PATTERNS = [".next"];

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const claspPath = path.join(projectRoot, ".clasp.json");
  const credentialsPath = path.join(projectRoot, "credentials.json");

  if (!fs.existsSync(claspPath)) {
    console.error("❌ .clasp.json을 찾을 수 없습니다.");
    process.exit(1);
  }

  if (!fs.existsSync(credentialsPath)) {
    console.error(`❌ credentials.json을 찾을 수 없습니다.`);
    console.error("");
    console.error("   설정 방법:");
    console.error("   1. script.google.com > 프로젝트 > 프로젝트 설정 > Google Cloud Platform (GCP) 프로젝트");
    console.error("   2. 링크된 GCP 프로젝트에서: API 및 서비스 > 사용자 인증 정보");
    console.error("   3. '+ 사용자 인증 정보 만들기' > OAuth 클라이언트 ID");
    console.error("   4. 앱 유형: 데스크톱 앱, 이름 입력 후 생성");
    console.error("   5. JSON 다운로드 후 프로젝트 루트에 credentials.json으로 저장");
    process.exit(1);
  }

  const { scriptId } = JSON.parse(fs.readFileSync(claspPath, "utf8"));
  if (!scriptId) {
    console.error("❌ .clasp.json에 scriptId가 없습니다.");
    process.exit(1);
  }

  let authenticate, google;
  try {
    const localAuth = require("@google-cloud/local-auth");
    authenticate = localAuth.authenticate;
  } catch {
    console.error("❌ @google-cloud/local-auth를 찾을 수 없습니다.");
    console.error("   npm install @google-cloud/local-auth googleapis --save-dev 실행 후 다시 시도하세요.");
    process.exit(1);
  }
  try {
    google = require("googleapis");
  } catch {
    try {
      google = require(path.join(projectRoot, "node_modules", "@google", "clasp", "node_modules", "googleapis"));
    } catch {
      console.error("❌ googleapis를 찾을 수 없습니다.");
      process.exit(1);
    }
  }

  const SCOPES = ["https://www.googleapis.com/auth/script.projects"];
  console.log("🔐 인증 중... (첫 실행 시 브라우저가 열립니다)");
  const auth = await authenticate({ scopes: SCOPES, keyfilePath: credentialsPath });
  const script = google.script({ version: "v1", auth });

  console.log("📥 원격 프로젝트 내용 가져오는 중...");
  let content;
  try {
    const res = await script.projects.getContent({ scriptId });
    content = res.data;
  } catch (err) {
    console.error("❌ getContent 실패:", err.message);
    if (err.message && err.message.includes("403")) {
      console.error("   → Google Cloud Console에서 Apps Script API를 활성화하세요.");
      console.error("   → credentials.json이 해당 프로젝트의 것인지 확인하세요.");
    }
    process.exit(1);
  }

  const files = content.files || [];
  const toKeep = [];
  const toRemove = [];

  for (const f of files) {
    const name = (f.name || "").replace(/\\/g, "/");
    const excluded =
      EXCLUDE_PREFIXES.some((p) => name.startsWith(p + "/") || name === p) ||
      EXCLUDE_PATTERNS.some((p) => name.includes(p));

    if (excluded) {
      toRemove.push(name);
    } else {
      toKeep.push(f);
    }
  }

  if (toRemove.length === 0) {
    console.log("✅ 제거할 파일이 없습니다.");
    return;
  }

  console.log(`\n🗑️  제거할 파일 ${toRemove.length}개:`);
  toRemove.slice(0, 15).forEach((n) => console.log("   -", n));
  if (toRemove.length > 15) {
    console.log(`   ... 외 ${toRemove.length - 15}개`);
  }
  console.log(`\n✅ 유지할 파일 ${toKeep.length}개`);
  console.log("\n원격 프로젝트 업데이트 중...");

  try {
    await script.projects.updateContent({
      scriptId,
      requestBody: { files: toKeep },
    });
    console.log("✅ 완료! 불필요한 파일이 원격에서 제거되었습니다.");
  } catch (err) {
    console.error("❌ updateContent 실패:", err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
