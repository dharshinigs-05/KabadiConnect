# KabadiConnect frontend

React/Vite implementation of the collector and recycler experiences, driven by the frozen `/contracts` API.

```powershell
cd frontend
Copy-Item .env.example .env
npm install
npm run dev
```

Set `VITE_API_BASE_URL` to the backend `/v1` URL. The collector experience is selected for `collector` logins; recycler/admin logins open the desktop operations workspace.

The collector lot queue is local-storage backed and uses the contract-required `client_uuid`; it can be retried through `POST /sync/lots` after reconnecting.
