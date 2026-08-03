import { afterEach, describe, expect, it, vi } from 'vitest';

const selectMock = vi.hoisted(() => vi.fn());

vi.mock('@inquirer/prompts', () => ({ select: selectMock }));

import { pickItem, pickTrack } from '@/cli/ui/pick';

import { createTrackFixture } from '../../helpers/fixtures';

describe('pickTrack / pickItem', () => {
  const originalIsTTY = process.stdout.isTTY;

  afterEach(() => {
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });
    selectMock.mockReset();
  });

  function forceTty(): void {
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
  }

  it('returns null for empty input', async () => {
    await expect(pickTrack([])).resolves.toBeNull();
    await expect(pickItem([], { label: String })).resolves.toBeNull();
  });

  it('returns the first item on non-TTY terminals', async () => {
    const tracks = [createTrackFixture({ id: 'a' }), createTrackFixture({ id: 'b' })];
    await expect(pickTrack(tracks)).resolves.toBe(tracks[0]);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('returns the only item without prompting', async () => {
    forceTty();
    const tracks = [createTrackFixture({ id: 'only' })];
    await expect(pickTrack(tracks)).resolves.toBe(tracks[0]);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it('prompts with choices on interactive terminals', async () => {
    forceTty();
    const tracks = [
      createTrackFixture({ id: 'a', title: 'Alpha' }),
      createTrackFixture({ id: 'b', title: 'Beta' }),
    ];
    selectMock.mockResolvedValue(tracks[1]);

    await expect(pickTrack(tracks, { message: 'Choose' })).resolves.toBe(tracks[1]);
    expect(selectMock).toHaveBeenCalledOnce();
    const args = selectMock.mock.calls[0]?.[0] as { message: string; choices: unknown[] };
    expect(args.message).toBe('Choose');
    expect(args.choices).toHaveLength(2);
  });

  it('pickItem prompts with the label function', async () => {
    forceTty();
    const items = ['one', 'two'];
    selectMock.mockResolvedValue('two');

    await expect(pickItem(items, { label: (item) => `Item: ${item}` })).resolves.toBe('two');
    const args = selectMock.mock.calls[0]?.[0] as { choices: { name: string }[] };
    expect(args.choices[0]?.name).toBe('Item: one');
  });
});
