import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerTuiCommand } from '@/commands/tui';
import { ValidationError } from '@/core/errors';

import { createTempDir, removeTempDir } from '../helpers/temp-dir';
import { createServiceTestContext, type ServiceTestContext } from '../helpers/test-context';
import { runCli } from './helpers';

describe('tui command', () => {
  let directory: string;
  let service: ServiceTestContext;

  beforeEach(async () => {
    directory = await createTempDir();
    service = await createServiceTestContext(directory);
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  it('rejects non-interactive terminals', async () => {
    await expect(runCli(registerTuiCommand, service.context, ['tui'])).rejects.toThrow(
      ValidationError,
    );
  });
});
