export const dispose: typeof Symbol.dispose = (Symbol.dispose ??
  Symbol.for("Symbol.dispose")) as typeof Symbol.dispose;
/** Stable fallback for engines without explicit resource management symbols. */
export const asyncDispose: typeof Symbol.asyncDispose = (Symbol.asyncDispose ??
  Symbol.for("Symbol.asyncDispose")) as typeof Symbol.asyncDispose;

export function installResourceSymbols(symbol: SymbolConstructor | undefined) {
  if (!symbol) return () => {};
  const restorers: (() => void)[] = [];
  for (const [name, value] of [
    ["dispose", dispose],
    ["asyncDispose", asyncDispose],
  ] as const) {
    if (symbol[name] !== undefined) continue;
    const previous = Object.getOwnPropertyDescriptor(symbol, name);
    Object.defineProperty(symbol, name, { value, configurable: true });
    restorers.push(() => {
      const descriptor = Object.getOwnPropertyDescriptor(symbol, name);
      if (
        descriptor?.value === value &&
        descriptor.configurable &&
        !descriptor.writable &&
        !descriptor.enumerable
      ) {
        if (previous) Object.defineProperty(symbol, name, previous);
        else Reflect.deleteProperty(symbol, name);
      }
    });
  }
  return () => {
    for (const restore of restorers.reverse()) restore();
  };
}
