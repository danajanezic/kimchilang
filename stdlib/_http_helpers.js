// JS helpers for http.km — functions that require JS-specific constructs
// These are extern'd from http.km and will be removed when js {} is dropped

export function httpRequest(url, method, headers, body, timeout) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const lib = isHttps ? require('https') : require('http');

    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: headers,
      timeout: timeout,
    };

    const req = lib.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsedBody = data;
        const contentType = res.headers['content-type'] || '';
        if (contentType.includes('application/json')) {
          try {
            parsedBody = JSON.parse(data);
          } catch (e) {
            // Keep as string if JSON parse fails
          }
        }
        resolve({
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          body: parsedBody,
          ok: res.statusCode >= 200 && res.statusCode < 300,
        });
      });
    });

    req.on('error', (e) => reject(e));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      req.write(bodyStr);
    }

    req.end();
  });
}
