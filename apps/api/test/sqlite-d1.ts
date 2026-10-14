import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Database, D1Statement } from "../src/repo/d1.ts";

const MIGRATIONS = resolve(import.meta.dirname, "../../../migrations");

class Statement implements D1Statement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    private readonly values: SQLInputValue[] = [],
  ) {}

  bind(...values: (string | number | null)[]): D1Statement {
    return new Statement(this.db, this.sql, values);
  }

  async first<T>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...this.values) as T[] };
  }

  async run(): Promise<{ meta: { changes: number } }> {
    const result = this.db.prepare(this.sql).run(...this.values);
    return { meta: { changes: Number(result.changes) } };
  }
}

/**
 * A real SQLite database behind the D1 interface, with the repository's migrations applied
 * (all of them, or up to and including `through`), so SQL is exercised rather than mocked.
 */
export function sqliteD1(
  through?: string,
  filename = ":memory:",
): D1Database & { raw: DatabaseSync } {
  const raw = new DatabaseSync(filename);
  for (const file of readdirSync(MIGRATIONS).sort()) {
    if (!file.endsWith(".sql") || (through && file > through)) continue;
    raw.exec(readFileSync(resolve(MIGRATIONS, file), "utf8"));
  }
  return {
    raw,
    prepare: (sql: string) => new Statement(raw, sql),
    async batch(statements: D1Statement[]) {
      raw.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        raw.exec("COMMIT");
        return results;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
