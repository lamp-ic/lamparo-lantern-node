'use strict';
const { handle } = require('./lantern.js');

/**
 * Next.js, App Router : dans app/lamparo/route.js —
 *   import { lantern } from '@lamparo/lantern/next';
 *   export const dynamic = 'force-dynamic';
 *   export const GET = lantern();
 *
 * @param {{root?: string}} [options]
 */
function lantern(options) {
  const root = options && options.root;
  return async function GET(request) {
    const url = new URL(request.url);
    const result = handle({ method: request.method, path: url.pathname, header: (name) => request.headers.get(name), root });
    return new Response(result.body, { status: result.status, headers: result.headers });
  };
}

module.exports = { lantern };
