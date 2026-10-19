import { parseAst } from "rollup/parseAst";

/** Generated environment exports must contain public values only. Never evaluate them. */
export function publicEnvironment(source: string) {
  try {
    const program = parseAst(source);
    return program.body.every((statement) => {
      if (
        statement.type !== "ExportNamedDeclaration" ||
        statement.declaration?.type !== "VariableDeclaration"
      )
        return false;
      return statement.declaration.declarations.every((declaration) => {
        if (
          declaration.id.type !== "Identifier" ||
          !["production", "development", "test"].includes(
            declaration.id.name,
          ) ||
          declaration.init?.type !== "ObjectExpression"
        )
          return false;
        return declaration.init.properties.every(
          (property) =>
            property.type === "Property" &&
            !property.computed &&
            property.kind === "init" &&
            /^NEXT_PUBLIC_/.test(
              property.key.type === "Identifier"
                ? property.key.name
                : property.key.type === "Literal"
                  ? String(property.key.value)
                  : "",
            ) &&
            property.value.type === "Literal" &&
            typeof property.value.value === "string",
        );
      });
    });
  } catch {
    return false;
  }
}

/** The only permitted context accessor is the one installed by our generated entry. */
export function applicationCloudflareContext(code: string) {
  return (
    /cloudflare:|getCloudflareContext/.test(code) ||
    code.split("__cloudflare-context__").length - 1 !== 1
  );
}
