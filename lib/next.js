'use strict';
const { lantern } = require('./fetch.js');

/**
 * Next.js, App Router : dans app/lamparo/route.js —
 *   import { lantern } from '@lamparo/lantern/next';
 *   export const dynamic = 'force-dynamic';
 *   export const GET = lantern();
 * Un gestionnaire de route Next.js reçoit une Request du standard fetch : c'est l'entrée fetch, sous son nom.
 */
module.exports = { lantern };
