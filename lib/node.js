'use strict';
const { handle } = require('./lantern.js');

/**
 * Un gestionnaire (req, res) pour http.createServer, Express, Koa en mode brut ou Fastify (route « raw ») :
 *   app.get('/lamparo', lantern());
 *
 * @param {{root?: string}} [options]
 */
function lantern(options) {
  const root = options && options.root;
  return function (req, res) {
    const raw = typeof req.originalUrl === 'string' ? req.originalUrl : String(req.url || '/');
    const cut = raw.indexOf('?');
    const result = handle({
      method: String(req.method || ''),
      path: cut === -1 ? raw : raw.slice(0, cut),
      header: (name) => {
        const value = req.headers ? req.headers[name] : undefined;
        return Array.isArray(value) ? value[0] : value;
      },
      root,
    });
    res.writeHead(result.status, result.headers);
    res.end(result.body);
  };
}

module.exports = { lantern };
