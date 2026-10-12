import { describe, expect, it, vi } from "vitest";
import {
  QueryCommand,
  PutCommand,
  DeleteCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { AnalyticsEvent } from "@wkc/shared";
import { DynamoRepository } from "../src/repo/dynamo.ts";

const event = {
  id: "synthetic",
  created_at: new Date().toISOString(),
  visitor_id: "00000000-0000-4000-8000-000000000001",
  view_id: "synthetic-view",
  owner: "f".repeat(64),
  experiment_id: "experiment-001",
  source: "flyer-a",
  acquisition_channel: "print",
  page: "/a",
  name: "page_view",
  props: {},
} as AnalyticsEvent;
function repository(send: ReturnType<typeof vi.fn>) {
  const repo = new DynamoRepository("synthetic-table");
  (repo as unknown as { doc: { send: typeof send } }).doc = { send };
  return repo;
}
describe("legacy Dynamo analytics guards (mocked SDK, no AWS requests)", () => {
  it("atomically checks a deletion tombstone, binds/caps a view and inserts an idempotent event", async () => {
    const send = vi.fn().mockResolvedValue({});
    await repository(send).putEvents([event]);
    const command = send.mock.calls[0]![0] as TransactWriteCommand;
    expect(command).toBeInstanceOf(TransactWriteCommand);
    const items = command.input.TransactItems!;
    expect(items[0]!.ConditionCheck!.Key!.pk).toContain(
      `DELETE#${event.visitor_id}#${event.owner}`,
    );
    expect(items[1]!.Update!.ExpressionAttributeValues![":limit"]).toBe(80);
    expect(items[1]!.Update!.ConditionExpression).toContain("visitor_id = :vid");
    expect(items[2]!.Put!.ConditionExpression).toBe("attribute_not_exists(pk)");
  });
  it("skips conditional duplicates/budgets but propagates real transaction/store failures", async () => {
    const send = vi.fn().mockRejectedValue({
      name: "TransactionCanceledException",
      CancellationReasons: [{ Code: "ConditionalCheckFailed" }],
    });
    await expect(repository(send).putEvents([event])).resolves.toBeUndefined();
    send.mockRejectedValue({
      name: "TransactionCanceledException",
      CancellationReasons: [{ Code: "TransactionConflict" }],
    });
    await expect(repository(send).putEvents([event])).rejects.toMatchObject({
      name: "TransactionCanceledException",
    });
  });
  it("writes the proof-specific tombstone first, deletes only owned rows and follows all GSI pages", async () => {
    const send = vi.fn();
    let page = 0;
    send.mockImplementation(async (command: unknown) => {
      if (command instanceof QueryCommand)
        return ++page === 1
          ? {
              Items: [
                { pk: "one", sk: "EVENT", data: event },
                { pk: "other-owner", sk: "EVENT", data: { ...event, owner: "0".repeat(64) } },
              ],
              LastEvaluatedKey: { pk: "cursor", sk: "EVENT" },
            }
          : { Items: [{ pk: "two", sk: "EVENT", data: event }] };
      return {};
    });
    expect(await repository(send).deleteVisitorEvents(event.visitor_id, event.owner!)).toBe(2);
    expect(send.mock.calls[0]![0]).toBeInstanceOf(PutCommand);
    expect(send.mock.calls.filter(([c]) => c instanceof QueryCommand)).toHaveLength(2);
    expect(
      send.mock.calls
        .filter(([c]) => c instanceof DeleteCommand)
        .map(([c]) => (c as DeleteCommand).input.Key!.pk),
    ).toEqual(["one", "two"]);
  });
});
