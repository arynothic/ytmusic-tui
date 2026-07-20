/** `T`, `null`, or `undefined` — a value that may be absent. */
export type Maybe<T> = T | null | undefined;

/** `T` or `null`. */
export type Nullable<T> = T | null;

/** A value or a promise resolving to it. */
export type Awaitable<T> = T | Promise<T>;

/** Constructor signature for instances of `T`. */
export type Constructor<T, Args extends unknown[] = unknown[]> = new (...args: Args) => T;

/** Recursively makes every property of `T` read-only. */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

/** Flattens an inferred object type for readable editor tooltips. */
export type Prettify<T> = { [K in keyof T]: T[K] } & {};
