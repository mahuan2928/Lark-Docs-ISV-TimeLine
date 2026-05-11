const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

const createApiError = (code, message = code) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const toAbsoluteUrl = (apiBaseUrl, path) => {
  if (/^https?:\/\//.test(apiBaseUrl)) {
    return `${trimTrailingSlash(apiBaseUrl)}${path}`;
  }
  return new URL(path, window.location.origin).toString();
};

const extractJson = async (response) => {
  const contentType = response.headers.get('content-type') || '';
  const rawText = await response.text();
  const normalized = rawText.trim();

  if (!normalized) {
    throw createApiError('empty_response');
  }

  const looksLikeHtml =
    contentType.includes('text/html') ||
    normalized.startsWith('<!doctype html') ||
    normalized.startsWith('<html') ||
    normalized.startsWith('<');

  if (looksLikeHtml) {
    throw createApiError('html_response');
  }

  try {
    return JSON.parse(normalized);
  } catch (_error) {
    throw createApiError('invalid_json');
  }
};

const requestJson = async (apiBaseUrl, path, init) => {
  let response;
  try {
    response = await fetch(toAbsoluteUrl(apiBaseUrl, path), init);
  } catch (_error) {
    throw createApiError('network_error');
  }

  const json = await extractJson(response);
  if (!response.ok) {
    const errorCode = typeof json.code === 'string' ? json.code : `http_${response.status}`;
    const errorMessage = typeof json.error === 'string' ? json.error : errorCode;
    throw createApiError(errorCode, errorMessage);
  }
  return json;
};

export const resolveBase = async (apiBaseUrl, baseUrl) =>
  requestJson(apiBaseUrl, '/api/base/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ baseUrl }),
  });

export const fetchBaseList = async (apiBaseUrl) => requestJson(apiBaseUrl, '/api/base/list');

export const fetchBaseSchema = async (apiBaseUrl, params) => {
  const url = new URL(toAbsoluteUrl(apiBaseUrl, '/api/base/schema'));
  url.searchParams.set('baseToken', params.baseToken);
  if (params.tableId) {
    url.searchParams.set('tableId', params.tableId);
  }
  return requestJson('', url.toString());
};

export const fetchBaseRecords = async (apiBaseUrl, params) => {
  const url = new URL(toAbsoluteUrl(apiBaseUrl, '/api/base/records'));
  url.searchParams.set('baseToken', params.baseToken);
  url.searchParams.set('tableId', params.tableId);
  if (params.viewId) {
    url.searchParams.set('viewId', params.viewId);
  }
  return requestJson('', url.toString());
};
