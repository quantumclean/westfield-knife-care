import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  MAX_EVENTS_PER_VIEW,
  type AnalyticsEvent,
  type Order,
  type WaitlistEntry,
} from "@wkc/shared";
import { commerceFromRecords, type CommerceArm } from "./commerce-report.ts";
import {
  profilesFromEvents,
  reportFromEvents,
  type AnalyticsReport,
  type ReportWindow,
  type VisitorProfile,
} from "./analytics-report.ts";
import {
  OrderWriteConflict,
  compareEventsDesc,
  eventExpiresAt,
  isBeforeCursor,
  type ListEventsOptions,
  type ListOrdersOptions,
  type Repository,
  type CheckoutRecord,
} from "./types.ts";

/**
 * Single-table DynamoDB layout (see infrastructure/lambda/main.tf):
 *
 *   pk                sk        gsi1pk           gsi1sk       gsi2pk        gsi2sk
 *   ORDER#<id>        ORDER     EMAIL#<email>    created_at   ENTITY#order  created_at
 *   WAITLIST#<id>     WAITLIST  EMAIL#<email>    created_at   ENTITY#wait   created_at
 *   EVENT#<id>        EVENT     VISITOR#<vid>    created_at   ENTITY#event  created_at
 *
 * gsi1 answers "what has this email done", gsi2 lists an entity type newest
 * first. Events carry a TTL (EVENT_RETENTION_DAYS) so the table does not grow forever.
 * Legacy AWS build only; Cloudflare uses D1Repository.
 */

type Item = Record<string, unknown>;

