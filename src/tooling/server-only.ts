import { realpathSync, statSync, readdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

/** File identity, not content heuristics. Symlink aliases share the restriction. */
export function serverOnlyFiles(
  root: string,
  declarations: readonly string[] = [],
) {
  const files = new Set(
    declarations.map((path) => {
      const absolute = resolve(root, path);
      if (!statSync(absolute).isFile())
        throw new Error(`serverOnly must name a file: ${absolute}`);
      return realpathSync(absolute);
    }),
  );
  const matches = (id: string) => {
    if (!files.size || id.startsWith("\0")) return false;
    // Check exact filenames as well as module query/fragment IDs. A literal
    // file named "key.txt?raw" must not hide an import of protected key.txt.
    if (!isAbsolute(id)) return false;
    return [...new Set([id, id.split(/[?#]/)[0]])].some((path) => {
      try {
        return files.has(realpathSync(path));
      } catch {
        return false;
      }
    });
  };
  const assertPublic = (id: string) => {
    if (matches(id))
      throw new Error(`Declared server-only file cannot be distributed: ${id}`);
  };
  return {
    matches,
    assertPublic,
    assertDirectory(directory: string) {
      if (!files.size) return;
      const seen = new Set<string>();
      const visit = (path: string) => {
        const canonical = realpathSync(path);
        if (seen.has(canonical)) return;
        seen.add(canonical);
        if (statSync(path).isDirectory()) {
          for (const name of readdirSync(path)) visit(resolve(path, name));
        } else assertPublic(path);
      };
      visit(directory);
    },
  };
}
