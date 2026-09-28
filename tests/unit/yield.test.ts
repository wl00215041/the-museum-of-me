import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { yieldToEventLoop } from '../../src/export/yield';

describe('yieldToEventLoop', () => {
  it('resolves without using timers (hidden tabs throttle timers)', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await yieldToEventLoop();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('lets queued tasks run before resolving', async () => {
    let ran = false;
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => { ran = true; port1.close(); };
    port2.postMessage(null);
    await yieldToEventLoop();
    expect(ran).toBe(true);
  });

  it('the exporter no longer yields through setTimeout', () => {
    expect(readFileSync('src/export/exporter.ts', 'utf8')).not.toContain('setTimeout');
  });
});
