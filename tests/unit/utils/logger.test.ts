import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTempDir, removeTempDir } from '../../helpers/temp-dir';
import { createChildLogger, createLogger } from '@/utils/logger';

describe('createLogger', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(directory);
  });

  it('writes JSON log lines to the configured file', async () => {
    const logFile = join(directory, 'logs', 'app.log');
    const logger = createLogger({ level: 'info', logFile });
    logger.info({ answer: 42 }, 'hello world');

    const contents = await readFile(logFile, 'utf8');
    const line = JSON.parse(contents.trim()) as Record<string, unknown>;
    expect(line['msg']).toBe('hello world');
    expect(line['answer']).toBe(42);
    expect(line['app']).toBe('ytmusic-cli');
  });

  it('respects the minimum level', async () => {
    const logFile = join(directory, 'app.log');
    const logger = createLogger({ level: 'warn', logFile });
    logger.info('should be dropped');
    logger.warn('should be kept');

    const contents = await readFile(logFile, 'utf8');
    expect(contents).not.toContain('should be dropped');
    expect(contents).toContain('should be kept');
  });

  it('is disabled when no destination is configured', () => {
    const logger = createLogger({ level: 'debug' });
    expect(logger.isLevelEnabled('debug')).toBe(false);
    expect(() => logger.info('noop')).not.toThrow();
  });

  it('creates named child loggers', async () => {
    const logFile = join(directory, 'app.log');
    const logger = createChildLogger(createLogger({ level: 'info', logFile }), 'search');
    logger.info('from child');

    const contents = await readFile(logFile, 'utf8');
    expect(contents).toContain('"module":"search"');
  });
});
