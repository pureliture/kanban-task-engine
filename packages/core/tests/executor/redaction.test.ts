import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../../src/executor/redaction';

describe('redactSecrets', () => {
  it('redacts OpenAI env assignment values from stdout', () => {
    const output = redactSecrets('stdout OPENAI_API_KEY=sk-proj-abc123');

    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('sk-proj-abc123');
  });

  it('redacts GitHub token-like values from stderr', () => {
    const output = redactSecrets('stderr token: ghp_abcdefghijklmnopqrstuvwxyz');

    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz');
  });

  it('redacts api-key flags and bare OpenAI keys in metadata strings', () => {
    const output = redactSecrets('metadata command --api-key=sk-flagsecret and sk-baresecret');

    expect(output).toContain('--api-key=[REDACTED]');
    expect(output).not.toContain('sk-flagsecret');
    expect(output).not.toContain('sk-baresecret');
  });

  it('redacts bearer tokens, JWTs, and generic secret assignments', () => {
    const bearer = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature';
    const env = 'ANTHROPIC_API_KEY=sk-ant-secret AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY CI_TOKEN=secret-token DB_PASSWORD=p4ss';
    const output = redactSecrets(`${bearer}\n${env}`);

    expect(output).toContain('Authorization: Bearer [REDACTED]');
    expect(output).toContain('ANTHROPIC_API_KEY=[REDACTED]');
    expect(output).toContain('AWS_SECRET_ACCESS_KEY=[REDACTED]');
    expect(output).toContain('CI_TOKEN=[REDACTED]');
    expect(output).toContain('DB_PASSWORD=[REDACTED]');
    expect(output).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(output).not.toContain('sk-ant-secret');
    expect(output).not.toContain('secret-token');
  });

  it('redacts common provider token forms', () => {
    const output = redactSecrets('github_pat_abcdefghijklmnopqrstuvwxyz1234567890 xoxb-123-456-secret AKIAABCDEFGHIJKLMNOP');

    expect(output).toBe('[REDACTED] [REDACTED] [REDACTED]');
  });

  it('redacts PEM private key blocks', () => {
    const output = redactSecrets([
      'before',
      '-----BEGIN PRIVATE KEY-----',
      'abc123',
      '-----END PRIVATE KEY-----',
      'after',
    ].join('\n'));

    expect(output).toContain('before');
    expect(output).toContain('[REDACTED]');
    expect(output).toContain('after');
    expect(output).not.toContain('abc123');
  });

  it('leaves normal output unchanged', () => {
    expect(redactSecrets('normal output')).toBe('normal output');
  });
});
