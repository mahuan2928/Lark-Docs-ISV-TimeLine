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

Make sure the following are ready:

- the app has Base-related OpenAPI scopes enabled
- the app has access to the target Base
- you can obtain the app secret from the platform console

## Current Architecture

The backend now calls official Base OpenAPI directly:

- app credentials -> `tenant_access_token`
- `tenant_access_token` -> list tables / list fields / search records

This removes the previous dependency on `lark-cli` and user-side local authorization state.

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
LARK_APP_ID=cli_a97adc137d79de17
LARK_APP_SECRET=your_app_secret
LARK_OPENAPI_BASE_URL=https://open.larksuite.com
TIMELINE_API_BASE_URL=https://your-railway-service.up.railway.app
```

Notes:

- Railway will inject `PORT` automatically on most setups
- `TIMELINE_API_BASE_URL` is used when building the frontend bundle
- `LARK_APP_ID` defaults to the app id in `app.json`, but setting it explicitly is clearer
- `LARK_OPENAPI_BASE_URL` can stay as `https://open.larksuite.com` unless your environment requires another official OpenAPI domain

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

If the resolve request succeeds but records fail, check:

- whether the app has Base permissions approved
- whether the target Base granted access to the app
- whether the selected table / view still exists
