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
    'BACKLOG': {
      'SELECTED': 'Review the task requirements and confirm it is ready for development. Update any relevant documentation.',
      'ACTIVE': 'Begin working on this task. Set up the development environment and create necessary branches.',
      'CANCELLED': 'Mark this task as cancelled. Document the reason for cancellation.',
    },
    'SELECTED': {
      'ACTIVE': 'Start development on this task. Create a branch and begin implementation.',
      'CANCELLED': 'Cancel this task. Document the reason.',
    },
    'ACTIVE': {
      'BLOCKED': 'This task is blocked. Document what is blocking it and what needs to happen to unblock.',
      'REVIEW': 'Submit this task for review. Ensure all tests pass and documentation is updated.',
      'DONE': 'Complete this task. Verify all acceptance criteria are met.',
      'CANCELLED': 'Cancel this task. Document the reason.',
    },
    'BLOCKED': {
      'ACTIVE': 'The blocker has been resolved. Resume work on this task.',
      'CANCELLED': 'Cancel this blocked task. Document the reason.',
    },
    'REVIEW': {
      'ACTIVE': 'Address review feedback and continue working on this task.',
      'DONE': 'Review is complete. Mark this task as done.',
      'CANCELLED': 'Cancel this task during review. Document the reason.',
    },
  };

  return instructions[transition.from]?.[transition.to] ?? 'Proceed with this task.';
}