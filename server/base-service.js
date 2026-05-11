const crypto = require('crypto');
const appConfig = require('../app.json');

class AppError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const DEFAULT_OPENAPI_BASE_URL = 'https://open.larksuite.com';
const OPENAPI_BASE_URL = `${process.env.LARK_OPENAPI_BASE_URL || process.env.OPENAPI_BASE_URL || DEFAULT_OPENAPI_BASE_URL}`.replace(
  /\/+$/,
  ''
);
const APP_ID = `${process.env.LARK_APP_ID || process.env.APP_ID || appConfig.appID || ''}`.trim();
const APP_SECRET = `${process.env.LARK_APP_SECRET || process.env.APP_SECRET || ''}`.trim();
const USER_AUTH_SCOPES = `${process.env.LARK_USER_AUTH_SCOPES || process.env.LARK_OAUTH_SCOPES || ''}`.trim();
const USER_AUTH_CALLBACK_PATH = '/api/auth/lark/callback';
const AUTH_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

const tokenCache = {
  value: '',
  expiresAt: 0,
  pending: null,
};
const userAuthSessions = new Map();

const buildQueryString = (query) => {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }
    params.set(key, `${value}`);
  });
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
};

const createOpenApiError = ({ status, code, msg, responseText }) => {
  const normalized = `${msg || responseText || ''}`.toLowerCase();

  if (
    status === 401 ||
    code === 99991661 ||
    code === 99991663 ||
    normalized.includes('tenant_access_token') ||
    normalized.includes('app_access_token')
  ) {
    return new AppError('service_unavailable', msg || 'OpenAPI authorization failed', 503);
  }

  if (
    status === 403 ||
    code === 1254302 ||
    code === 99991672 ||
    normalized.includes('permission denied') ||
    normalized.includes('no permissions')
  ) {
    return new AppError('permission_denied', msg || 'Permission denied', 403);
  }

  if (code === 1254040 || code === 1254003 || normalized.includes('basetokennotfound')) {
    return new AppError('base_not_found', msg || 'Base not found', 404);
  }

  if (code === 1254036 || code === 1254290 || code === 1254607 || code === 1255040 || normalized.includes('try again later')) {
    return new AppError('service_unavailable', msg || 'Service unavailable', 503);
  }

  if (
    status === 400 ||
    code === 1254004 ||
    code === 1254005 ||
    code === 1254041 ||
    code === 1254042 ||
    normalized.includes('wrongtableid') ||
    normalized.includes('wrongviewid') ||
    normalized.includes('invalid')
  ) {
    return new AppError('invalid_request', msg || 'Invalid request', 400);
  }

  return new AppError('service_unavailable', msg || responseText || 'OpenAPI request failed', status >= 500 ? 503 : 502);
};

const parseOpenApiEnvelope = async (response) => {
  const responseText = await response.text();
  const trimmed = responseText.trim();

  if (!trimmed) {
    throw new AppError('service_unavailable', 'OpenAPI returned an empty response', 502);
  }

  let envelope;
  try {
    envelope = JSON.parse(trimmed);
  } catch (_error) {
    throw new AppError('service_unavailable', 'OpenAPI returned invalid JSON', 502);
  }

  if (!response.ok || envelope.code !== 0) {
    throw createOpenApiError({
      status: response.status,
      code: envelope.code,
      msg: envelope.msg,
      responseText: trimmed,
    });
  }

  return envelope;
};

const ensureAppCredentials = () => {
  if (!APP_ID || !APP_SECRET) {
    throw new AppError('service_unavailable', 'Missing LARK_APP_ID or LARK_APP_SECRET', 503);
  }
};

