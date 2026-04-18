# 🥊 GPT Debate Studio

문서를 업로드하면 서로 다른 성격의 GPT 에이전트들이 같은 자료를 두고 토론하고,  
충분히 수렴했을 때 `Final Consensus`를 정리해주는 `Next.js` 기반 앱입니다.

이 프로젝트는 단순한 채팅 데모가 아니라,
문서와 목표를 기준으로 **지금 무엇을 결정해야 하는지 빠르게 드러내는 토론 인터페이스**를 만드는 데 초점을 맞춥니다.

---

## ✨ Highlights

- 📄 `pdf`, `docx`, `txt`, `html` 문서 업로드
- 🧠 여러 GPT 에이전트의 역할 기반 토론
- 💬 채팅형 타임라인 UI
- 📡 SSE 기반 실시간 스트리밍
- ✅ 합의율이 기준을 넘으면 자동으로 `Final Consensus` 생성
- 🗂️ 세션 리스트 저장 및 다시 열기
- ✏️ 세션 제목 인라인 수정, 세션 삭제 지원
- 🗄️ 로컬 JSON 저장 + 선택적 Local Bridge/SQLite 저장

---

## 🖼️ What It Feels Like

1. 새 세션을 시작합니다.
2. 세션 제목, 목표, instruction, 문서를 넣습니다.
3. 서로 다른 GPT 에이전트가 문서 근거를 바탕으로 토론합니다.
4. 합의율과 goal alignment가 점점 수렴합니다.
5. 충분히 수렴하면 채팅 하단에 `Final Consensus` 카드가 나타납니다.
6. 세션은 좌측 리스트에 남고, 나중에 다시 열어 이어서 볼 수 있습니다.

---

## 🧩 Core Features

### 문서 기반 토론
업로드한 문서를 서버에서 텍스트로 추출하고, chunk 단위로 나눠 토론 컨텍스트에 넣습니다.

### 목표 중심 합의
합의는 단순 평균이 아니라 `agreementScore`와 `goalAlignmentScore`를 함께 봅니다.

### 페르소나 반영 에이전트
에이전트의 역할과 성격이 실제 토론 프롬프트에 반영됩니다.

### 채팅형 UX
토론 결과를 읽기 쉬운 대화 형식으로 보여줍니다.

### 세션 저장
기본적으로 로컬에서 세션을 보관하고, 원하면 브리지 방식으로 SQLite까지 확장할 수 있습니다.

---

## 🏗️ Architecture

```text
Browser
  -> Next.js App Router UI
  -> /api/debates
  -> OpenAI API
  -> /api/sessions

Optional persistence path
  -> Local Bridge
  -> SQLite
```

### 주요 파일

- `src/components/debate-app.tsx`
  메인 UI, 세션 리스트, 채팅 타임라인

- `src/lib/debate-engine.ts`
  토론 오케스트레이션, 라운드 흐름, 합의 계산

- `src/lib/document-parser.ts`
  문서 파싱 및 chunk 생성

- `src/app/api/debates/route.ts`
  SSE 스트리밍 토론 API

- `src/app/api/sessions/*`
  세션 조회, 수정, 삭제 API

- `bridge/server.mjs`
  Local Bridge 서버

---

## 🚀 Getting Started

### Requirements

- Node.js 22+
- npm
- OpenAI API key

### Install

```bash
git clone https://github.com/maetelson/ai-debate.git
cd ai-debate
npm install
```

### Environment Variables

`.env.local` 또는 `.env`에 아래 값을 넣습니다.

```bash
OPENAI_API_KEY=your_openai_api_key
```

### Development

```bash
npm run dev
```

실행 후 터미널에 표시되는 개발 서버 주소를 브라우저에서 열면 됩니다.

### Production Build

```bash
npm run build
npm run start
```

---

## 📄 Supported File Types

- `pdf`
- `docx`
- `txt`
- `html`

> 참고: 현재 PDF는 OCR 없는 텍스트 추출 중심입니다.  
> 스캔본 PDF는 품질이 떨어질 수 있습니다.

---

## 🧠 Debate Model

앱은 아래 흐름으로 동작합니다.

1. 문서를 텍스트로 추출합니다.
2. 토론용 chunk를 생성합니다.
3. 목표와 instruction을 바탕으로 debate brief를 구성합니다.
4. 여러 에이전트가 라운드 단위로 발언합니다.
5. Moderator/Judge가 합의율과 목표 정렬 정도를 계산합니다.
6. 기준 이상이면 종료, 아니면 다음 라운드로 진행합니다.

