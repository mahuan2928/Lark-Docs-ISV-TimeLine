type JsonValue = Record<string, unknown>;

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const toAbsoluteUrl = (apiBaseUrl: string, path: string) => {
  if (/^https?:\/\//.test(apiBaseUrl)) {
    return `${trimTrailingSlash(apiBaseUrl)}${path}`;
  }
  return new URL(path, window.location.origin).toString();
};

const extractJson = async (response: Response) => {
  const contentType = response.headers.get('content-type') || '';
  const rawText = await response.text();
  const normalized = rawText.trim();

  if (!normalized) {
    throw new Error('empty_response');
  }

  const looksLikeHtml =
    contentType.includes('text/html') ||
    normalized.startsWith('<!doctype html') ||
    normalized.startsWith('<html') ||
    normalized.startsWith('<');

  if (looksLikeHtml) {
    throw new Error('html_response');
  }

  try {
    return JSON.parse(normalized) as JsonValue;
  } catch (_error) {
    throw new Error('invalid_json');
  }
};

const requestJson = async (
  apiBaseUrl: string,
  path: string,
  init?: RequestInit
) => {
  let response: Response;
  try {
    response = await fetch(toAbsoluteUrl(apiBaseUrl, path), init);
  } catch (_error) {
    throw new Error('network_error');
  }

  const json = await extractJson(response);
  if (!response.ok) {
    const errorMessage = typeof json.error === 'string' ? json.error : `http_${response.status}`;
    throw new Error(errorMessage);
  }
  return json;
};

export const resolveBase = async (apiBaseUrl: string, baseUrl: string) =>
  requestJson(apiBaseUrl, '/api/base/resolve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ baseUrl }),
  });

export const fetchBaseSchema = async (apiBaseUrl: string, params: { baseToken: string; tableId?: string }) => {
  const url = new URL(toAbsoluteUrl(apiBaseUrl, '/api/base/schema'));
  url.searchParams.set('baseToken', params.baseToken);
  if (params.tableId) {
    url.searchParams.set('tableId', params.tableId);
  }
  return requestJson('', url.toString());
};

export const fetchBaseRecords = async (
  apiBaseUrl: string,
  params: { baseToken: string; tableId: string; viewId?: string }
) => {
  const url = new URL(toAbsoluteUrl(apiBaseUrl, '/api/base/records'));
  url.searchParams.set('baseToken', params.baseToken);
  url.searchParams.set('tableId', params.tableId);
  if (params.viewId) {
    url.searchParams.set('viewId', params.viewId);
  }
  return requestJson('', url.toString());
};
