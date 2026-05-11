---
name: "lark-docs-addon-opdev"
description: "Standardizes Lark Docs Add-on opdev setup, login, upload, and troubleshooting. Invoke when developing, uploading, or debugging a Docs Add-on project."
---

# Lark Docs Add-on Opdev

## Purpose

This Skill standardizes the local developer-tooling setup for Lark / Feishu Docs Add-on projects. Use it to avoid repeated issues caused by `opdev` path problems, environment mismatch, login/session confusion, upload script misconfiguration, or broken CLI storage.

Typical symptoms include:

- `command not found: opdev`
- `Not logged in`
- `Not allowed to upload block`
- `self-signed certificate in certificate chain`
- `Cannot find module '@bdeefe/feishu-devtools-core/...`
- `ERR_OSSL_BAD_DECRYPT`

Invoke this Skill when the user is:

- setting up or repairing a Docs Add-on local environment
- configuring `npm run upload`
- debugging `opdev login / whoami / upload`
- troubleshooting upload failures for Lark / Lark Japan tenants

## Baseline Requirements

### 1. Version Matching

If the Docs Add-on project uses:

- `@lark-opdev/block-docs-addon-webpack-utils >= 1.0.0`

then the global developer tool should be:

- `opdev >= 3.3.0`

Recommended install:

```bash
npm install -g @lark-opdev/cli@latest
```

If legacy tools may exist, clean them first:

```bash
npm uninstall -g @bdeefe/opdev-cli
npm uninstall -g @lark-opdev/cli
```

### 2. Environment Selection

If the app belongs to `Lark` / `Lark Japan`, use:

```bash
opdev login -e lark
```

Do not use:

```bash
opdev login -e feishu
```

### 3. Minimum Valid `app.json`

A Docs Add-on project should contain at least:

- `manifestVersion`
- `appID`
- `blockTypeID`
- `projectName`
- `contributes.addPanel.view`
- `contributes.addPanel.initialHeight`

Example:

```json
{
  "manifestVersion": 1,
  "appID": "cli_xxx",
  "appType": "docs-addon",
  "blockTypeID": "blk_xxx",
  "projectName": "timeline",
  "contributes": {
    "addPanel": {
      "initialHeight": 520,
      "view": "index.html"
    }
  }
}
```

## Recommended Script Setup

### `package.json` Scripts

Prefer a single, standardized script entry so login, session inspection, and upload all use the same `opdev` binary and environment:

```json
{
  "scripts": {
    "start": "cross-env NODE_ENV=development webpack-dev-server --mode development",
    "build": "cross-env NODE_ENV=production webpack --mode production",
    "opdev:login": "sh -c 'PATH=\"/opt/homebrew/bin:$PATH\" NODE_TLS_REJECT_UNAUTHORIZED=0 /opt/homebrew/bin/opdev login -e lark'",
    "opdev:whoami": "sh -c 'PATH=\"/opt/homebrew/bin:$PATH\" NODE_TLS_REJECT_UNAUTHORIZED=0 /opt/homebrew/bin/opdev whoami'",
    "opdev:upload": "sh -c 'PATH=\"/opt/homebrew/bin:$PATH\" NODE_TLS_REJECT_UNAUTHORIZED=0 /opt/homebrew/bin/opdev upload ./dist -v patch -d \"npm run upload\"'",
    "upload": "npm run build && npm run opdev:upload"
  }
}
```

### Why This Works

- Forces use of a known-good global binary: `/opt/homebrew/bin/opdev`
- Avoids accidental use of broken local `node_modules/.bin/opdev`
- Adds `-v patch` to avoid interactive version prompts during upload
- Adds `-d` for a stable version description
- Adds `NODE_TLS_REJECT_UNAUTHORIZED=0` to work around enterprise proxy / certificate-chain issues

## Standard Workflow

### 1. Verify Tool Availability

```bash
opdev help
node -v
npm -v
```

### 2. Login

```bash
npm run opdev:login
```

### 3. Verify Session

```bash
npm run opdev:whoami
```

Expected output:

```text
Current user is:
  - Environment: lark
  - User: <user name>
  - Tenant: <tenant name>
```

### 4. Upload

