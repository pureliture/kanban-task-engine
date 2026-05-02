import { describe, expect, it } from 'vitest';
import { getRegistrySpace, listRegistrySpaces, parseRegistryYaml } from '../src/store/registry';

const REGISTRY = `
spaces:
  openclaw:
    type: single
    idPrefix: OC
    issues: issues/openclaw
    epics: issues/openclaw/_epics
    board: boards/openclaw.md
    epicBoard: boards/openclaw-epics.md
  vibe-coding:
    type: container
    idPrefix: VC
    issues: issues/vibe-coding
    epics: issues/vibe-coding/_epics
    board: boards/vibe-coding.md
    epicBoard: boards/vibe-coding-epics.md
    projects:
      kanban-task-engine:
        path: issues/vibe-coding/kanban-task-engine
`;

describe('registry', () => {
  it('parses the current registry shape', () => {
    const registry = parseRegistryYaml(REGISTRY);

    expect(listRegistrySpaces(registry)).toEqual(['openclaw', 'vibe-coding']);
    expect(getRegistrySpace(registry, 'openclaw')).toMatchObject({
      type: 'single',
      idPrefix: 'OC',
      epics: 'issues/openclaw/_epics',
      epicBoard: 'boards/openclaw-epics.md',
    });
    expect(getRegistrySpace(registry, 'vibe-coding').projects).toEqual({
      'kanban-task-engine': { path: 'issues/vibe-coding/kanban-task-engine' },
    });
  });

  it('rejects legacy workspace path registry fields', () => {
    expect(() => parseRegistryYaml(`
spaces:
  openclaw:
    type: single
    workspace_path: old/path
`)).toThrow('legacy workspace path');
  });

  it('requires idPrefix and epic paths', () => {
    expect(() => parseRegistryYaml(`
spaces:
  openclaw:
    type: single
    issues: issues/openclaw
    board: boards/openclaw.md
`)).toThrow('idPrefix');
  });

  it('rejects unsafe absolute paths', () => {
    expect(() => parseRegistryYaml(`
spaces:
  openclaw:
    type: single
    idPrefix: OC
    issues: /tmp/openclaw
    epics: issues/openclaw/_epics
    board: boards/openclaw.md
    epicBoard: boards/openclaw-epics.md
`)).toThrow('relative safe path');
  });
});
