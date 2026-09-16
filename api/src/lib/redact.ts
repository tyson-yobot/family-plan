/**
 * Strips anything SHAPED like a credential out of free text.
 *
 * Lives in its own file rather than in server.ts because server.ts starts a
 * listener when it is imported, so anything needing this at module scope could
 * not have it.
 *
 * `redactPath` in server.ts only sees request paths, and the secret this was
 * written for never appears in one. A SimpleFIN access URL is of the form
 * https://<user>:<password>@bridge.../..., it lives in an environment
 * variable, and the way it escapes is an ERROR MESSAGE: fetch failures, DNS
 * failures and HTTP client errors all quote the URL they were given, and that
 * string then goes into a log line or, worse, into a reply.
 *
 * Shape-based for the same reason `redactPath` is: a list of the variables it
 * knows about would miss the next one somebody adds, and the failure of a list
 * is a leak nobody notices.
 *
 *   - Any URL carrying credentials before the @ loses them entirely.
 *   - Any remaining run of 20+ token characters is hidden.
 *
 * The second rule is blunt on purpose. It occasionally hides something dull,
 * which costs a slightly less readable log line, and that is the cheaper
 * mistake by a wide margin.
 */
export function redactSecrets(text: string): string {
  return (
    text
      /*
       * Everything between the scheme and the @ goes, whatever is in it.
       *
       * This used to be `[^\s/@]+:[^\s/@]+@`, which excluded the slash so that
       * it could not run past a path. That was backwards: a base64 or
       * percent-encoded password frequently CONTAINS a slash or a plus, and
       * such a password simply did not match, so the one credential this
       * function exists for was the one shape it could miss. If the remaining
       * segments were each under twenty characters the second rule did not
       * catch them either.
       *
       * It now takes everything from the scheme up to the FIRST @ in that URL,
       * whatever characters are in between, stopping at whitespace so it can
       * never run from one token into another. The cost is that a URL with an @
       * somewhere in its path loses a little more than it strictly needed to,
       * which is a far cheaper mistake than printing a password.
       */
      .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s]*?@/gi, '$1[redacted]@')
      .replace(/\b[A-Za-z0-9_-]{20,}\b/g, '[redacted]')
  );
}
