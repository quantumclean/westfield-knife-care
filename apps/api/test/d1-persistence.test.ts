import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { D1Repository } from "../src/repo/d1.ts";
import { makeDeps, json } from "./helpers.ts";
import { sqliteD1 } from "./sqlite-d1.ts";

it("persists validated waitlist interest through a database close and reopen", async () => {
  const directory = mkdtempSync(join(tmpdir(), "wkc-ci-d1-"));
  const filename = join(directory, "synthetic.sqlite");
  let db = sqliteD1(undefined, filename);
  try {
    const { app } = makeDeps({ repo: new D1Repository(db) });
    const response = await app.request(
      "/api/waitlist",
      json("POST", {
        experiment_id: "experiment-001",
        source: "flyer-a",
        acquisition_channel: "print",
        name: "Synthetic CI",
        email: "synthetic@example.invalid",
        service_interest: "always_sharp",
        cadence: "monthly",
        notes: "synthetic persistence fixture",
      }),
    );
    expect(response.status).toBe(201);
    const created = (await response.json()) as { id: string };
    db.raw.close();
    db = sqliteD1(undefined, filename);
    const entries = await new D1Repository(db).listWaitlist();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: created.id,
      service_interest: "always_sharp",
      cadence: "monthly",
      notes: "synthetic persistence fixture",
      experiment_id: "experiment-001",
    });
    const { app: reopened } = makeDeps({ repo: new D1Repository(db) });
    expect(
      (
        await reopened.request(
          "/api/waitlist",
          json("POST", {
            name: "invalid",
            email: "synthetic@example.invalid",
            service_interest: "not-a-service",
          }),
        )
      ).status,
    ).toBe(400);
    expect(await new D1Repository(db).listWaitlist()).toHaveLength(1);
  } finally {
    db.raw.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
