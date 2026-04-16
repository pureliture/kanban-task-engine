import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/event-bus';

describe('EventBus', () => {
  it('calls registered handler on emit', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('test', handler);
    bus.emit('test', { foo: 'bar' });
    expect(handler).toHaveBeenCalledWith('test', { foo: 'bar' });
  });

  it('supports multiple handlers for same event', () => {
    const bus = new EventBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    bus.on('test', handler1);
    bus.on('test', handler2);
    bus.emit('test', {});
    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });

  it('removes handler with off', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('test', handler);
    bus.off('test', handler);
    bus.emit('test', {});
    expect(handler).not.toHaveBeenCalled();
  });

  it('clears all handlers with removeAll', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.on('test', handler);
    bus.on('other', handler);
    bus.removeAll();
    bus.emit('test', {});
    bus.emit('other', {});
    expect(handler).not.toHaveBeenCalled();
  });

  it('catches errors in handlers without stopping other handlers', () => {
    const bus = new EventBus();
    const errorFn = vi.fn(() => { throw new Error('boom'); });
    const afterFn = vi.fn();
    bus.on('test', errorFn);
    bus.on('test', afterFn);
    bus.emit('test', {});
    expect(afterFn).toHaveBeenCalled();
  });

  it('handles snapshot iteration - off during emit does not skip handlers', () => {
    const bus = new EventBus();
    const handler2 = vi.fn();
    const handler1 = vi.fn(() => { bus.off('test', handler2); });
    bus.on('test', handler1);
    bus.on('test', handler2);
    bus.emit('test', {});
    // handler2 should still be called because emit iterates a snapshot
    expect(handler2).toHaveBeenCalled();
  });
});