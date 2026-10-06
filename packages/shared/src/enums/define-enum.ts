/** Object form of a string enum: `{ DRAFT: 'DRAFT', ... }`. */
export type EnumObject<T extends string> = { readonly [K in T]: K };

/** Union of an enum object's values. */
export type EnumValue<E> = E[keyof E];

/**
 * Defines a string enum as a frozen const object. Values must stay identical to the
 * Prisma enums introduced in Phase 2 (a Phase 2 test compares both).
 */
export function defineEnum<const T extends readonly string[]>(values: T): EnumObject<T[number]> {
  const entries = values.map((value) => [value, value] as const);
  return Object.freeze(Object.fromEntries(entries)) as EnumObject<T[number]>;
}

export function enumValues<T extends string>(enumObject: EnumObject<T>): readonly T[] {
  return Object.values<T>(enumObject);
}
