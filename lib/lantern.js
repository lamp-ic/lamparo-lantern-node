'use strict';
/**
 * lamparo — la lanterne, pour Node
 * ---------------------------------------------------------------------------
 * Une route en lecture seule, signée, qui dit à lamparo ce que le site sait de lui-même : la version de Node et ses
 * dépendances directes, avec leurs versions installées. Aucune dépendance. Même protocole que la lanterne PHP.
 *
 * LA CLÉ N'EST PAS DANS LE CODE. Elle vient de l'environnement, dans une variable nommée d'après la clé —
 * LAMPARO_KEY_09887C4F pour la clé k_09887c4f, valeur « identifiant:secret » — chez l'hébergeur (Vercel, Docker,
 * PM2, systemd) ou dans le .env de production. Sans clé, la lanterne répond 404 : une préproduction ne parle jamais.
 *
 * PRINCIPES NON NÉGOCIABLES (CLAUDE.md §2) :
 *   1. LECTURE SEULE ABSOLUE — n'écrit jamais, ne modifie jamais rien.
 *   2. AUCUNE EXÉCUTION DYNAMIQUE — aucun require dont le chemin vient d'une entrée, rien d'évalué.
 *   3. LISTE BLANCHE — ne collecte que les faits énumérés dans collect().
 *   4. MUETTE SANS SIGNATURE — toute requête invalide reçoit un 404 vide.
 *
 * @license MIT — lamp (lamp-ic.fr). Publiée sur npm : npm install @lamparo/lantern
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const LANTERN_VERSION = '0.1.0';
/** Tolérance d'horloge, en secondes. */
const MAX_SKEW = 300;
/** Plus de clés que ça, ce n'est plus un site partagé : c'est une erreur de configuration. */
const MAX_KEYS = 10;
/** Les dépendances directes d'une application se comptent en dizaines ; au-delà, on coupe et on le dit. */
const MAX_PACKAGES = 500;
/** Un package.json pèse quelques kilo-octets. Au-delà d'un méga-octet, on ne le lit pas : la lanterne tourne chez le client. */
const MAX_MANIFEST_BYTES = 1048576;
/** Combien de dossiers on remonte pour trouver un node_modules (espaces de travail, sorties « standalone »). */
const MAX_DEPTH = 4;

const KEY_NAME = /^LAMPARO_KEY(_[A-Za-z0-9]+)?$/;
const KEY_VALUE = /^\s*([A-Za-z0-9_]{4,32}):([A-Za-z0-9]{32,128})\s*$/;
const NONCE = /^[A-Za-z0-9]{8,64}$/;
/** Un nom de paquet npm, éventuellement à portée. Rien d'autre ne devient jamais un morceau de chemin. */
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]{0,213}\/)?[a-z0-9][a-z0-9._-]{0,213}$/;

// ---------------------------------------------------------------------------
// Les clés : l'environnement, jamais le code. Une variable par compte lamparo qui surveille le site.
// ---------------------------------------------------------------------------

