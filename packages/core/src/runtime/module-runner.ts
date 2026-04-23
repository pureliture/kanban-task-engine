import { AutomationModule, ModuleContext } from './module';
import { assertSideEffectsAllowed } from './policy';

export class ModuleRunner {
  constructor(private modules: AutomationModule[]) {}

  async run(initialContext: ModuleContext): Promise<ModuleContext> {
    let context = initialContext;
    for (const module of this.modules) {
      assertSideEffectsAllowed(module.name, module.sideEffects, context.policy);
      context = await module.run(context);
    }
    return context;
  }
}