const requestOpenApiEnvelope = async ({ method = 'GET', path, query, body, skipAuth = false, accessToken }) => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  } else if (!skipAuth) {
    headers.Authorization = `Bearer ${await getTenantAccessToken()}`;
  }

  let response;
  try {
    response = await fetch(`${OPENAPI_BASE_URL}${path}${buildQueryString(query)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new AppError('service_unavailable', error instanceof Error ? error.message : 'Network request failed', 503);
  }

  return parseOpenApiEnvelope(response);
};

const requestOpenApiData = async (options) => {
  const envelope = await requestOpenApiEnvelope(options);
  return envelope.data || {};
};

const generateOpaqueToken = (size = 24) => crypto.randomBytes(size).toString('base64url');

const getRequestOrigin = (req) => {
  const forwardedProto = `${req?.headers?.['x-forwarded-proto'] || ''}`.split(',')[0].trim();
  const proto = forwardedProto || 'https';
  const host = `${req?.headers?.['x-forwarded-host'] || req?.headers?.host || ''}`.split(',')[0].trim();
  if (!host) {
    throw new AppError('service_unavailable', 'Cannot determine request host', 503);
  }
  return `${proto}://${host}`;
};

const getOAuthRedirectUri = (req) => {
  const configured = `${process.env.LARK_OAUTH_REDIRECT_URI || process.env.LARK_REDIRECT_URI || ''}`.trim();
  if (configured) {
    return configured;
  }
  return `${getRequestOrigin(req)}${USER_AUTH_CALLBACK_PATH}`;
};

const cleanupExpiredAuthSessions = () => {
  const now = Date.now();
  for (const [state, session] of userAuthSessions.entries()) {
    if ((session.expiresAt || 0) <= now) {
      userAuthSessions.delete(state);
    }
  }
};

const buildAuthorizeUrl = ({ req, state }) => {
  if (!USER_AUTH_SCOPES) {
    throw new AppError('service_unavailable', 'Missing LARK_USER_AUTH_SCOPES', 503);
  }
  const url = new URL('https://accounts.larksuite.com/open-apis/authen/v1/authorize');
  url.searchParams.set('client_id', APP_ID);
  url.searchParams.set('redirect_uri', getOAuthRedirectUri(req));
  url.searchParams.set('scope', USER_AUTH_SCOPES);
  url.searchParams.set('state', state);
  return url.toString();
};

const exchangeAuthCodeForUserToken = async ({ code, req }) => {
  ensureAppCredentials();
  const envelope = await requestOpenApiEnvelope({
    method: 'POST',
    path: '/open-apis/authen/v2/oauth/token',
    skipAuth: true,
    body: {
      grant_type: 'authorization_code',
      client_id: APP_ID,
      client_secret: APP_SECRET,
      code,
      redirect_uri: getOAuthRedirectUri(req),
    },
  });

  const accessToken = `${envelope.access_token || ''}`.trim();
  if (!accessToken) {
    throw new AppError('authorization_required', 'Missing user access token', 401);
  }

  return {
    accessToken,
    expiresAt: Date.now() + Number(envelope.expires_in || 0) * 1000,
    refreshToken: `${envelope.refresh_token || ''}`.trim(),
    scope: `${envelope.scope || ''}`.trim(),
  };
};

const getValidUserAccessToken = (authState) => {
  cleanupExpiredAuthSessions();
  const normalized = `${authState || ''}`.trim();
  if (!normalized) {
    return '';
  }
  const session = userAuthSessions.get(normalized);
  if (!session) {
    return '';
  }
  if (session.status !== 'authorized') {
    return '';
  }
  if ((session.expiresAt || 0) <= Date.now()) {
    userAuthSessions.delete(normalized);
    return '';
  }
  return session.accessToken || '';
};

const getTenantAccessToken = async () => {
  ensureAppCredentials();

  const now = Date.now();
  if (tokenCache.value && tokenCache.expiresAt - now > 5 * 60 * 1000) {
    return tokenCache.value;
  }

  if (tokenCache.pending) {
    return tokenCache.pending;
  }

  tokenCache.pending = (async () => {
    const envelope = await requestOpenApiEnvelope({
      method: 'POST',
      path: '/open-apis/auth/v3/app_access_token/internal',
      body: {
        app_id: APP_ID,
        app_secret: APP_SECRET,
      },
      skipAuth: true,
    });

    const tenantAccessToken = `${envelope.tenant_access_token || ''}`.trim();
    const expireInSeconds = Number(envelope.expire || 0);
    if (!tenantAccessToken || !Number.isFinite(expireInSeconds) || expireInSeconds <= 0) {
      throw new AppError('service_unavailable', 'OpenAPI token response is missing tenant_access_token', 502);
    }

    tokenCache.value = tenantAccessToken;
    tokenCache.expiresAt = Date.now() + expireInSeconds * 1000;
    return tenantAccessToken;
  })();

  try {
    return await tokenCache.pending;
  } finally {
    tokenCache.pending = null;
  }
};

const parseBaseUrl = (rawUrl) => {
  try {
    const parsed = new URL(`${rawUrl || ''}`.trim());
    const matched = parsed.pathname.match(/\/base\/([^/?#]+)/);
    return {
      baseToken: matched?.[1] || '',
      tableId: parsed.searchParams.get('table') || parsed.searchParams.get('tableId') || '',
      viewId: parsed.searchParams.get('view') || parsed.searchParams.get('viewId') || '',
    };
  } catch (_error) {
    return {
      baseToken: '',
      tableId: '',
      viewId: '',
    };
  }
};

const buildBaseUrlFromToken = (baseToken) => {
  if (!baseToken) return '';
  return `https://lark-japan.jp.larksuite.com/base/${baseToken}`;
};

const getDriveItemTypeParts = (item) => ({
  type: `${item?.type || ''}`.trim(),
  fileType: `${item?.file_type || ''}`.trim(),
  objType: `${item?.obj_type || ''}`.trim(),
  mimeType: `${item?.mime_type || item?.mimeType || ''}`.trim(),
});

const getDriveItemTypeSignature = (item) => {
  const parts = getDriveItemTypeParts(item);
  return [parts.type, parts.fileType, parts.objType, parts.mimeType].filter(Boolean).join(' | ') || '(empty)';
};

const isPotentialBaseItem = (item) => {
  const { type, fileType, objType, mimeType } = getDriveItemTypeParts(item);
  const haystack = [type, fileType, objType, mimeType, `${item?.url || item?.web_url || ''}`]
    .join(' ')
    .toLowerCase();

  return haystack.includes('bitable') || haystack.includes('/base/') || /\bbase\b/.test(haystack);
};

const normalizeDriveItemToBase = (item) => {
  const baseToken = `${item?.token || item?.file_token || item?.obj_token || ''}`.trim();
  if (!baseToken) {
    return null;
  }

  return {
    id: baseToken,
    name: `${item?.name || item?.title || baseToken}`.trim(),
    baseToken,
    type: getDriveItemTypeSignature(item),
    url: `${item?.url || item?.web_url || buildBaseUrlFromToken(baseToken)}`.trim(),
    ownerId: `${item?.owner_id || item?.ownerId || ''}`.trim(),
  };
};

const listBases = async ({ debug = false, accessToken } = {}) => {
  const bases = [];
  const debugItems = [];
  const typeSummary = new Map();
  let pageToken = '';

  while (true) {
    const data = await requestOpenApiData({
      path: '/open-apis/drive/v1/files',
      query: {
        page_size: 200,
        page_token: pageToken || undefined,
        order_by: 'EditedTime',
        direction: 'DESC',
      },
      accessToken,
    });

    const pageItems = Array.isArray(data.files) ? data.files : Array.isArray(data.items) ? data.items : [];
    pageItems.forEach((item) => {
      const signature = getDriveItemTypeSignature(item);
      typeSummary.set(signature, (typeSummary.get(signature) || 0) + 1);
    });
    if (debug) {
      debugItems.push(
        ...pageItems.slice(0, 20).map((item) => ({
          name: `${item?.name || item?.title || ''}`.trim(),
          token: `${item?.token || item?.file_token || item?.obj_token || ''}`.trim(),
          url: `${item?.url || item?.web_url || ''}`.trim(),
          ...getDriveItemTypeParts(item),
        }))
      );
    }
    const pageBases = pageItems
      .filter((item) => isPotentialBaseItem(item))
      .map(normalizeDriveItemToBase)
      .filter(Boolean);

    bases.push(...pageBases);

    if (!data.has_more) {
      break;
    }
    if (!data.page_token) {
      throw new AppError('service_unavailable', 'Drive pagination returned has_more without page_token', 502);
    }
    pageToken = data.page_token;
  }

  const items = dedupeBaseList(bases);
  if (!debug) {
    return { items };
  }

  return {
    items,
    debug: {
      totalCandidates: items.length,
      typeSummary: [...typeSummary.entries()]
        .map(([signature, count]) => ({ signature, count }))
        .sort((left, right) => right.count - left.count),
      samples: debugItems,
    },
  };
};

const dedupeBaseList = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.baseToken || seen.has(item.baseToken)) {
      return false;
    }
    seen.add(item.baseToken);
    return true;
  });
};

