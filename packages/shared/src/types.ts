/**
 * Domain records for Westfield Knife Care.
 *
 * Persisted records and API payloads use snake_case so they map 1:1 onto
 * spreadsheets, SQL and analytics tools without a translation layer.
 */

export type Currency = "usd";

export type ExperimentStatus = "draft" | "active" | "paused" | "concluded";

/** Copy bundle shown to a visitor. Changing words = new offer version. */
export interface OfferVersion {
  id: string;
  /** Headline shown above the fold and on print material. */
  headline: string;
  /** Word in the headline to emphasise visually, if any. */
  headline_highlight?: string;
  subhead: string;
  /** Short turnaround promise, e.g. "Back within 48 hours". */
  turnaround_promise: string;
  cta_primary: string;
  cta_secondary: string;
  /** One-line value proposition used in pricing card and flyer. */
  value_line: string;
}

/** Numbers shown to a visitor. Changing numbers = new price version. */
export interface PriceVersion {
  id: string;
  currency: Currency;
  /** Price of the bundle that includes `knives_included` knives. */
  bundle_price_cents: number;
  knives_included: number;
  /** Charged per knife above `knives_included`. */
  extra_knife_price_cents: number;
  /** Hard cap enforced client and server side. */
  max_knives: number;
}

/**
 * An experiment pairs an offer (copy) with a price and receives a share of
 * traffic. Orders snapshot the offer and price version at creation time so
 * later edits never rewrite history.
 */
export interface Experiment {
  id: string;
  name: string;
  hypothesis: string;
  status: ExperimentStatus;
  offer_version: OfferVersion["id"];
  price_version: PriceVersion["id"];
  /** Relative traffic weight among active experiments (0 disables). */
  weight: number;
  started_at?: string;
  ended_at?: string;
}

/** Fully resolved experiment: ids replaced by their definitions. */
export interface ResolvedExperiment {
  experiment: Experiment;
  offer: OfferVersion;
  price: PriceVersion;
}

export const ACQUISITION_CHANNELS = [
  "print",
  "social",
  "referral",
  "search",
  "direct",
  "partner",
  "other",
] as const;
export type AcquisitionChannel = (typeof ACQUISITION_CHANNELS)[number];

/** Where a visit came from. `source` is fine-grained, `channel` is the bucket. */
export interface Attribution {
  /** Free-form tag such as "flyer-v1-qr" or "nextdoor-post-2". */
  source: string;
  acquisition_channel: AcquisitionChannel;
}

export const PAYMENT_STATUSES = ["pending", "paid", "failed", "expired", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PICKUP_STATUSES = ["scheduled", "picked_up", "missed", "cancelled"] as const;
export type PickupStatus = (typeof PICKUP_STATUSES)[number];

export const RETURN_STATUSES = ["pending", "returned"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const REPEAT_INTENTS = ["unknown", "yes", "maybe", "no"] as const;
export type RepeatIntent = (typeof REPEAT_INTENTS)[number];

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
}

export interface Customer {
  name: string;
  email: string;
  phone?: string;
  address: Address;
}

/** Server-computed price breakdown stored on the order. */
export interface Quote {
  currency: Currency;
  knives_included: number;
  bundle_price_cents: number;
  extra_knives: number;
  extra_knife_price_cents: number;
  extra_knives_cents: number;
  total_cents: number;
}

/**
 * The order is the unit of experimentation. Every field a later analysis
 * could want lives on the record itself so exports are self-contained.
 */
export interface Order {
  id: string;
  created_at: string;
  updated_at: string;

  customer: Customer;

  /** Experiment context, snapshotted at creation. */
  experiment_id: string;
  offer_version: string;
  price_version: string;

  /** Acquisition context. */
  source: string;
  acquisition_channel: AcquisitionChannel;
  visitor_id?: string;

  /** What was bought. */
  number_of_knives: number;
  /** ISO date (YYYY-MM-DD) of the scheduled pickup / care day. */
  care_day: string;
  quote: Quote;
  notes?: string;

  /** Fulfilment state. */
  payment_status: PaymentStatus;
  pickup_status: PickupStatus;
  return_status: ReturnStatus;
  paid_at?: string;
  picked_up_at?: string;
  returned_at?: string;
  /** Hours between pickup and return; set when return is recorded. */
  time_to_fulfill_hours?: number;

  /** Retention signals. */
  repeat_intent: RepeatIntent;
  /** True when the same email had an earlier paid order. */
  is_repeat_customer: boolean;
  /** True once the same email places a later paid order. */
  actual_repeat_purchase: boolean;

  /** Payment provider references. */
  stripe_checkout_session_id?: string;
  stripe_payment_intent_id?: string;
}

export const SERVICE_INTERESTS = ["sharpening", "always_sharp", "both"] as const;
export type ServiceInterest = (typeof SERVICE_INTERESTS)[number];

export const CADENCES = ["weekly", "biweekly", "monthly"] as const;
export type Cadence = (typeof CADENCES)[number];

/** Always Sharp pilot waitlist signup. */
export interface WaitlistEntry {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone?: string;
  service_interest: ServiceInterest;
  cadence: Cadence;
  notes?: string;

  experiment_id: string;
  offer_version: string;
  price_version: string;
  source: string;
  acquisition_channel: AcquisitionChannel;
  visitor_id?: string;
}

/** First-party analytics event. */
export interface AnalyticsEvent {
  id: string;
  created_at: string;
  name: string;
  visitor_id: string;
  experiment_id: string;
  offer_version: string;
  price_version: string;
  source: string;
  acquisition_channel: AcquisitionChannel;
  page: string;
  props: Record<string, string | number | boolean>;
}
