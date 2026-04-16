export type EventHandler = (event: string, payload: unknown) => void;

export class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();

  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) handlers.splice(idx, 1);
    }
  }

  emit(event: string, payload: unknown): void {
    const handlers = [...(this.handlers.get(event) ?? [])];
    for (const handler of handlers) {
      try {
        handler(event, payload);
      } catch (err) {
        console.error(`EventBus: error in handler for '${event}':`, err);
      }
    }
  }

  removeAll(): void {
    this.handlers.clear();
  }
}