const listTables = async (baseToken) => {
  const tables = [];
  let pageToken = '';

  while (true) {
    const data = await requestOpenApiData({
      path: `/open-apis/bitable/v1/apps/${encodeURIComponent(baseToken)}/tables`,
      query: {
        page_size: 100,
        page_token: pageToken || undefined,
      },
    });
    const pageItems = Array.isArray(data.items) ? data.items : [];
    tables.push(
      ...pageItems.map((item) => ({
        id: item.table_id,
        name: item.name,
        revision: item.revision,
      }))
    );

    if (!data.has_more) {
      break;
    }
    if (!data.page_token) {
      throw new AppError('service_unavailable', 'OpenAPI pagination returned has_more without page_token', 502);
    }
    pageToken = data.page_token;
  }

  return tables;
};

const listFields = async ({ baseToken, tableId, viewId }) => {
  const fields = [];
  let pageToken = '';

  while (true) {
    const data = await requestOpenApiData({
      path: `/open-apis/bitable/v1/apps/${encodeURIComponent(baseToken)}/tables/${encodeURIComponent(tableId)}/fields`,
      query: {
        view_id: viewId || undefined,
        page_size: 100,
        page_token: pageToken || undefined,
      },
    });
    const pageItems = Array.isArray(data.items) ? data.items : [];
    fields.push(
      ...pageItems.map((item) => ({
        id: item.field_id,
        name: item.field_name,
        type: `${item.ui_type || item.type || ''}`,
      }))
    );

    if (!data.has_more) {
      break;
    }
    if (!data.page_token) {
      throw new AppError('service_unavailable', 'OpenAPI pagination returned has_more without page_token', 502);
    }
    pageToken = data.page_token;
  }

  return fields;
};

