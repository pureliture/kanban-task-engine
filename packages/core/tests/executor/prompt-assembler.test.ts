import { describe, expect, it } from 'vitest';
import { buildExecutionPrompt } from '../../src/executor/prompt-assembler';

describe('buildExecutionPrompt', () => {
  it('includes raw issue markdown unchanged in prompt content', () => {
    const issueMarkdown = `---
id: VC-001
status: READY
---

## 목적

Use the raw issue markdown exactly.

## Acceptance Criteria

- [ ] Keep spacing
`;

    const prompt = buildExecutionPrompt({
      issueId: 'VC-001',
      issueMarkdown,
    });

    expect(prompt).toContain(issueMarkdown);
  });

  it('includes the Engine Execution Contract for lifecycle mutation and checkpoint commit ownership', () => {
    const prompt = buildExecutionPrompt({
      issueId: 'VC-001',
      issueMarkdown: '# issue markdown\n',
    });

    expect(prompt).toContain('Engine Execution Contract');
    expect(prompt).toMatch(/must not mutate.*kanban lifecycle|kanban lifecycle.*must not mutate/i);
    expect(prompt).toMatch(/status/i);
    expect(prompt).toMatch(/logs/i);
    expect(prompt).toMatch(/engine owns.*checkpoint commit|checkpoint commit.*engine owns/i);
  });
});
