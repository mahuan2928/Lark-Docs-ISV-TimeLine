const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const cwd = process.cwd();

class AppError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const findNvmCliCandidates = () => {
  const home = process.env.HOME;
  if (!home) return [];
  const versionsDir = path.join(home, '.nvm', 'versions', 'node');
  if (!fs.existsSync(versionsDir)) return [];

  return fs
    .readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(versionsDir, entry.name, 'bin', 'lark-cli'))
    .filter((candidate) => fs.existsSync(candidate))
    .sort()
    .reverse();
};

const LARK_CLI_CANDIDATES = [
  process.env.LARK_CLI_BIN,
  '/opt/homebrew/bin/lark-cli',
  '/opt/homebrew/Cellar/node@22/22.22.2_2/bin/lark-cli',
  ...findNvmCliCandidates(),
  'lark-cli',
].filter(Boolean);

const execLarkCli = (args) =>
  new Promise((resolve, reject) => {
    const tryAt = (idx) => {
      if (idx >= LARK_CLI_CANDIDATES.length) {
        reject(new AppError('service_unavailable', 'lark-cli is not available. Set LARK_CLI_BIN if needed.', 503));
        return;
      }

      execFile(LARK_CLI_CANDIDATES[idx], args, { cwd, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error && error.code === 'ENOENT') {
          tryAt(idx + 1);
          return;
        }
        if (error) {
          const message = stderr || stdout || error.message;
          reject(classifyCliError(message));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (_parseError) {
          reject(new AppError('service_unavailable', `lark-cli returned invalid JSON: ${stdout}`, 502));
        }
      });
    };

    tryAt(0);
  });

const classifyCliError = (message) => {
  const normalized = `${message || ''}`.toLowerCase();
  if (normalized.includes('need_user_authorization') || normalized.includes('no_token')) {
    return new AppError('authorization_required', message, 401);
  }
  if (normalized.includes('permission denied') || normalized.includes('forbidden') || normalized.includes('permission_violations')) {
    return new AppError('permission_denied', message, 403);
  }
  if (normalized.includes('not found') || normalized.includes('404') || normalized.includes('invalid base') || normalized.includes('base not found')) {
    return new AppError('base_not_found', message, 404);
  }
  if (normalized.includes('invalid param') || normalized.includes('missing basetoken') || normalized.includes('missing basetoken or tableid')) {
    return new AppError('invalid_request', message, 400);
  }
  return new AppError('service_unavailable', message, 502);
};

const toPlainRecords = (recordPayload) => {
  const rows = recordPayload?.data?.data || [];
  const recordIds = recordPayload?.data?.record_id_list || [];
  const fields = recordPayload?.data?.fields || [];

  return rows.map((row, index) => {
    const mappedFields = {};
    fields.forEach((fieldName, fieldIndex) => {
      mappedFields[fieldName] = row[fieldIndex];
    });
    return {
      record_id: recordIds[index],
      fields: mappedFields,
    };
  });
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

const getSchema = async ({ baseToken, tableId }) => {
  if (!baseToken) {
    throw new AppError('invalid_request', 'Missing baseToken', 400);
  }

  const tablePayload = await execLarkCli([
    'base',
    '+table-list',
    '--as',
    'user',
    '--base-token',
    baseToken,
    '--offset',
    '0',
    '--limit',
    '100',
  ]);
  const tables = tablePayload?.data?.tables || [];
  if (!tables.length) {
    throw new AppError('no_tables', 'No tables found in this Base', 404);
  }

  let effectiveTableId = tableId || tables?.[0]?.id || '';
  let fields = [];
  if (effectiveTableId) {
    const fieldPayload = await execLarkCli([
      'base',
      '+field-list',
      '--as',
      'user',
      '--base-token',
      baseToken,
      '--table-id',
      effectiveTableId,
      '--offset',
      '0',
      '--limit',
      '200',
    ]);
    fields = fieldPayload?.data?.fields || [];
  }

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

  let offset = 0;
  const limit = 200;
  const records = [];
  let hasMore = true;

  while (hasMore) {
    const args = [
      'base',
      '+record-list',
      '--as',
      'user',
      '--base-token',
      baseToken,
      '--table-id',
      tableId,
      '--offset',
      `${offset}`,
      '--limit',
      `${limit}`,
    ];
    if (viewId) {
      args.push('--view-id', viewId);
    }

    const recordPayload = await execLarkCli(args);
    const pageRecords = toPlainRecords(recordPayload);
    records.push(...pageRecords);
    hasMore = Boolean(recordPayload?.data?.has_more);
    if (hasMore && pageRecords.length === 0) {
      throw new AppError('service_unavailable', 'Unexpected pagination state: has_more=true but page has no records', 502);
    }
    offset += limit;
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
  getSchema,
  getRecords,
  parseBaseUrl,
};
