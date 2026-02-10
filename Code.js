// [S_Common.gs] 에 들어갈 include 함수 예시
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// 모든 조각 파일들은 시스템이 알아서 하나로 합쳐서 실행합니다.
