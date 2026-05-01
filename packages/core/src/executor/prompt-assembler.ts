export interface BuildExecutionPromptInput {
  issueId: string;
  issueMarkdown: string;
}

export function buildExecutionPrompt(input: BuildExecutionPromptInput): string {
  return [
    `# ${input.issueId} execution prompt`,
    '',
    '## Engine Execution Contract',
    '',
    '- Use the issue markdown below as the source task description.',
    '- You must not mutate kanban lifecycle fields, status, run logs, or engine-owned runtime artifacts.',
    '- The engine owns checkpoint commit creation after your file changes are complete.',
    '- Make only the implementation changes needed for the issue.',
    '',
    '## Issue Markdown',
    '',
    input.issueMarkdown,
  ].join('\n');
}
