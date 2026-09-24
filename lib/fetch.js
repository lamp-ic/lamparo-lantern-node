'use strict';
const { handle } = require('./lantern.js');

/**
 * Tout ce qui parle en Request et Response du standard fetch : Astro (src/pages/lamparo.ts), SvelteKit
 * (src/routes/lamparo/+server.js), Remix et React Router (app/routes/lamparo.ts), Hono, Bun, Deno —
 *   import { lantern } from '@lamparo/lantern/fetch';
 *   const handler = lantern();
 *   export const GET = ({ request }) => handler(request);
 *
 * @param {{root?: string}} [options]
 */
function lantern(options) {
  const root = options && options.root;
  return async function (request) {
    const url = new URL(request.url);
    const result = handle({ method: request.method, path: url.pathname, header: (name) => request.headers.get(name), root });
    return new Response(result.body, { status: result.status, headers: result.headers });
  };
}

module.exports = { lantern };
