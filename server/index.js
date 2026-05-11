const http = require('http');
const { URL } = require('url');
const { attachBaseApiRoutes } = require('./base-service');

const routes = [];

const createApp = () => {
  const app = {
    get(path, handler) {
      routes.push({ method: 'GET', path, handler });
    },
    post(path, handler) {
      routes.push({ method: 'POST', path, handler });
    },
  };

  app.get('/api/health', async (_req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true, service: 'timeline-api' }));
  });

  attachBaseApiRoutes(app);

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    req.query = Object.fromEntries(parsed.searchParams.entries());

    const matched = routes.find((route) => route.method === req.method && route.path === parsed.pathname);
    if (!matched) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    try {
      await matched.handler(req, res);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }));
    }
  });

  return server;
};

const port = Number(process.env.PORT || process.env.TIMELINE_API_PORT || 8787);

createApp().listen(port, () => {
  console.log(`timeline api server listening on port ${port}`);
});
