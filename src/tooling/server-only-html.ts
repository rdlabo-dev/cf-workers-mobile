import { parse, type DefaultTreeAdapterTypes as HTML } from "parse5";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
const parseSrcset = createRequire(import.meta.url)("parse-srcset") as (
  value: string,
) => { url: string }[];

// Vite's built-in HTML asset handling can inline without a module/watch input.
// Parse HTML/entities and srcset candidates instead of matching markup with regex.
const attributes: Record<string, string[]> = {
  audio: ["src"],
  embed: ["src"],
  img: ["src", "srcset"],
  image: ["href", "xlink:href"],
  input: ["src"],
  link: ["href", "imagesrcset"],
  object: ["data"],
  source: ["src", "srcset"],
  track: ["src"],
  use: ["href", "xlink:href"],
  video: ["src", "poster"],
  script: ["src"],
};
export function guardHtmlAssets(
  html: string,
  filename: string,
  root: string,
  assertPublic: (path: string) => void,
) {
  const check = (url: string) => {
    if (!url || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) return;
    // Vite resolves these paths relative to the HTML file (or build root).
    let path = url;
    try {
      path = decodeURI(url);
    } catch {
      /* Preserve unresolved placeholders and literal percent filenames. */
    }
    assertPublic(
      path.startsWith("/")
        ? resolve(root, "." + path)
        : resolve(dirname(filename), path),
    );
  };
  const visit = (node: HTML.Node) => {
    if ("attrs" in node) {
      const fields = attributes[node.tagName] ?? [];
      for (const attr of node.attrs) {
        const name = attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name;
        if (fields.includes(name)) {
          if (name === "srcset" || name === "imagesrcset")
            for (const candidate of parseSrcset(attr.value))
              check(candidate.url);
          else check(attr.value);
        }
      }
      if (node.tagName === "meta") {
        const kind = node.attrs
          .find((attr) => attr.name === "name" || attr.name === "property")
          ?.value.toLowerCase();
        if (
          kind &&
          /^(?:og:(?:image|audio|video)(?::(?:url|secure_url))?|twitter:image(?::src)?|msapplication-tileimage|msapplication-square\d+x\d+logo|msapplication-wide\d+x\d+logo)$/.test(
            kind,
          )
        )
          check(
            node.attrs.find((attr) => attr.name === "content")?.value ?? "",
          );
      }
      if ("content" in node) visit(node.content as HTML.DocumentFragment);
    }
    if ("childNodes" in node) for (const child of node.childNodes) visit(child);
  };
  visit(parse(html));
}
