import { createServer } from 'node:http';
import { parse as parseUrl } from 'node:url';

let _server = null;

export function startServer(port, host, corsConfig, callback) {
  return new Promise((resolve, reject) => {
    _server = createServer(async (nodeReq, nodeRes) => {
      try {
        // Parse request
        const parsed = parseUrl(nodeReq.url, true);
        const body = await readBody(nodeReq);

        const req = {
          method: nodeReq.method,
          path: parsed.pathname,
          headers: new Proxy(nodeReq.headers, { get: (obj, prop) => prop in obj ? obj[prop] : null }),
          body: body,
          query: new Proxy(parsed.query || {}, { get: (obj, prop) => prop in obj ? obj[prop] : null }),
          segments() {
            return this.path.split('/').filter(s => s !== '');
          },
          match(pattern) {
            return matchPath(this.path, pattern);
          }
        };

        // CORS preflight
        if (corsConfig && nodeReq.method === 'OPTIONS') {
          nodeRes.writeHead(204, corsHeaders(corsConfig));
          nodeRes.end();
          return;
        }

        // Call user callback
        let res;
        try {
          res = await callback(req);
        } catch (err) {
          console.error(err);
          res = { status: 500, body: { message: 'Internal Server Error' }, headers: {} };
        }

        if (!res || typeof res.status !== 'number') {
          res = { status: 500, body: { message: 'Handler must return a response object' }, headers: {} };
        }

        // Serialize response
        const resHeaders = { ...(res.headers || {}) };

        // CORS headers on all responses
        if (corsConfig) {
          Object.assign(resHeaders, corsHeaders(corsConfig));
        }

        if (res.body === null || res.body === undefined) {
          nodeRes.writeHead(res.status, resHeaders);
          nodeRes.end();
        } else if (Buffer.isBuffer(res.body)) {
          nodeRes.writeHead(res.status, resHeaders);
          nodeRes.end(res.body);
        } else if (typeof res.body === 'string') {
          resHeaders['Content-Type'] = resHeaders['Content-Type'] || 'text/plain';
          nodeRes.writeHead(res.status, resHeaders);
          nodeRes.end(res.body);
        } else {
          resHeaders['Content-Type'] = 'application/json';
          nodeRes.writeHead(res.status, resHeaders);
          nodeRes.end(JSON.stringify(res.body));
        }
      } catch (err) {
        console.error('Server error:', err);
        nodeRes.writeHead(500, { 'Content-Type': 'application/json' });
        nodeRes.end(JSON.stringify({ message: 'Internal Server Error' }));
      }
    });

    _server.listen(port, host, () => {
      console.log(`Server listening on ${host}:${port}`);
      resolve();
    });

    _server.on('error', reject);
  });
}

export function stopServer() {
  return new Promise((resolve) => {
    if (_server) {
      _server.close(() => resolve());
    } else {
      resolve();
    }
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      resolve(null);
      return;
    }
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => {
      if (!data) { resolve(null); return; }
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('application/json')) {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      } else {
        resolve(data);
      }
    });
    req.on('error', () => resolve(null));
  });
}

function matchPath(actualPath, pattern) {
  const actualParts = actualPath.split('/').filter(s => s !== '');
  const patternParts = pattern.split('/').filter(s => s !== '');

  if (actualParts.length !== patternParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = actualParts[i];
    } else if (patternParts[i] !== actualParts[i]) {
      return null;
    }
  }
  return params;
}

function corsHeaders(config) {
  return {
    'Access-Control-Allow-Origin': config.origin || '*',
    'Access-Control-Allow-Methods': config.methods || 'GET, POST, PUT, DELETE',
    'Access-Control-Allow-Headers': config.headers || 'Content-Type, Authorization',
  };
}