기본값:

- `Consensus Threshold`: 80
- `Max Rounds`: 20
- 설정 가능 범위: 10 ~ 50

---

## 💾 Persistence

### 기본 저장

세션은 로컬 JSON 파일로 저장됩니다.

```text
.data/sessions
```

### 확장 저장: Local Bridge + SQLite

원하면 브리지 서버를 켜서 세션 이벤트를 SQLite로도 적재할 수 있습니다.

```text
Browser -> App Server -> Local Bridge -> SQLite
```

---

## 🌉 Local Bridge

### Run

```bash
LOCAL_BRIDGE_TOKEN=your-secret-token npm run bridge
```

Windows PowerShell 예시:

```powershell
$env:LOCAL_BRIDGE_TOKEN="your-secret-token"
npm run bridge
```

기본 포트:

```text
8787
```

기본 DB 위치:

```text
.bridge-data/debate-bridge.sqlite
```

### Public Tunnel

`ngrok`, `Cloudflare Tunnel` 같은 터널 도구로 브리지 포트를 외부 HTTPS 주소에 연결합니다.

예시:

```bash
ngrok http 8787
```

### Vercel-style Environment Variables

브리지 연동 시 아래 값을 사용합니다.

```bash
LOCAL_BRIDGE_URL=https://your-bridge-url
LOCAL_BRIDGE_TOKEN=your-secret-token
```

---

## 🔐 Environment Variables

### App

- `OPENAI_API_KEY`

### Bridge Integration

- `LOCAL_BRIDGE_URL`
- `LOCAL_BRIDGE_TOKEN`

### Bridge Process

- `LOCAL_BRIDGE_TOKEN`
- `BRIDGE_PORT` (optional)
- `BRIDGE_DATA_DIR` (optional)

---

## 🧪 Validation

```bash
npm run lint
npm test
npm run build
```

---

## 🛠️ Tech Stack

- `Next.js 16`
- `React 19`
- `TypeScript`
- `OpenAI API`
- `shadcn/ui` style primitives
- `SSE`
- `SQLite`

---

## 📁 Project Structure

```text
src/
  app/
    api/
      debates/
      sessions/
  components/
    ui/
    debate-app.tsx
  lib/
    debate-engine.ts
    document-parser.ts
    persistence.ts
    storage/

bridge/
  server.mjs
  README.md

docs/
  commit-convention.md
  task-completion.md
  design-system.md
```

---

## 🧯 Troubleshooting

### 세션이 새로고침 후 사라져요

휘발성 런타임만 쓰면 세션이 유지되지 않을 수 있습니다.  
지속 저장이 필요하면 Local Bridge + SQLite를 사용하세요.

### 브리지는 켰는데 저장이 안 돼요

아래를 확인하세요.

- 브리지가 실제로 실행 중인지
- 터널 주소가 살아 있는지
- `LOCAL_BRIDGE_URL`, `LOCAL_BRIDGE_TOKEN` 값이 맞는지
- 브리지 토큰과 앱 서버 토큰이 같은지

### PDF가 잘 안 읽혀요

스캔본 PDF는 OCR이 없으면 추출 품질이 떨어질 수 있습니다.

### OpenAI 오류가 나요

- API Key가 올바른지
- 사용량/한도가 남아 있는지
- 모델 이름이 유효한지

---

## 🤝 Contributing

이 프로젝트는 빠르게 실험 중인 MVP입니다.  
이슈, 개선 제안, UX 피드백, PR 모두 환영합니다.

특히 이런 기여를 좋아합니다.

- 문서 파싱 품질 개선
- 스트리밍 UX 개선
- 토론 프롬프트 품질 향상
- 브리지 안정성 개선
- 모바일 UI 개선

---

## ⭐ If You Like This Project

저장소에 Star를 눌러주세요.  
관심이 다음 개선을 더 빨리 만듭니다.

---

## 📚 Docs

- [bridge/README.md](bridge/README.md)
- [docs/commit-convention.md](docs/commit-convention.md)
- [docs/task-completion.md](docs/task-completion.md)
- [docs/design-system.md](docs/design-system.md)

---

## One-line Summary

문서를 두고 GPT들이 토론하게 만들되, 그 결과가 실제 의사결정으로 이어지게 만드는 토론 스튜디오입니다.
