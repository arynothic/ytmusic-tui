import { createAppContext } from '@/cli/context';
import { handleFatalError } from '@/cli/error-handler';
import { installEpipeHandler } from '@/cli/pipe-safety';
import { createProgram } from '@/cli/program';

/**
 * CLI entrypoint. Registered as the `ytmusic` binary via package.json `bin`.
 * All errors funnel into {@link handleFatalError}, which maps them to
 * formatted stderr output and a documented exit code.
 */
async function main(): Promise<void> {
  installEpipeHandler();
  const program = createProgram(createAppContext);
  await program.parseAsync(process.argv);
}

main().catch(handleFatalError);
