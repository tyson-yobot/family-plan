import cors from '@fastify/cors';
import Fastify from 'fastify';
import { buildInfo } from './lib/build-info.js';
import { redactSecrets } from './lib/redact.js';
import { syncBank } from './lib/money.js';
import { simplefinConfigured } from './lib/simplefin.js';
import { registerBoardRoutes } from './routes/board.js';
import { registerFamilyRoutes } from './routes/family.js';
import { registerMoneyRoutes } from './routes/money.js';
import { registerSpaceRoutes } from './routes/space.js';

/**
 * Keeps secrets out of THIS service's log lines.
 *
 * Fastify logs every request path by default, which on Railway would put every
 * permanent link into the log stream. Two kinds of secret travel through here
 * now rather than one:
 *
 *   - Link tokens, in the path, redacted below.
 *   - Codes and session tokens, which never appear in a path at all. A code is
 *     always a JSON body on a POST and a session token is always an
 *     Authorization header, and this logger is configured to serialise neither.
 *     That is the reason the request serialiser below returns exactly two
 *     fields rather than letting Fastify's default one through: the default
 *     carries headers, and the Authorization header is a live session.
 *
 * It is worth being exact about what this does not cover: the page the family
 * opens is served by Vercel, and its access log records the path in full.
 * Nothing in this repository can redact that. This guard is about Railway.
 */
function redactPath(url: string): string {
  /*
   * Redacts by SHAPE, not by route.
   *
   * The first version of this named the routes it knew about, and the first
   * thing that got through it was a route this release had deleted: an old
   * bookmark asking for /api/form/<token> put a live token straight into the
   * Railway log stream, because that address is not in the list any more and
   * nobody thinks to redact a route that no longer exists. Found by making the
   * request and reading the log line back, not by reading this file.
   *
   * So anything that looks like one of our tokens is hidden wherever it turns
   * up. A slug is short and survives, which is what makes a log line still
   * worth reading. A goal id is long and gets hidden too; it is not a secret,
   * but nothing here needs it and the rule is worth more than the id.
   */
  const [path, query] = url.split('?');
  const redacted = path
    .split('/')
    .map((segment) => (/^[A-Za-z0-9_-]{20,}$/.test(segment) ? '[redacted]' : segment))
    .join('/');
  // A query string could carry anything and nothing here reads one, so it is
  // never logged at all rather than being picked over.
  return query === undefined ? redacted : `${redacted}?[redacted]`;
}

const app = Fastify({
  logger: {
    serializers: {
      req(request) {
        return { method: request.method, url: redactPath(request.url) };
      },
      /*
       * Error messages go through the scrubber before they are logged.
       * Fastify's default error serialiser prints the message and the stack as
       * they are, and a message quoting an access URL is exactly how the
       * SimpleFIN secret would reach the log stream.
       */
      err(error: Error & { statusCode?: number }) {
        return {
          type: error.name,
          message: redactSecrets(error.message ?? ''),
          statusCode: error.statusCode,
          stack: redactSecrets(error.stack ?? ''),
        };
      },
    },
  },
});

/**
 * One reply for every unhandled error, and it never quotes the error.
 *
 * Fastify's default sends `error.message` to the caller on a 500. That is a
 * client payload, so an upstream client error quoting an access URL would put
 * the SimpleFIN secret on somebody's phone. The log keeps the scrubbed detail;
 * the reply says nothing at all about what went wrong internally.
 */
app.setErrorHandler(async (error: Error & { statusCode?: number }, request, reply) => {
  request.log.error({ err: error }, 'request failed');
  const status = error.statusCode ?? 500;
  if (status >= 400 && status < 500) {
    return reply.code(status).send({ error: redactSecrets(error.message ?? 'That did not work.') });
  }
  return reply.code(500).send({ error: 'Something went wrong at our end. Try again in a moment.' });
});

const allowedOrigins = (process.env.WEB_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin !== '');

