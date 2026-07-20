import { getEnv, getEnvBoolean, getEnvInteger } from '@/utils/env';

/** Abstraction over environment variable access for config overrides. */
export interface EnvReader {
  get(name: string): string | undefined;
  getBoolean(name: string): boolean | undefined;
  getInteger(name: string): number | undefined;
}

/** EnvReader backed by `process.env` with the `YTMUSIC_` prefix applied. */
export const processEnvReader: EnvReader = {
  get: getEnv,
  getBoolean: getEnvBoolean,
  getInteger: getEnvInteger,
};
