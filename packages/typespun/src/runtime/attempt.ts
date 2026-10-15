type Attempt<T, E> =
  | { ok: true; data: T; error: null }
  | { ok: false; data: null; error: E };

type Outcome<T, E> = [T] extends [PromiseLike<infer U>]
  ? Promise<Attempt<Awaited<U>, E>>
  : Attempt<T, E>;

type AttemptFn = {
  <T>(run: () => T): Outcome<T, Error>;
  <T, E>(run: () => T, mapError: (thrown: unknown) => E): Outcome<T, E>;
};

const asError = (thrown: unknown) =>
  thrown instanceof Error
    ? thrown
    : new Error(String(thrown), { cause: thrown });

const succeed = (data: unknown) => ({ ok: true as const, data, error: null });

const run = (
  fn: () => unknown,
  mapError: (thrown: unknown) => unknown = asError,
) => {
  const fail = (thrown: unknown) => ({
    ok: false as const,
    data: null,
    error: mapError(thrown),
  });

  try {
    const value = fn();

    return value instanceof Promise
      ? value.then(succeed, fail)
      : succeed(value);
  } catch (thrown) {
    return fail(thrown);
  }
};

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- arrow functions cannot declare overloads
export const attempt = run as AttemptFn;