if (allowedOrigins.length === 0) {
  throw new Error(
    'WEB_ORIGIN is not set. It must list the exact site origins allowed to call this API. ' +
      'A wildcard is not acceptable here: the URLs carry private access tokens.',
  );
}
if (allowedOrigins.includes('*')) {
  throw new Error('WEB_ORIGIN must name exact origins. "*" is not allowed.');
}

await app.register(cors, {
  origin: allowedOrigins,
  methods: ['GET', 'PUT', 'POST', 'PATCH'],
  /*
   * `x-money-session` has to be named here or the money area cannot work at
   * all from a browser.
   *
   * The money gate deliberately uses its own header rather than Authorization,
   * so that an ordinary month-long session can never open the bank. The cost of
   * that choice is this line: a custom request header is not on the CORS safe
   * list, so the browser sends a preflight and refuses the real request unless
   * the server names the header. Without it every money request fails as an
   * opaque "Failed to fetch" with no status and no error body.
   *
   * It was missing when the money area first shipped, and no server-side test
   * caught it: requests made from Node have no CORS at all, so the whole suite
   * passed while the feature was unusable on a phone. It was found by opening
   * the screen in a real browser.
   */
  allowedHeaders: ['content-type', 'authorization', 'x-money-session'],
});

/**
 * A not-found reply that does not repeat the address back.
 *
 * Fastify's own 404 handler writes "Route GET:/api/form/<token> not found"
 * into both the reply and the log, and neither goes through the serialiser
 * above, so the redaction there does not reach it. That was found by making the
 * request and then reading the log line, not by reading this file: the guard
 * looked complete and was not.
 *
 * It matters because the addresses that reach it are exactly the ones carrying
 * a token. Every old link in the house points at a route this release removed,
 * so the first thing a phone with a stale bookmark does is put a live token
 * into Railway's log stream.
 */
app.setNotFoundHandler(async (_request, reply) => {
  return reply.code(404).send({ error: 'There is nothing at that address.' });
});

app.get('/api/version', async () => buildInfo);

// The family board, behind the one link the whole house shares. Names, a
// status and a date. It reads nobody's answers.
registerBoardRoutes(app);

// Everybody's own space, behind their own code. Every route in here proves the
// caller is the person it is about before it answers.
registerSpaceRoutes(app);

// The money area. Adults only, behind a SECOND and longer passphrase, and
// read-only for ever. A child's session gets a plain not-found from every
// route in there. See routes/money.ts for both gates.
registerMoneyRoutes(app);

// What the five of them can see of each other: goals, and nothing else. Behind
// a code, because "shared with all five" is not "readable by whoever holds the
// link". See routes/family.ts for the line between shared and private.
registerFamilyRoutes(app);

/**
 * The bank feed is pulled on a SCHEDULE, never on a page load.
 *
 * Opening the money screen reads the summary table and nothing else, so the
 * screen is fast, a refresh costs nothing, and a bank that is slow or down
 * cannot hold a request open. The cost of that choice is that figures have an
 * age, so the view carries its own freshness and says plainly when it is stale.
 *
 * Four times a day. Often enough that the month-to-date figure is never
 * meaningfully behind, rare enough to be a considerate client of a service
 * Tyson pays for per-use.
 *
 * `unref()` matters: without it this timer holds the process open and a deploy
 * that should exit cleanly hangs until Railway kills it.
 */
const SYNC_EVERY_MS = 6 * 60 * 60 * 1000;

if (simplefinConfigured()) {
  // Not at the instant of boot. A deploy restarts the process, and pulling on
  // every restart would hammer the feed during a run of deploys.
  const first = setTimeout(() => {
    void syncBank().catch(() => {});
  }, 60_000);
  first.unref();

  const repeating = setInterval(() => {
    void syncBank().catch(() => {});
  }, SYNC_EVERY_MS);
  repeating.unref();

  app.log.info('bank feed configured; scheduled pull every 6 hours');
} else {
  // Said out loud rather than failing silently, so "the money screen is empty"
  // has an answer in the log rather than being a mystery.
  app.log.info('bank feed not configured; money screens will say so');
}

const port = Number(process.env.PORT ?? 8080);
await app.listen({ port, host: '0.0.0.0' });
