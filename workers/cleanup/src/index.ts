/**
 * Separate Cloudflare Worker with a daily Cron Trigger and a D1 DB binding.
 * Scheduled expiration is physical deletion (D1 has no automatic TTL).
 */
export interface CleanupBindings {
  DB: {
    prepare(sql: string): {
      bind(...values: number[]): { run(): Promise<unknown> };
      run(): Promise<unknown>;
    };
  };
}

/** Each table is cleaned on its own, so one failure (e.g. a missing migration) skips nothing else. */
export const CLEANUP_TABLES = [
  "analytics_events",
  "analytics_deletions",
  "api_rate_limits",
] as const;

export default {
  async scheduled(_event: unknown, env: CleanupBindings): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const failed: string[] = [];
    for (const table of CLEANUP_TABLES) {
      try {
        await env.DB.prepare(`DELETE FROM ${table} WHERE expires_at <= ?`).bind(now).run();
      } catch {
        failed.push(table);
      }
    }
    // Still fail the run, so the Cron Trigger's logs show the missed table.
    if (failed.length) throw new Error(`Cleanup failed for: ${failed.join(", ")}`);
  },
};
