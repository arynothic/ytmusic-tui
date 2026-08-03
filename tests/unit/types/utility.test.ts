import { describe, expectTypeOf, it } from 'vitest';

import type { Awaitable, Constructor, DeepReadonly, Maybe, Nullable, Prettify } from '@/types';

describe('utility types', () => {
  it('Maybe allows value, null and undefined', () => {
    expectTypeOf<Maybe<string>>().toEqualTypeOf<string | null | undefined>();
  });

  it('Nullable allows value and null only', () => {
    expectTypeOf<Nullable<string>>().toEqualTypeOf<string | null>();
  });

  it('Awaitable allows value or promise', () => {
    expectTypeOf<Awaitable<number>>().toEqualTypeOf<number | Promise<number>>();
  });

  it('Constructor captures constructor signatures', () => {
    class Widget {
      constructor(readonly size: number) {}
    }
    expectTypeOf<Constructor<Widget, [number]>>().toMatchTypeOf<typeof Widget>();
    expectTypeOf<InstanceType<Constructor<Widget>>>().toEqualTypeOf<Widget>();
  });

  it('DeepReadonly freezes nested objects and arrays', () => {
    expectTypeOf<DeepReadonly<{ a: { b: number[] } }>>().toEqualTypeOf<{
      readonly a: { readonly b: readonly number[] };
    }>();
  });

  it('Prettify flattens intersections', () => {
    expectTypeOf<Prettify<{ a: 1 } & { b: 2 }>>().toEqualTypeOf<{ a: 1; b: 2 }>();
  });
});
