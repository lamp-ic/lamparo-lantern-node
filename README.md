# @lamparo/lantern

The lantern for Node: a read-only, signed route that tells [lamparo](https://lamparo.app) what the site knows
about itself — the Node version and the direct dependencies with their installed versions. Zero dependency,
Node 18.18 or later. Same protocol as the PHP lantern (`lamparo/lantern`).

It never writes, never executes anything dynamic, collects a closed list of facts, and answers a bare `404` to
any request that is not signed with the site's key. Without a key it stays silent: a staging copy never talks.

## Install

```sh
npm install @lamparo/lantern
```

## Next.js (App Router)

`app/lamparo/route.js`:

```js
import { lantern } from '@lamparo/lantern/next';

export const dynamic = 'force-dynamic';
export const GET = lantern();
```

## Nuxt (server route)

`server/routes/lamparo.js`:

```js
import { lantern } from '@lamparo/lantern/node';

const handler = lantern();
export default defineEventHandler((event) => handler(event.node.req, event.node.res));
```

## Astro, SvelteKit, Remix / React Router, Hono — anything that speaks fetch

Astro, `src/pages/lamparo.ts` (server output, `prerender = false`); SvelteKit, `src/routes/lamparo/+server.js`;
Remix, `app/routes/lamparo.ts` (as `loader`):

```js
import { lantern } from '@lamparo/lantern/fetch';

const handler = lantern();
export const GET = ({ request }) => handler(request);
```

## Strapi

`src/api/lamparo/routes/lamparo.js` and its controller — the raw Koa request and response are handed to the
node adapter:

```js
// routes/lamparo.js
module.exports = { routes: [{ method: 'GET', path: '/lamparo', handler: 'lamparo.read', config: { auth: false, prefix: '' } }] };

// controllers/lamparo.js
const { lantern } = require('@lamparo/lantern/node');
const handler = lantern();
module.exports = { read: (ctx) => { ctx.respond = false; handler(ctx.req, ctx.res); } };
```

## Directus

An endpoint extension named `lamparo` (it answers at `/lamparo`):

```js
const { lantern } = require('@lamparo/lantern/node');

module.exports = (router) => { router.get('/', lantern()); };
```

## Express, or plain `http`

```js
const { lantern } = require('@lamparo/lantern/node');

app.get('/lamparo', lantern());
```

The route must answer at `https://your-site/lamparo`. Give it the site's key from lamparo, as an environment
variable named after the key — never in the code, never in git:

```
LAMPARO_KEY_09887C4F=k_09887c4f:…
```

On Vercel: Settings → Environment Variables, production only. In Docker, PM2 or systemd: the service's
environment. With a `.env.production` file: keep it out of git.

## What it reads

An npm alias (`compat-react: npm:react@18`) is reported under its real name (`react`), with the local name as `alias`: the registry and the advisories know the real one.

- `runtime`: `node`, its version, `NODE_ENV`, the OS family;
- `packages`: the `dependencies` of `package.json` (never `devDependencies`), each with the version installed in
  the nearest `node_modules`, or `null` with the declared range when it is not on disk.

Nothing else: no configuration, no environment, no data. The whole code is in `lib/lantern.js`, short enough to
read before you add it.

## Licence

MIT — lamp (lamp-ic.fr).
