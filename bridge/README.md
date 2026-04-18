# Local Debate Bridge

이 브리지는 Vercel에서 생성한 세션 이벤트를 내 PC의 SQLite DB에 저장합니다.

## Run

```powershell
cd C:\Users\hands\OneDrive\Desktop\fight
$env:LOCAL_BRIDGE_TOKEN="your-secret-token"
npm run bridge
```

선택 환경변수:

- `BRIDGE_PORT`
- `BRIDGE_DATA_DIR`
- `LOCAL_BRIDGE_TOKEN`

## Tunnel

예시 `ngrok`:

```powershell
ngrok http 8787
```

그다음 Vercel에 아래 값을 넣습니다.

- `LOCAL_BRIDGE_URL=https://<your-public-bridge-url>`
- `LOCAL_BRIDGE_TOKEN=<same-token>`

## Endpoints

- `GET /health`
- `GET /sessions`
- `GET /sessions/:id`
- `POST /events/session-started`
- `POST /events/message`
- `POST /events/snapshot`
- `POST /events/session-completed`
- `POST /events/session-failed`

모든 `GET /sessions*` 및 `POST /events/*` 요청은 아래 헤더가 필요합니다.

`Authorization: Bearer <LOCAL_BRIDGE_TOKEN>`
