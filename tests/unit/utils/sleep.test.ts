import { describe, expect, it } from 'vitest';

import { sleep } from '@/utils/sleep';

describe('sleep', () => {
  it('resolves after the given duration', async () => {
    const start = Date.now();
    await sleep(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('gone'));
    await expect(sleep(1000, controller.signal)).rejects.toThrow('gone');
  });

  it('rejects when aborted mid-sleep', async () => {
    const controller = new AbortController();
    const pending = sleep(1000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow(/aborted/i);
  });

  it('converts non-Error abort reasons', async () => {
    const controller = new AbortController();
    controller.abort('plain reason');
    await expect(sleep(1000, controller.signal)).rejects.toThrow('Operation aborted');
  });
});