/** @returns {Array<{id: string, secret: string}>} */
function loadKeys(env) {
  const keys = [];
  const seen = new Set();
  for (const name of Object.keys(env).sort()) {
    const value = env[name];
    if (typeof value !== 'string' || !KEY_NAME.test(name)) continue;
    const match = KEY_VALUE.exec(value);
    if (match === null || seen.has(match[1])) continue;
    seen.add(match[1]);
    keys.push({ id: match[1], secret: match[2] });
    if (keys.length >= MAX_KEYS) break;
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Authentification HMAC — chaîne canonique (séparateur \n) : GET \n {path} \n {key_id} \n {timestamp} \n {nonce}
// ---------------------------------------------------------------------------

function hmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}

/** Comparaison à temps constant ; deux longueurs différentes ne sont jamais égales. */
function safeEqual(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** La clé que la requête porte, si sa signature tient ; null sinon. */
function authenticate(keys, request, now) {
  if (request.method !== 'GET') return null;
  const keyId = request.header('x-lamparo-key-id');
  const timestamp = request.header('x-lamparo-timestamp');
  const nonce = request.header('x-lamparo-nonce');
  const signature = request.header('x-lamparo-signature');
  if (!keyId || !timestamp || !nonce || !signature) return null;
  const key = keys.find((candidate) => candidate.id === keyId);
  if (key === undefined) return null;
  if (!/^[0-9]{1,12}$/.test(timestamp)) return null;
  if (Math.abs(now - Number(timestamp)) > MAX_SKEW) return null;
  if (!NONCE.test(nonce)) return null;
  const canonical = ['GET', request.path, keyId, timestamp, nonce].join('\n');
  return safeEqual(hmac(key.secret, canonical), String(signature).toLowerCase()) ? key : null;
}

// ---------------------------------------------------------------------------
// La collecte : une liste blanche, rien d'autre.
// ---------------------------------------------------------------------------

/** @param {string} root la racine de l'application (là où vit package.json) @param {Array} errors */
function collect(root, errors) {
  return {
    runtime: {
      name: 'node',
      version: process.versions.node,
      env: typeof process.env.NODE_ENV === 'string' ? process.env.NODE_ENV : null,
      os: process.platform,
    },
    packages: readPackages(root, errors),
  };
}

/**
 * Les dépendances directes déclarées, avec leur version installée. Un package.json absent est une erreur, pas un
 * silence : une application Node en a toujours un, et son absence veut dire que la racine est fausse.
 */
function readPackages(root, errors) {
  const file = path.join(root, 'package.json');
  let size;
  try {
    size = fs.statSync(file).size;
  } catch {
    errors.push({ scope: 'packages', reason: 'package.json not found' });
    return [];
  }
  if (size > MAX_MANIFEST_BYTES) {
    errors.push({ scope: 'packages', reason: 'package.json too large' });
    return [];
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    errors.push({ scope: 'packages', reason: 'package.json unreadable' });
    return [];
  }
  const declared = manifest && typeof manifest.dependencies === 'object' && manifest.dependencies !== null ? manifest.dependencies : {};
  const names = Object.keys(declared).filter((name) => PACKAGE_NAME.test(name)).sort();
  if (names.length > MAX_PACKAGES) {
    errors.push({ scope: 'packages', reason: 'packages truncated' });
  }
  return names.slice(0, MAX_PACKAGES).map((name) => ({
    name,
    version: installedVersion(root, name),
    declared: typeof declared[name] === 'string' ? declared[name] : null,
  }));
}

/** La version installée d'un paquet : son package.json dans le node_modules le plus proche, en remontant un peu. */
function installedVersion(root, name) {
  let dir = root;
  for (let depth = 0; depth <= MAX_DEPTH; depth++) {
    const file = path.join(dir, 'node_modules', ...name.split('/'), 'package.json');
    try {
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (manifest && typeof manifest.version === 'string') return manifest.version;
    } catch {
      // pas là : on remonte
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Entrée
// ---------------------------------------------------------------------------

/** Réponse indistinguable d'une route inexistante : on ne confirme jamais l'existence de la lanterne. */
function notFound() {
  return { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' }, body: '' };
}

/** La réponse est signée avec le même secret : la plateforme sait que c'est bien la lanterne qui parle. */
function respond(payload, secret) {
  const body = JSON.stringify(payload);
  return {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      'x-lamparo-signature': hmac(secret, body),
    },
    body,
  };
}

/**
 * Traite une requête décrite de façon neutre et rend une réponse neutre ; les adaptateurs (next, node) font le reste.
 *
 * @param {{method: string, path: string, header: (name: string) => string|null|undefined, root?: string, env?: object, now?: number}} request
 * @returns {{status: number, headers: Record<string, string>, body: string}}
 */
function handle(request) {
  const key = authenticate(loadKeys(request.env || process.env), request, request.now || Math.floor(Date.now() / 1000));
  if (key === null) return notFound();
  const errors = [];
  const facts = collect(request.root || process.cwd(), errors);
  return respond({ probe_version: LANTERN_VERSION, key_id: key.id, collected_at: new Date().toISOString(), facts, errors }, key.secret);
}

module.exports = { LANTERN_VERSION, handle, collect, loadKeys };