const getSchema = async ({ baseToken, tableId }) => {
  if (!baseToken) {
    throw new AppError('invalid_request', 'Missing baseToken', 400);
  }

  const tables = await listTables(baseToken);
  if (!tables.length) {
    throw new AppError('no_tables', 'No tables found in this Base', 404);
  }

  const hasRequestedTable = tableId && tables.some((table) => table.id === tableId);
  const effectiveTableId = hasRequestedTable ? tableId : tables[0].id;
  const fields = effectiveTableId ? await listFields({ baseToken, tableId: effectiveTableId }) : [];

  return {
    baseToken,
    tableId: effectiveTableId,
    tables,
    fields,
  };
};

const getRecords = async ({ baseToken, tableId, viewId }) => {
  if (!baseToken || !tableId) {
    throw new AppError('invalid_request', 'Missing baseToken or tableId', 400);
  }

  const records = [];
  let pageToken = '';

  while (true) {
    const data = await requestOpenApiData({
      method: 'POST',
      path: `/open-apis/bitable/v1/apps/${encodeURIComponent(baseToken)}/tables/${encodeURIComponent(tableId)}/records/search`,
      query: {
        page_size: 500,
        page_token: pageToken || undefined,
      },
      body: {
        view_id: viewId || undefined,
        automatic_fields: false,
      },
    });

    const pageRecords = Array.isArray(data.items)
      ? data.items.map((item) => ({
          record_id: item.record_id,
          fields: item.fields || {},
        }))
      : [];
    records.push(...pageRecords);

    if (!data.has_more) {
      break;
    }
    if (!data.page_token || pageRecords.length === 0) {
      throw new AppError('service_unavailable', 'Unexpected pagination state while reading records', 502);
    }
    pageToken = data.page_token;
  }

  return { records };
};

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new AppError('invalid_request', 'Request body too large', 413));
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (_error) {
        reject(new AppError('invalid_request', 'Invalid JSON body', 400));
      }
    });
    req.on('error', reject);
  });

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const sendError = (res, fallbackCode, fallbackMessage, error) => {
  if (error instanceof AppError) {
    sendJson(res, error.status, { code: error.code, error: error.message });
    return;
  }
  sendJson(res, 500, { code: fallbackCode, error: error instanceof Error ? error.message : fallbackMessage });
};

