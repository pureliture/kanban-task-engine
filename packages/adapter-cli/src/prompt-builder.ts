import { CanonicalTaskModel, StateTransition } from '@kanban-task-engine/core';

export interface PromptOptions {
  includeContext?: boolean;
  maxDescriptionLength?: number;
}

export function buildExecutionPrompt(
  task: CanonicalTaskModel,
  transition: StateTransition,
  options?: PromptOptions
): string {
  const opts = {
    includeContext: true,
    maxDescriptionLength: 500,
    ...options,
  };

  const parts: string[] = [];

  parts.push(`# Task: ${task.summary}`);
  parts.push('');
  parts.push(`## Status Transition`);
  parts.push(`From: ${transition.from} → To: ${transition.to}`);
  parts.push('');

  if (opts.includeContext) {
    parts.push('## Task Details');
    parts.push(`- ID: ${task.task_ref.external_id}`);
    parts.push(`- Type: ${task.classification.issue_type}`);
    parts.push(`- Priority: ${task.classification.priority}`);
    if (task.classification.labels.length > 0) {
      parts.push(`- Labels: ${task.classification.labels.join(', ')}`);
    }
    if (task.ownership.assignee) {
      parts.push(`- Assignee: ${task.ownership.assignee}`);
    }
    if (task.planning.sprint) {
      parts.push(`- Sprint: ${task.planning.sprint}`);
    }
    if (task.planning.estimate?.story_points) {
      parts.push(`- Story Points: ${task.planning.estimate.story_points}`);
    }
    parts.push('');
  }

  parts.push('## Instructions');
  parts.push(getTransitionInstructions(transition));
  parts.push('');

  if (task.automation.on_enter.includes(transition.to)) {
    parts.push('## Automation Policy');
    parts.push(`Policy: ${task.automation.policy_id}`);
    parts.push(`Profile: ${task.automation.execution_profile}`);
    if (task.automation.workspace) {
      parts.push(`Workspace: ${task.automation.workspace}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

function getTransitionInstructions(transition: StateTransition): string {
  const instructions: Record<string, Record<string, string>> = {
    'TODO': {
      'READY': 'Review the task requirements and confirm it is ready for development. Update any relevant documentation.',
      'FAILED': 'Mark this task as failed or blocked. Document the reason.',
    },
    'READY': {
      'RUNNING': 'Start development on this task. Create a branch and begin implementation.',
      'TODO': 'Move this task back to todo and document what is missing.',
    },
    'RUNNING': {
      'REVIEW': 'Submit this task for review. Ensure all tests pass and documentation is updated.',
      'FAILED': 'This task failed or is blocked. Document what happened and what needs to happen next.',
    },
    'FAILED': {
      'READY': 'The blocker has been resolved. Prepare this task to run again.',
    },
    'REVIEW': {
      'RUNNING': 'Address review feedback and continue working on this task.',
      'DONE': 'Review is complete. Mark this task as done.',
      'FAILED': 'Review found a blocking issue. Document it and mark this task failed.',
    },
  };

  return instructions[transition.from]?.[transition.to] ?? 'Proceed with this task.';
}
