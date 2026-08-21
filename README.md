# South India Coffee Shop

Monorepo for the South India Coffee Shop application.

## API development

Copy `apps/api/.env.example` to `apps/api/.env`, ensure MongoDB is available at
`MONGODB_URI`, then run:

```powershell
npm install
npm run dev:api
```

The health endpoint is available at `http://localhost:4000/api/health`.

If the local DNS provider rejects MongoDB Atlas SRV lookups, set
`MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8` in `apps/api/.env`.

## Quality checks

```powershell
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```
