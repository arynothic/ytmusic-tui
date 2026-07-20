import { invariant } from '@/core/errors/invariant';

declare const tokenBrand: unique symbol;

/** A typed injection token. Created via {@link createToken}. */
export interface Token<T> {
  readonly key: symbol;
  readonly description: string;
  /** Phantom marker carrying `T` for type inference; never set at runtime. */
  readonly [tokenBrand]?: T;
}

/** Creates a typed injection token for the DI container. */
export function createToken<T>(description: string): Token<T> {
  return { key: Symbol(description), description };
}

type Factory<T> = (container: Container) => T;

/**
 * Minimal typed dependency-injection container. Factories are resolved
 * lazily and memoized as singletons; re-registering a token replaces the
 * factory and drops the memoized instance. No decorators, no reflection.
 */
export class Container {
  readonly #factories = new Map<symbol, Factory<unknown>>();
  readonly #singletons = new Map<symbol, unknown>();

  /** Registers a lazy singleton factory for a token. */
  register<T>(token: Token<T>, factory: Factory<T>): void {
    this.#factories.set(token.key, factory);
    this.#singletons.delete(token.key);
  }

  /** Registers an already-constructed instance for a token. */
  registerInstance<T>(token: Token<T>, instance: T): void {
    this.#factories.set(token.key, () => instance);
    this.#singletons.set(token.key, instance);
  }

  /**
   * Resolves a token, constructing and memoizing the instance on first
   * use. Throws {@link AssertionFailedError} for unregistered tokens —
   * that is always a wiring bug, never a runtime condition.
   */
  resolve<T>(token: Token<T>): T {
    const memoized = this.#singletons.get(token.key);
    if (memoized !== undefined) {
      return memoized as T;
    }
    const factory = this.#factories.get(token.key) as Factory<T> | undefined;
    invariant(factory !== undefined, `No provider registered for token "${token.description}"`);
    const instance = factory(this);
    this.#singletons.set(token.key, instance);
    return instance;
  }

  /** True when a token has a registered provider. */
  has<T>(token: Token<T>): boolean {
    return this.#factories.has(token.key);
  }
}
