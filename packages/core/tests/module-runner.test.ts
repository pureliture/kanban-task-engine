import { describe, expect, it, vi } from 'vitest';
import { ModuleRunner } from '../src/runtime/module-runner';
import { AutomationModule } from '../src/runtime/module';

describe('ModuleRunner', () => {
  it('runs modules in order and passes context forward', async () => {
    const first: AutomationModule = {
      name: 'first',
      sideEffects: [],
      run: vi.fn(async ctx => ({ ...ctx, values: { ...ctx.values, first: true } })),
    };
    const second: AutomationModule = {
      name: 'second',
      sideEffects: [],
      run: vi.fn(async ctx => ({ ...ctx, values: { ...ctx.values, second: ctx.values.first } })),
    };

    const result = await new ModuleRunner([first, second]).run({ values: {}, policy: { allowedSideEffects: [] } });
    expect(result.values).toEqual({ first: true, second: true });
  });

  it('blocks disallowed side effects', async () => {
    const module: AutomationModule = {
      name: 'writer',
      sideEffects: ['writeIssue'],
      run: vi.fn(async ctx => ctx),
    };

    await expect(new ModuleRunner([module]).run({ values: {}, policy: { allowedSideEffects: [] } }))
      .rejects.toThrow('Module writer requires disallowed side effect: writeIssue');
  });
});
