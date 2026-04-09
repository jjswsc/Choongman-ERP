# AI Eval Harness

ERP AI 응답 품질을 정기적으로 점검하기 위한 간단한 평가 하네스입니다.

## 실행

```bash
cd vercel-app
npm run ai:harness
```

- 기본 케이스 파일: `scripts/ai-eval-cases.json`
- API 키가 없으면 기본 명령은 `skip` 처리합니다.

## 엄격 모드

```bash
cd vercel-app
npm run ai:harness:strict
```

- `OPENAI_API_KEY`가 없으면 실패(exit code 1)합니다.
- CI에서 AI 검증을 강제할 때 사용합니다.

## 케이스 작성 규칙

케이스는 배열(JSON)이며 각 항목은 아래 필드를 가집니다.

- `id`: 케이스 식별자
- `query`: 모델에 전달할 질문
- `mustInclude`: 응답에 반드시 포함되어야 할 정규식 배열
- `mustNotInclude`: 응답에 포함되면 안 되는 정규식 배열
- `minLength`: 최소 응답 길이

예시:

```json
{
  "id": "bangkok-time-policy",
  "query": "근태 마감 기준 시간을 설명해 주세요.",
  "mustInclude": ["방콕|Bangkok|Asia/Bangkok", "UTC\\+7"],
  "mustNotInclude": ["로컬 PC 시간만"],
  "minLength": 60
}
```
