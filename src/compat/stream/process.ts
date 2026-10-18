// Workers nextTick deliberately uses the Web microtask queue.
export function nextTick(
  callback: (...args: any[]) => unknown,
  ...args: unknown[]
) {
  queueMicrotask(() => callback(...args));
}
