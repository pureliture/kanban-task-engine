export interface RenderDataviewIndexOptions {
  space: string;
  generatedAt: string;
  issueRoot: string;
  epicRoot: string;
}

const WARNING = '<!-- GENERATED PROJECTION by kanban-task-engine. issues/**/*.md are source of truth. This Dataview index is read-only from the engine perspective. -->';

export function renderDataviewIndexMarkdown(options: RenderDataviewIndexOptions): string {
  return `${[
    WARNING,
    '',
    `# ${options.space} Index`,
    '',
    `Generated: ${options.generatedAt}`,
    '',
    '## Issues',
    '',
    '```dataview',
    'TABLE status, priority, project, epic, updated',
    `FROM "${options.issueRoot}"`,
    'WHERE type != "epic"',
    'SORT status ASC, priority ASC, updated DESC',
    '```',
    '',
    '## Epics',
    '',
    '```dataview',
    'TABLE status, priority, updated',
    `FROM "${options.epicRoot}"`,
    'WHERE type = "epic"',
    'SORT updated DESC',
    '```',
  ].join('\n').trimEnd()}\n`;
}
