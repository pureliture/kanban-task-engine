const REDACTED = '[REDACTED]';

export function redactSecrets(input: string): string {
  return input
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, REDACTED)
    .replace(/\bAuthorization:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Authorization: Bearer ${REDACTED}`)
    .replace(/\b[A-Za-z0-9_-]+_?(?:API_KEY|TOKEN|SECRET|PASSWORD|ACCESS_KEY)=("[^"]*"|'[^']*'|[^\s"'`]+)/gi, keyValue => {
      const separator = keyValue.indexOf('=');
      return `${keyValue.slice(0, separator + 1)}${REDACTED}`;
    })
    .replace(/\bOPENAI_API_KEY=[^\s"'`]+/g, `OPENAI_API_KEY=${REDACTED}`)
    .replace(/--api-key=[^\s"'`]+/g, `--api-key=${REDACTED}`)
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, REDACTED)
    .replace(/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, REDACTED)
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, REDACTED)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
    .replace(/\bsk-[A-Za-z0-9_-]+/g, REDACTED)
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, REDACTED);
}
