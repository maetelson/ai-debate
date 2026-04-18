# 🥊 GPT Debate Studio

문서를 올리고, 서로 다른 성격의 GPT 에이전트들이 토론하고,  
충분히 합의가 이뤄지면 최종 결론을 정리해주는 `Next.js` 기반 앱입니다.

## ✨ 주요 기능

- 📄 `pdf`, `docx`, `txt`, `html` 문서 업로드
- 🧠 여러 에이전트가 채팅 형식으로 토론
- 📡 SSE 기반 실시간 대화 스트리밍
- ✅ 합의율이 기준을 넘으면 `Final Consensus` 자동 정리
- 💾 로컬 실행 시 세션 JSON 저장
- 🗄️ Vercel 배포본에서도 로컬 브리지 + SQLite로 세션 적재 가능

## 🖥️ 로컬에서 앱 실행

개발 모드:

```powershell
cd C:\Users\hands\OneDrive\Desktop\fight
npm install
npm run dev
```

브라우저에서 아래 주소를 열면 됩니다.

`http://localhost:3000`

프로덕션처럼 실행:

```powershell
cd C:\Users\hands\OneDrive\Desktop\fight
npm install
npm run build
npm run start
```

## 📂 로컬 기본 저장 위치

로컬에서 앱을 실행하면 세션은 아래 경로에 JSON으로 저장됩니다.

`C:\Users\hands\OneDrive\Desktop\fight\.data\sessions`

## 🌉 Vercel 배포본 + 로컬 DB 저장

Vercel 서버가 내 PC의 로컬 DB를 직접 쓰는 건 어렵습니다.  
대신 **로컬 브리지(Local Bridge)** 를 켜두면, 배포본에서 생성된 세션 이벤트를 내 PC의 SQLite DB로 적재할 수 있습니다.

흐름:

`브라우저 → Vercel API → 로컬 브리지 → SQLite`

## 🚀 로컬 브리지 실행

```powershell
cd C:\Users\hands\OneDrive\Desktop\fight
$env:LOCAL_BRIDGE_TOKEN="your-secret-token"
npm run bridge
```

기본 포트:

`8787`

SQLite 저장 위치:

`C:\Users\hands\OneDrive\Desktop\fight\.bridge-data\debate-bridge.sqlite`

## 🌐 외부에서 브리지 접속 가능하게 만들기

`Cloudflare Tunnel` 또는 `ngrok`로 `localhost:8787`을 외부 HTTPS 주소로 노출하면 됩니다.

예시:

```powershell
ngrok http 8787
```

그다음 Vercel 환경변수에 아래 값을 넣으면 됩니다.

- `LOCAL_BRIDGE_URL`
- `LOCAL_BRIDGE_TOKEN`

## 🔐 필요한 환경변수

앱 서버:

- `OPENAI_API_KEY`

브리지 연동까지 사용할 때:

- `LOCAL_BRIDGE_URL`
- `LOCAL_BRIDGE_TOKEN`

브리지 프로세스:

- `LOCAL_BRIDGE_TOKEN`
- `BRIDGE_PORT` (선택)
- `BRIDGE_DATA_DIR` (선택)

## 📘 추가 문서

- 브리지 상세 설명: [bridge/README.md](bridge/README.md)
- 커밋 규칙: [docs/commit-convention.md](docs/commit-convention.md)
- 작업 종료 체크리스트: [docs/task-completion.md](docs/task-completion.md)

## 🛠️ 기술 스택

- `Next.js`
- `React`
- `shadcn/ui` 스타일 기반 UI
- `OpenAI API`
- `SQLite` (로컬 브리지 저장)

## 💡 한 줄 요약

문서를 두고 GPT들이 싸우게 하고,  
그 대화와 결과를 로컬에도 남길 수 있게 만든 토론 스튜디오입니다.
