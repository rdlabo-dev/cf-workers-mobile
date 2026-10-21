export default function resolveUnavailable(id: string): never {
  throw new Error(
    `Cannot resolve '${id}' at runtime: modules must be bundled.`,
  );
}
