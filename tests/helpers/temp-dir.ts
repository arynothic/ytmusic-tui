import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Creates a unique temporary directory for a test. */
export async function createTempDir(prefix = 'ytmusic-test-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/** Recursively removes a directory; ignores missing paths. */
export async function removeTempDir(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
}
