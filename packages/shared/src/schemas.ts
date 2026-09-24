import { z } from "zod";
import {
  ACQUISITION_CHANNELS,
  CADENCES,
  PICKUP_STATUSES,
  REPEAT_INTENTS,
  RETURN_STATUSES,
  SERVICE_INTERESTS,
} from "./types.ts";

/**
 * Validation schemas shared by the web forms and the API. The API is the
 * authority: it re-validates everything and recomputes prices.
 */

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const phoneSchema = z
  .string()
  .trim()
  .max(30)
  .refine((value) => {
    const digits = value.replace(/\D/g, "").length;
    return /^[+\d(][\d\s().-]*$/.test(value) && digits >= 10 && digits <= 15;
  }, "Enter a valid phone number");
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const experimentIdSchema = z.string().regex(/^experiment-\d{3,}$/);
export const sourceSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{0,63}$/);
export const acquisitionChannelSchema = z.enum(ACQUISITION_CHANNELS);
export const visitorIdSchema = z.string().trim().min(8).max(64);

export const addressSchema = z.object({
  line1: trimmed(120),
  line2: optionalTrimmed(120),
  city: trimmed(80),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use the two-letter state code"),
  zip: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit ZIP code"),
});

export const customerSchema = z.object({
  name: trimmed(120),
  email: emailSchema,
  phone: phoneSchema.optional(),
  address: addressSchema,
});

/** Experiment and acquisition context attached to orders, signups and events. */
export const contextSchema = z.object({
  experiment_id: experimentIdSchema,
  source: sourceSchema.default("direct"),
  acquisition_channel: acquisitionChannelSchema.default("direct"),
  visitor_id: visitorIdSchema.optional(),
});
export type Context = z.infer<typeof contextSchema>;

export const createOrderSchema = contextSchema.extend({
  customer: customerSchema,
  number_of_knives: z.number().int().min(1).max(50),
  care_day: isoDateSchema,
  notes: optionalTrimmed(500),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const createWaitlistSchema = contextSchema.extend({
  name: trimmed(120),
  email: emailSchema,
  phone: phoneSchema.optional(),
  service_interest: z.enum(SERVICE_INTERESTS),
  cadence: z.enum(CADENCES),
  notes: optionalTrimmed(500),
});
export type CreateWaitlistInput = z.infer<typeof createWaitlistSchema>;

const eventPropValue = z.union([z.string().max(200), z.number(), z.boolean()]);

export const createEventSchema = contextSchema.extend({
  name: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{2,49}$/),
  visitor_id: visitorIdSchema,
  page: z.string().trim().max(200).default("/"),
  props: z.record(z.string().max(50), eventPropValue).default({}),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

/** Operator updates recorded from the field: pickups, returns, feedback. */
export const updateOrderSchema = z
  .object({
    pickup_status: z.enum(PICKUP_STATUSES).optional(),
    return_status: z.enum(RETURN_STATUSES).optional(),
    repeat_intent: z.enum(REPEAT_INTENTS).optional(),
    notes: optionalTrimmed(500),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to update",
  });
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

/** Customer-submitted feedback from the thank-you page or a follow-up link. */
export const orderFeedbackSchema = z.object({
  repeat_intent: z.enum(REPEAT_INTENTS.filter((v) => v !== "unknown") as ["yes", "maybe", "no"]),
});
export type OrderFeedbackInput = z.infer<typeof orderFeedbackSchema>;

/** Flatten zod issues into "path: message" strings for API responses. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
