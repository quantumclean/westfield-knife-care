import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { AnalyticsEvent, Order, WaitlistEntry } from "@wkc/shared";
import type { ListEventsOptions, ListOrdersOptions, Repository } from "./types.ts";

/**
 * Single-table DynamoDB layout (see infrastructure/lambda/main.tf):
 *
 *   pk                sk        gsi1pk           gsi1sk       gsi2pk        gsi2sk
 *   ORDER#<id>        ORDER     EMAIL#<email>    created_at   ENTITY#order  created_at
 *   WAITLIST#<id>     WAITLIST  EMAIL#<email>    created_at   ENTITY#wait   created_at
 *   EVENT#<id>        EVENT     VISITOR#<vid>    created_at   ENTITY#event  created_at
 *
 * gsi1 answers "what has this email done", gsi2 lists an entity type newest
 * first. Events carry a TTL so the table does not grow forever.
 */
const EVENT_TTL_DAYS = 180;

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
    await this.put({
      pk: `ORDER#${order.id}`,
      sk: "ORDER",
      gsi1pk: `EMAIL#${order.customer.email}`,
      gsi1sk: order.created_at,
      gsi2pk: "ENTITY#order",
      gsi2sk: order.created_at,
      entity: "order",
      data: order,
    });
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const result = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: { pk: `ORDER#${id}`, sk: "ORDER" } }),
    );
    return result.Item ? (result.Item.data as Order) : undefined;
  }

  async listOrders(options: ListOrdersOptions = {}): Promise<Order[]> {
    const items = await this.queryEntity("order", options.limit);
    const orders = items.map((i) => i.data as Order);
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
    return (result.Items ?? []).map((i) => i.data as Order);
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

  async putEvent(event: AnalyticsEvent): Promise<void> {
    const expires_at = Math.floor(
      (new Date(event.created_at).getTime() + EVENT_TTL_DAYS * 86_400_000) / 1000,
    );
    await this.put({
      pk: `EVENT#${event.id}`,
      sk: "EVENT",
      gsi1pk: `VISITOR#${event.visitor_id}`,
      gsi1sk: event.created_at,
      gsi2pk: "ENTITY#event",
      gsi2sk: event.created_at,
      entity: "event",
      expires_at,
      data: event,
    });
  }

  async listEvents(options: ListEventsOptions = {}): Promise<AnalyticsEvent[]> {
    const items = await this.queryEntity("event", options.limit, options.since);
    return items.map((i) => i.data as AnalyticsEvent);
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
