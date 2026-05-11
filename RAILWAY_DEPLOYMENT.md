# Railway Deployment

## Goal

Deploy the Timeline backend API to Railway so the Docs Add-on no longer depends on `http://localhost:8787`.

## What Gets Deployed

This Railway service runs:

- `server/index.js`
- `server/base-service.js`

It exposes:

- `GET /api/health`
- `POST /api/base/resolve`
- `GET /api/base/schema`
- `GET /api/base/records`

## Before You Start

Make sure the following are ready on your local machine first:

- `lark-cli` works
- `lark-cli auth login --domain base` has already completed
- the target account can access the Base you want to read

## Important Limitation

The current backend implementation shells out to `lark-cli`.

That means Railway must be able to access:

- a valid `lark-cli` binary
- a valid user authorization state

For a production-grade multi-tenant ISV backend, the next step should be replacing `lark-cli` calls with official OpenAPI token flows. The current Railway deployment is suitable for staging / early production validation, not the final multi-tenant architecture.

## Railway Service Setup

### 1. Create a New Railway Project

- Create a new Railway project from this repository
- Set the service root to the repository root

### 2. Start Command

Railway can use the included `Procfile`:

```text
web: npm run backend:start
```

If you prefer manual config, use:

```bash
npm run backend:start
```

### 3. Environment Variables

Set these in Railway:

```bash
PORT=8787
TIMELINE_API_PORT=8787
TIMELINE_API_BASE_URL=https://your-railway-service.up.railway.app
LARK_CLI_BIN=/path/to/lark-cli
```

Notes:

- Railway will inject `PORT` automatically on most setups
- `TIMELINE_API_BASE_URL` is used when building the frontend bundle
- `LARK_CLI_BIN` is only needed if `lark-cli` is not already in `PATH`

## Health Check

After deployment, verify:

```bash
curl https://your-railway-service.up.railway.app/api/health
```

Expected response:

```json
{
  "ok": true,
  "service": "timeline-api"
}
```

## Frontend Build for Production

When building the Docs Add-on for production, inject the Railway backend URL:

```bash
TIMELINE_API_BASE_URL=https://your-railway-service.up.railway.app npm run build
```

Then upload as usual:

```bash
opdev upload ./dist -v patch -d "timeline production api"
```

## Validation Checklist

Before uploading the frontend, verify:

```bash
curl -X POST 'https://your-railway-service.up.railway.app/api/base/resolve' \
  -H 'Content-Type: application/json' \
  -d '{"baseUrl":"https://lark-japan.jp.larksuite.com/base/xxx?table=yyy&view=zzz"}'
```

And:

```bash
curl 'https://your-railway-service.up.railway.app/api/base/records?baseToken=xxx&tableId=yyy&viewId=zzz'
```

## Recommended Next Step

After Railway deployment is stable, replace the current `lark-cli`-based data layer with direct OpenAPI integration so the backend does not depend on local-style CLI authorization behavior.