export class DynamoRepository implements Repository {
  private readonly doc: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(tableName: string, client: DynamoDBClient = new DynamoDBClient({})) {
    this.tableName = tableName;
    this.doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async putOrder(order: Order): Promise<void> {
    const previous = order.revision;
    const next = (previous ?? 0) + 1;
    const item = {
      pk: `ORDER#${order.id}`,
      sk: "ORDER",
      gsi1pk: `EMAIL#${order.customer.email}`,
      gsi1sk: order.created_at,
      gsi2pk: "ENTITY#order",
      gsi2sk: order.created_at,
      entity: "order",
      data: { ...order, revision: next },
    };
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression:
            previous === undefined
              ? "attribute_not_exists(pk)"
              : previous === 0
                ? "attribute_exists(pk) AND (attribute_not_exists(#data.#revision) OR #data.#revision = :previous)"
                : "#data.#revision = :previous",
          ...(previous === undefined
            ? {}
            : {
                ExpressionAttributeNames: { "#data": "data", "#revision": "revision" },
                ExpressionAttributeValues: { ":previous": previous },
              }),
        }),
      );
    } catch (error) {
      if ((error as { name?: string }).name === "ConditionalCheckFailedException")
        throw new OrderWriteConflict("Order changed during update");
      throw error;
    }
    order.revision = next;
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: `ORDER#${id}`, sk: "ORDER" },
        ConsistentRead: true,
      }),
    );
    if (!result.Item) return undefined;
    const order = result.Item.data as Order;
    order.revision ??= 0;
    return order;
  }

  async getCheckout(key: string): Promise<CheckoutRecord | undefined> {
    const result = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: `CHECKOUT#${key}`, sk: "CHECKOUT" },
        ConsistentRead: true,
      }),
    );
    return result.Item ? (result.Item.data as CheckoutRecord) : undefined;
  }

  async claimCheckout(record: CheckoutRecord, order: Order): Promise<CheckoutRecord> {
    const initial = { ...order, revision: 1 };
    try {
      await this.doc.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tableName,
                Item: { pk: `CHECKOUT#${record.key}`, sk: "CHECKOUT", data: record },
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: {
                  pk: `ORDER#${order.id}`,
                  sk: "ORDER",
                  gsi1pk: `EMAIL#${order.customer.email}`,
                  gsi1sk: order.created_at,
                  gsi2pk: "ENTITY#order",
                  gsi2sk: order.created_at,
                  entity: "order",
                  data: initial,
                },
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
          ],
        }),
      );
      return record;
    } catch (error) {
      if ((error as { name?: string }).name !== "TransactionCanceledException") throw error;
      const winner = await this.getCheckout(record.key);
      if (!winner) throw new Error("Checkout intent missing");
      return winner;
    }
  }

  async saveCheckoutSession(key: string, sessionId: string): Promise<void> {
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { pk: `CHECKOUT#${key}`, sk: "CHECKOUT" },
          UpdateExpression: "SET #data.#session = :session",
          ConditionExpression: "attribute_exists(pk) AND attribute_not_exists(#data.#session)",
          ExpressionAttributeNames: { "#data": "data", "#session": "session_id" },
          ExpressionAttributeValues: { ":session": sessionId },
        }),
      );
    } catch (error) {
      if ((error as { name?: string }).name !== "ConditionalCheckFailedException") throw error;
      const record = await this.getCheckout(key);
      if (!record?.session_id || record.session_id !== sessionId)
        throw new Error("Checkout session changed or intent missing");
    }
  }

  async listOrders(options: ListOrdersOptions = {}): Promise<Order[]> {
    const items = await this.queryEntity("order", options.limit);
    const orders = items.map((i) => ({ revision: 0, ...(i.data as Order) }));
    return options.experiment_id
      ? orders.filter((o) => o.experiment_id === options.experiment_id)
      : orders;
  }

  async findOrdersByEmail(email: string): Promise<Order[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :pk",
        FilterExpression: "entity = :entity",
        ExpressionAttributeValues: { ":pk": `EMAIL#${email}`, ":entity": "order" },
        ScanIndexForward: false,
      }),
    );
    return (result.Items ?? []).map((i) => ({ revision: 0, ...(i.data as Order) }));
  }

  async putWaitlistEntry(entry: WaitlistEntry): Promise<void> {
    await this.put({
      pk: `WAITLIST#${entry.id}`,
      sk: "WAITLIST",
      gsi1pk: `EMAIL#${entry.email}`,
      gsi1sk: entry.created_at,
      gsi2pk: "ENTITY#waitlist",
      gsi2sk: entry.created_at,
      entity: "waitlist",
      data: entry,
    });
  }

  async listWaitlist(): Promise<WaitlistEntry[]> {
    const items = await this.queryEntity("waitlist");
    return items.map((i) => i.data as WaitlistEntry);
  }

  async putEvents(events: AnalyticsEvent[]): Promise<void> {
    for (const event of events) {
      const owner = event.owner ?? "";
      const view =
        event.view_id === "legacy-v1" ? `legacy-${event.visitor_id}` : (event.view_id ?? event.id);
      await this.doc
        .send(
          new TransactWriteCommand({
            TransactItems: [
              {
                ConditionCheck: {
                  TableName: this.tableName,
                  Key: { pk: `DELETE#${event.visitor_id}#${owner}`, sk: "DELETE" },
                  ConditionExpression: "attribute_not_exists(pk)",
                },
              },
              {
                Update: {
                  TableName: this.tableName,
                  Key: { pk: `VIEW#${view}`, sk: "VIEW" },
                  UpdateExpression:
                    "SET hits = if_not_exists(hits, :zero) + :one, visitor_id = :vid, #owner = :owner, exp = :exp, #source = :source, channel = :channel, page = :page, expires_at = :expiry",
                  ConditionExpression:
                    "attribute_not_exists(pk) OR (hits < :limit AND visitor_id = :vid AND #owner = :owner AND exp = :exp AND #source = :source AND channel = :channel AND page = :page)",
                  ExpressionAttributeNames: { "#owner": "owner", "#source": "source" },
                  ExpressionAttributeValues: {
                    ":zero": 0,
                    ":one": 1,
                    ":limit": MAX_EVENTS_PER_VIEW,
                    ":vid": event.visitor_id,
                    ":owner": owner,
                    ":exp": event.experiment_id,
                    ":source": event.source,
                    ":channel": event.acquisition_channel,
                    ":page": event.page,
                    ":expiry": eventExpiresAt(event.created_at),
                  },
                },
              },
              {
                Put: {
                  TableName: this.tableName,
                  Item: {
                    pk: `EVENT#${event.id}`,
                    sk: "EVENT",
                    gsi1pk: `VISITOR#${event.visitor_id}`,
                    gsi1sk: event.created_at,
                    gsi2pk: "ENTITY#event",
                    gsi2sk: event.created_at,
                    entity: "event",
                    expires_at: eventExpiresAt(event.created_at),
                    data: event,
                  },
                  ConditionExpression: "attribute_not_exists(pk)",
                },
              },
            ],
          }),
        )
        .catch((error: unknown) => {
          const failure = error as { name?: string; CancellationReasons?: { Code?: string }[] };
          // Idempotent retries, full views and deletion tombstones skip events; real store errors propagate.
          if (
            failure.name !== "TransactionCanceledException" ||
            !failure.CancellationReasons?.some((r) => r.Code === "ConditionalCheckFailed")
          )
            throw error;
        });
    }
  }

  async listEvents(options: ListEventsOptions = {}): Promise<AnalyticsEvent[]> {
    const now = Math.floor(Date.now() / 1000);
    const limit = Math.min(options.limit ?? 5000, 5000);
    // Over-fetch from the upper bound, then apply the exact cursor and window in memory.
    const items = await this.queryEntity("event", undefined, options.since);
    return items
      .map((i) => i.data as AnalyticsEvent)
      .filter((e) => eventExpiresAt(e.created_at) > now)
      .filter((e) => !options.until || e.created_at < options.until)
      .filter((e) => !options.before || isBeforeCursor(e, options.before))
      .sort(compareEventsDesc)
      .slice(0, limit);
  }

  async deleteVisitorEvents(visitorId: string, ownerHash: string): Promise<number> {
    // Publish the tombstone before scanning. Transactional ingestion cannot race past it.
    await this.put({
      pk: `DELETE#${visitorId}#${ownerHash}`,
      sk: "DELETE",
      expires_at: Math.floor(Date.now() / 1000) + 90 * 86400,
    });
    let startKey: Item | undefined;
    let removed = 0;
    do {
      const result = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: "gsi1",
          KeyConditionExpression: "gsi1pk = :pk",
          ExpressionAttributeValues: { ":pk": `VISITOR#${visitorId}` },
          ExclusiveStartKey: startKey,
        }),
      );
      for (const item of result.Items ?? []) {
        if ((item.data as AnalyticsEvent | undefined)?.owner !== ownerHash) continue;
        await this.doc.send(
          new DeleteCommand({ TableName: this.tableName, Key: { pk: item.pk, sk: item.sk } }),
        );
        removed++;
      }
      startKey = result.LastEvaluatedKey;
    } while (startKey);
    return removed;
  }

  /** Legacy AWS build: aggregates in the Lambda from a full listing (not used on Cloudflare). */
  async analyticsReport(window: ReportWindow = {}): Promise<AnalyticsReport> {
    const items = await this.queryEntity("event", undefined, window.since);
    const events = items
      .map((i) => i.data as AnalyticsEvent)
      .filter((e) => !window.until || e.created_at < window.until);
    return reportFromEvents(events);
  }

  async commerceReport(window: ReportWindow = {}): Promise<CommerceArm[]> {
    const [orders, waitlist, events] = await Promise.all([
      this.listOrders(),
      this.listWaitlist(),
      this.queryEntity("event", undefined, window.since),
    ]);
    return commerceFromRecords(
      orders,
      waitlist,
      events.map((i) => i.data as AnalyticsEvent),
      window,
    );
  }

  async visitorProfiles(
    visitorIds: string[],
    window: ReportWindow = {},
  ): Promise<VisitorProfile[]> {
    const items = await this.queryEntity("event");
    return profilesFromEvents(
      items
        .map((i) => i.data as AnalyticsEvent)
        .filter(
          (e) =>
            (!window.since || e.created_at >= window.since) &&
            (!window.until || e.created_at < window.until),
        ),
      visitorIds,
    );
  }

  private async put(item: Item): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.tableName, Item: item }));
  }

  /** Newest-first listing of one entity type, paging until `limit` or exhaustion. */
  private async queryEntity(entity: string, limit?: number, since?: string): Promise<Item[]> {
    const items: Item[] = [];
    let startKey: Item | undefined;
    do {
      const result = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: "gsi2",
          KeyConditionExpression: since ? "gsi2pk = :pk AND gsi2sk >= :since" : "gsi2pk = :pk",
          ExpressionAttributeValues: since
            ? { ":pk": `ENTITY#${entity}`, ":since": since }
            : { ":pk": `ENTITY#${entity}` },
          ScanIndexForward: false,
          ExclusiveStartKey: startKey,
          Limit: limit ? Math.max(1, limit - items.length) : undefined,
        }),
      );
      items.push(...(result.Items ?? []));
      startKey = result.LastEvaluatedKey;
    } while (startKey && (!limit || items.length < limit));
    return items;
  }
}
