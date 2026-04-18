# GPT Debate Studio

문서를 업로드하고 여러 에이전트가 토론하는 `Next.js` 앱입니다.

## Local App

```powershell
cd C:\Users\hands\OneDrive\Desktop\fight
npm install
npm run dev
```

프로덕션처럼 로컬 실행:

```powershell
cd C:\Users\hands\OneDrive\Desktop\fight
npm install
npm run build
npm run start
```

로컬 실행 시 세션 JSON 저장 위치:

`C:\Users\hands\OneDrive\Desktop\fight\.data\sessions`

## Local Bridge + SQLite

Vercel 배포본에서 로컬 DB에 저장하려면 내 PC에서 브리지를 실행해야 합니다.

브리지 실행:

```powershell
cd C:\Users\hands\OneDrive\Desktop\fight
$env:LOCAL_BRIDGE_TOKEN="your-secret-token"
npm run bridge
```

브리지 기본 포트:

`8787`

SQLite 기본 경로:

`C:\Users\hands\OneDrive\Desktop\fight\.bridge-data\debate-bridge.sqlite`

브리지를 외부에서 접근 가능하게 하려면 `Cloudflare Tunnel` 또는 `ngrok`로 `localhost:8787`을 HTTPS URL로 노출하세요.

Vercel 환경변수:

- `LOCAL_BRIDGE_URL`
- `LOCAL_BRIDGE_TOKEN`

자세한 브리지 설정은 [bridge/README.md](bridge/README.md)를 참고하세요.