```bash
npm run upload
```

## Common Errors and How to Classify Them

### `command not found: opdev`

Meaning:

- `opdev` is not installed
- `opdev` is not in `PATH`
- the symlink is broken

Fix:

- reinstall global `@lark-opdev/cli`
- verify `/opt/homebrew/bin/opdev`
- verify `/opt/homebrew/bin/node` and `/opt/homebrew/bin/npm`

### `Cannot find module '@bdeefe/feishu-devtools-core/...`

Meaning:

- runtime is hitting a broken local `@lark-opdev/cli`

Fix:

- do not let upload scripts resolve to `node_modules/.bin/opdev`
- explicitly use global `/opt/homebrew/bin/opdev`

### `Not logged in`

Split this into two cases:

#### Case A: `opdev whoami` shows a valid user, but `npm run upload` still says `Not logged in`

Meaning:

- `whoami` and `upload` are not using the same `opdev`
- or they are not using the same session / environment context

Fix:

- unify all script entry points
- ensure all commands go through `npm run opdev:whoami` / `npm run upload`
- do not mix raw commands and npm scripts casually

#### Case B: login succeeds, but the next command immediately becomes `Not logged in`

High probability:

- CLI storage is corrupted

Check for:

```text
ERR_OSSL_BAD_DECRYPT
```

### `self-signed certificate in certificate chain`

Meaning:

- corporate proxy / enterprise certificate injection is affecting Node HTTPS

Workaround:

```bash
NODE_TLS_REJECT_UNAUTHORIZED=0
```

Long-term fix:

- add the enterprise CA properly to the system or Node trust chain

### `Not allowed to upload block`

Meaning:

- login is valid and the request reached the platform
- the current account or environment is not allowed to upload that `blockTypeID`

Check:

- `whoami` environment must be `lark`
- tenant must be correct
- current user must be Owner / authorized collaborator in Open Platform
- `blockTypeID` must belong to the current app

## Priority Triage Order

When upload fails, check in this order:

1. `npm run opdev:whoami`
2. `app.json` values for `appID` / `blockTypeID`
3. whether the current account is the app Owner
4. whether the current environment is `lark`
5. whether `package.json` upload uses global `opdev`
6. whether logs contain `ERR_OSSL_BAD_DECRYPT`
7. whether logs contain `self-signed certificate`

## Special `storageV2` Trap

If logs show:

```text
StorageUtilsV2.Cipher.decrypt ERROR decrypt
ERR_OSSL_BAD_DECRYPT
```

then the CLI cannot decrypt `storage.sec.json`.

Typical symptoms:

- login appears successful, but the next `whoami` becomes `Not login`
- `storage.sec.json` exists but cannot be read correctly

Temporary workaround:

1. back up `.mpdev-cli/fg.json`
2. remove the feature gate `opdev.storage.v2`
3. delete the broken `storage.sec.json`
4. log in again

Only do this when the decrypt error is clearly present.

## Agent Behavior Requirements

When handling this class of issue, the agent should:

- not assume the user is simply “not logged in”
- compare whether `whoami` and `upload` are using the same `opdev`
- avoid switching `HOME` unless session isolation is explicitly intended
- not default to `feishu` for `Lark Japan` projects
- first check whether scripts are accidentally using `node_modules/.bin/opdev`
- if the user already proved a valid session with `opdev whoami`, prioritize environment / script mismatch analysis

## Recommended Response Structure

When taking over this kind of problem, start with:

1. whether the current login state is valid
2. which `opdev` binary the upload path is actually using
3. whether the current environment is `feishu` or `lark`
4. what class of error this is:
   - path issue
   - session issue
   - certificate issue
   - CLI storage issue
   - platform permission issue
5. the smallest next corrective action

## Final Working Pattern From This Project

For this project, the stable setup is:

- use global `opdev` from `/opt/homebrew/bin/opdev`
- use `lark` as the login environment
- let `npm run upload` reuse the default already-logged-in session
- have upload script include:
  - `-v patch`
  - `-d "npm run upload"`
  - `NODE_TLS_REJECT_UNAUTHORIZED=0`

If `npm run opdev:whoami` shows the current user correctly, `npm run upload` is trustworthy.
