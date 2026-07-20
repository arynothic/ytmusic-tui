import { describe, expect, it } from 'vitest';

import { Container, createToken } from '@/core/container';
import { AssertionFailedError } from '@/core/errors';

describe('Container', () => {
  it('resolves a registered factory lazily and memoizes it', () => {
    const container = new Container();
    const token = createToken<{ id: number }>('service');
    let constructions = 0;
    container.register(token, () => {
      constructions += 1;
      return { id: constructions };
    });

    expect(constructions).toBe(0);
    const first = container.resolve(token);
    const second = container.resolve(token);
    expect(first).toBe(second);
    expect(constructions).toBe(1);
  });

  it('supports dependency chains between factories', () => {
    const container = new Container();
    const baseToken = createToken<number>('base');
    const derivedToken = createToken<number>('derived');
    container.register(baseToken, () => 20);
    container.register(derivedToken, (c) => c.resolve(baseToken) + 1);

    expect(container.resolve(derivedToken)).toBe(21);
  });

  it('resolves registered instances as-is', () => {
    const container = new Container();
    const token = createToken<readonly string[]>('tags');
    const instance = ['a', 'b'];
    container.registerInstance(token, instance);
    expect(container.resolve(token)).toBe(instance);
  });

  it('re-registering replaces the memoized instance', () => {
    const container = new Container();
    const token = createToken<string>('value');
    container.register(token, () => 'first');
    expect(container.resolve(token)).toBe('first');
    container.register(token, () => 'second');
    expect(container.resolve(token)).toBe('second');
  });

  it('throws AssertionFailedError for unregistered tokens', () => {
    const container = new Container();
    expect(() => container.resolve(createToken('missing'))).toThrowError(AssertionFailedError);
    expect(() => container.resolve(createToken('missing'))).toThrowError(/missing/);
  });

  it('reports registered tokens via has()', () => {
    const container = new Container();
    const token = createToken<number>('n');
    expect(container.has(token)).toBe(false);
    container.register(token, () => 1);
    expect(container.has(token)).toBe(true);
  });
});
