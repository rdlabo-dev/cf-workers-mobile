import { existsSync, realpathSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

// Resolve existing ancestors too: an output directory may not exist yet, while
// its parent is a symlink into the server's deployment directory.
function canonical(path: string): string {
  const absolute = resolve(path);
  if (existsSync(absolute)) return realpathSync(absolute);
  const parent = dirname(absolute);
  return parent === absolute
    ? absolute
    : resolve(canonical(parent), relative(parent, absolute));
}

/** A browser build must never overwrite or empty its server inputs. */
export function assertSeparateOutput(
  output: string,
  inputs: readonly string[],
) {
  const destination = canonical(output);
  for (const input of inputs) {
    const path = relative(destination, canonical(input));
    if (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`))
      throw new Error(
        `Capacitor output must be separate from Cloudflare/server inputs: ${output} contains ${input}`,
      );
  }
}

/** Output links can redirect ordinary bundle/report writes into server files. */
export function assertNoOutputLinks(output: string) {
  if (!existsSync(output)) return;
  for (const entry of readdirSync(output, { withFileTypes: true })) {
    const path = resolve(output, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Capacitor output must not contain symlinks: ${path}`);
    if (entry.isDirectory()) assertNoOutputLinks(path);
  }
}