const attachBaseApiRoutes = (app) => {
  app.get('/api/auth/lark/start', async (req, res) => {
    try {
      cleanupExpiredAuthSessions();
      const state = generateOpaqueToken();
      userAuthSessions.set(state, {
        status: 'pending',
        createdAt: Date.now(),
        expiresAt: Date.now() + AUTH_SESSION_TTL_MS,
      });
      sendJson(res, 200, {
        state,
        authorizeUrl: buildAuthorizeUrl({ req, state }),
      });
    } catch (error) {
      sendError(res, 'auth_start_failed', 'Auth start failed', error);
    }
  });

  app.get(USER_AUTH_CALLBACK_PATH, async (req, res) => {
    const state = `${req.query?.state || ''}`.trim();
    const code = `${req.query?.code || ''}`.trim();
    const errorMessage = `${req.query?.error || ''}`.trim();
    const session = userAuthSessions.get(state);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (!state || !session) {
      res.end('<!doctype html><html><body>Invalid auth state. You can close this window.</body></html>');
      return;
    }

    if (errorMessage) {
      session.status = 'failed';
      session.error = errorMessage;
      session.expiresAt = Date.now() + 5 * 60 * 1000;
      res.end('<!doctype html><html><body>Authorization was cancelled. You can close this window.</body></html>');
      return;
    }

    try {
      const tokenInfo = await exchangeAuthCodeForUserToken({ code, req });
      session.status = 'authorized';
      session.accessToken = tokenInfo.accessToken;
      session.refreshToken = tokenInfo.refreshToken;
      session.scope = tokenInfo.scope;
      session.expiresAt = Math.min(tokenInfo.expiresAt || Date.now() + AUTH_SESSION_TTL_MS, Date.now() + AUTH_SESSION_TTL_MS);
      res.end('<!doctype html><html><body>Authorization succeeded. You can close this window.</body></html>');
    } catch (error) {
      session.status = 'failed';
      session.error = error instanceof Error ? error.message : 'Authorization failed';
      session.expiresAt = Date.now() + 5 * 60 * 1000;
      res.end('<!doctype html><html><body>Authorization failed. You can close this window.</body></html>');
    }
  });

  app.get('/api/auth/lark/session', async (req, res) => {
    cleanupExpiredAuthSessions();
    const state = `${req.query?.state || ''}`.trim();
    const session = userAuthSessions.get(state);
    if (!state || !session) {
      sendJson(res, 404, { code: 'authorization_required', status: 'missing' });
      return;
    }
    sendJson(res, 200, {
      status: session.status,
      state,
      scope: session.scope || '',
      error: session.error || '',
      expiresAt: session.expiresAt || 0,
    });
  });

  app.get('/api/base/list', async (req, res) => {
    try {
      const accessToken = getValidUserAccessToken(req.query?.auth_state);
      if (!accessToken) {
        throw new AppError('authorization_required', 'User authorization required for listing Base files', 401);
      }
      const payload = await listBases({ debug: req.query?.debug === '1', accessToken });
      sendJson(res, 200, payload);
    } catch (error) {
      sendError(res, 'base_list_failed', 'Base list failed', error);
    }
  });

  app.post('/api/base/resolve', async (req, res) => {
    try {
      const body = await readJsonBody(req);
      const baseUrl = `${body.baseUrl || ''}`.trim();
      const parsed = parseBaseUrl(baseUrl);
      if (!parsed.baseToken) {
        sendJson(res, 400, { code: 'invalid_base_url', error: 'Invalid baseUrl' });
        return;
      }

      const schema = await getSchema({
        baseToken: parsed.baseToken,
        tableId: parsed.tableId,
      });
      sendJson(res, 200, {
        baseToken: parsed.baseToken,
        tableId: schema.tableId,
        viewId: parsed.viewId,
        tables: schema.tables,
        fields: schema.fields,
      });
    } catch (error) {
      sendError(res, 'resolve_failed', 'Resolve failed', error);
    }
  });

  app.get('/api/base/schema', async (req, res) => {
    try {
      const baseToken = `${req.query.baseToken || ''}`.trim();
      const tableId = `${req.query.tableId || ''}`.trim();
      const schema = await getSchema({ baseToken, tableId });
      sendJson(res, 200, schema);
    } catch (error) {
      sendError(res, 'schema_failed', 'Schema failed', error);
    }
  });

  app.get('/api/base/records', async (req, res) => {
    try {
      const baseToken = `${req.query.baseToken || ''}`.trim();
      const tableId = `${req.query.tableId || ''}`.trim();
      const viewId = `${req.query.viewId || ''}`.trim();
      const records = await getRecords({ baseToken, tableId, viewId });
      sendJson(res, 200, records);
    } catch (error) {
      sendError(res, 'records_failed', 'Records failed', error);
    }
  });
};

module.exports = {
  attachBaseApiRoutes,
  listBases,
  getSchema,
  getRecords,
  parseBaseUrl,
};
