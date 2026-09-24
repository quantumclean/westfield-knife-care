# Data model

Records use snake_case and are stored as-is in DynamoDB (`data` attribute)
and returned as-is from the admin endpoints, so an export is analysis-ready.
Types live in `packages/shared/src/types.ts`.

## Order

The order is the unit of experimentation.

| field                                    | type                                                                                                                        | set by                                | notes                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| `id`                                     | uuid                                                                                                                        | API                                   |                                                           |
| `created_at`, `updated_at`               | ISO timestamp                                                                                                               | API                                   |                                                           |
| `customer`                               | `{ name, email, phone?, address }`                                                                                          | booking form                          | email lower-cased; drives repeat detection                |
| `experiment_id`                          | string                                                                                                                      | browser → validated by API            | falls back to the default when not live                   |
| `offer_version`                          | string                                                                                                                      | API from registry                     | snapshot, never rewritten                                 |
| `price_version`                          | string                                                                                                                      | API from registry                     | snapshot, never rewritten                                 |
| `source`                                 | string                                                                                                                      | browser attribution                   | e.g. `flyer-v1-qr`                                        |
| `acquisition_channel`                    | print \| social \| referral \| search \| direct \| partner \| other                                                         | browser attribution                   |                                                           |
| `visitor_id`                             | string                                                                                                                      | browser                               | joins orders to events                                    |
| `number_of_knives`                       | integer                                                                                                                     | booking form                          | 1..`max_knives` of the price version                      |
| `care_day`                               | YYYY-MM-DD                                                                                                                  | booking form                          | must be a bookable care day at creation                   |
| `quote`                                  | `{ currency, knives_included, bundle_price_cents, extra_knives, extra_knife_price_cents, extra_knives_cents, total_cents }` | API                                   | what Stripe charged                                       |
| `notes`                                  | string                                                                                                                      | customer / operator                   |                                                           |
| `payment_status`                         | pending \| paid \| failed \| expired \| refunded                                                                            | Stripe webhook                        |                                                           |
| `pickup_status`                          | scheduled \| picked_up \| missed \| cancelled                                                                               | operator                              | `picked_up` stamps `picked_up_at`                         |
| `return_status`                          | pending \| returned                                                                                                         | operator                              | `returned` stamps `returned_at` and computes fulfil time  |
| `paid_at`, `picked_up_at`, `returned_at` | ISO timestamp                                                                                                               | webhook / operator                    |                                                           |
| `time_to_fulfill_hours`                  | number                                                                                                                      | API                                   | `returned_at − picked_up_at` (falls back to paid/created) |
| `repeat_intent`                          | unknown \| yes \| maybe \| no                                                                                               | customer (thank-you page) or operator | asked after return                                        |
| `is_repeat_customer`                     | boolean                                                                                                                     | API                                   | same email had an earlier **paid** order                  |
| `actual_repeat_purchase`                 | boolean                                                                                                                     | API                                   | set on the earlier order when a later one is **paid**     |
| `stripe_checkout_session_id`             | string                                                                                                                      | API / webhook                         |                                                           |
| `stripe_payment_intent_id`               | string                                                                                                                      | webhook                               |                                                           |

Lifecycle:

```
create (pending/scheduled/pending) → webhook paid → operator picked_up → operator returned (+ time_to_fulfill)
                                   ↘ expired / failed            → feedback: repeat_intent
                                                                  → later paid order: actual_repeat_purchase
```

## Waitlist entry

`id, created_at, name, email, phone?, service_interest (sharpening | always_sharp | both), cadence (weekly | biweekly | monthly), notes?` plus the same experiment and attribution context as an order.

## Analytics event

`id, created_at, name, visitor_id, experiment_id, offer_version, price_version, source, acquisition_channel, page, props`. See `docs/analytics-events.md`. Expire after 180 days.

## Storage layout (DynamoDB single table)

| item     | pk              | sk         | gsi1pk (by person)  | gsi1sk       | gsi2pk (by type)  | gsi2sk       |
| -------- | --------------- | ---------- | ------------------- | ------------ | ----------------- | ------------ |
| order    | `ORDER#<id>`    | `ORDER`    | `EMAIL#<email>`     | `created_at` | `ENTITY#order`    | `created_at` |
| waitlist | `WAITLIST#<id>` | `WAITLIST` | `EMAIL#<email>`     | `created_at` | `ENTITY#waitlist` | `created_at` |
| event    | `EVENT#<id>`    | `EVENT`    | `VISITOR#<visitor>` | `created_at` | `ENTITY#event`    | `created_at` |

`gsi1` answers "what has this email done" (repeat detection), `gsi2` lists
one entity type newest-first (exports and the summary). Both are fine at
thousands of rows per day; when the summary gets slow, materialise it
nightly instead of adding indexes.

## Privacy

- The public `GET /orders/:id` view returns first name, status, care day and
  total only. Ids are random UUIDs.
- Admin endpoints require the shared key and are meant for the operator's
  terminal, not the browser.
- Customer data lives only in DynamoDB (PITR on, encrypted) and Stripe. Do
  not export it into the repository, issues or chat.
