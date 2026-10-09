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
export default {
  async scheduled(
    _event: unknown,
    env: CleanupBindings,
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare("DELETE FROM analytics_events WHERE expires_at <= ?")
      .bind(now)
      .run();
    await env.DB.prepare("DELETE FROM api_rate_limits WHERE expires_at <= ?")
      .bind(now)
      .run();
  },
};
