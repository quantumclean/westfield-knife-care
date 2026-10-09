import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FLYER_ROUTES } from "@wkc/shared";

const web = resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(resolve(web, file), "utf8");

/** Parse a Cloudflare Pages _headers file into { path: { header: value } }. */
function parseHeaders(text: string): Record<string, Record<string, string>> {
  const rules: Record<string, Record<string, string>> = {};
  let current: Record<string, string> | undefined;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      current = rules[raw.trim()] ??= {};
    } else if (current) {
      const [name, ...value] = raw.trim().split(":");
      current[name!.trim()] = value.join(":").trim();
    }
  }
  return rules;
}

describe("Cloudflare Pages routing", () => {
  it("never ships a top-level 404.html: its presence turns off the SPA fallback that serves /a and /b", () => {
    expect(existsSync(resolve(web, "public/404.html"))).toBe(false);
    expect(existsSync(resolve(web, "404.html"))).toBe(false);
  });

  it("has no static file that would shadow a flyer vanity path", () => {
    for (const route of FLYER_ROUTES) {
      const name = route.path.replace(/^\//, "");
      for (const candidate of [name, `${name}.html`, `${name}/index.html`]) {
        expect(existsSync(resolve(web, "public", candidate)), `public/${candidate}`).toBe(false);
        expect(existsSync(resolve(web, candidate)), candidate).toBe(false);
      }
    }
  });

  it("builds the landing page and the thank-you page as separate entries", () => {
    expect(existsSync(resolve(web, "index.html"))).toBe(true);
    expect(existsSync(resolve(web, "thanks.html"))).toBe(true);
    const config = read("vite.config.ts");
    expect(config).toContain('"index.html"');
    expect(config).toContain('"thanks.html"');
  });

  it("keeps the thank-you page out of search results", () => {
    expect(read("thanks.html")).toMatch(/<meta name="robots" content="noindex"/);
    expect(read("public/robots.txt")).toMatch(/^Disallow: \/thanks$/m);
  });
});

describe("Cloudflare Pages headers", () => {
  it("applies exactly the validated rules", () => {
    // Anything added here must be tested against the API, the Stripe redirect and
    // analytics first (see docs/cloudflare-pages.md), so changes are deliberate.
    expect(parseHeaders(read("public/_headers"))).toEqual({
      "/*": { "X-Frame-Options": "DENY" },
      "/assets/*": { "Cache-Control": "public, max-age=31536000, immutable" },
    });
  });

  it("does not repeat headers Pages already sends, which would duplicate their values", () => {
    const rules = Object.values(parseHeaders(read("public/_headers"))).flatMap((r) =>
      Object.keys(r).map((name) => name.toLowerCase()),
    );
    expect(rules).not.toContain("x-content-type-options");
    expect(rules).not.toContain("referrer-policy");
  });

  it("only immutably caches filenames Vite content-hashes", () => {
    const rules = parseHeaders(read("public/_headers"));
    for (const [path, headers] of Object.entries(rules)) {
      if (headers["Cache-Control"]?.includes("immutable")) expect(path).toBe("/assets/*");
    }
  });
});

describe("page metadata", () => {
  it("gives the landing page a language, title and description", () => {
    const html = read("index.html");
    expect(html).toMatch(/<html lang="en">/);
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html).toMatch(/<meta\s+name="description"\s+content="[^"]{50,}"/);
  });
});
