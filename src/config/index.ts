export { ConfigService } from '@/config/config-service';
export { processEnvReader, type EnvReader } from '@/config/env-reader';
export { flattenConfig } from '@/config/flatten';
export { loadConfig, type LoadedConfig, type LoadConfigOptions } from '@/config/loader';
export { deepMerge, isPlainObject, setDotted, type PlainObject } from '@/config/merge';
export {
  ensureConfigDirectory,
  resolveAppPaths,
  resolveAppPathsFromEnv,
  type AppPaths,
  type ResolvePathsOptions,
} from '@/config/paths';
