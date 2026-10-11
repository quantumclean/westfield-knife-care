export interface UnpaidView {
  heading: string;
  message: string;
}

/**
 * What the thank-you page says for an order that is neither `paid` nor
 * `pending`. Success wording must never appear here: the page only treats an
 * order as booked when the backend reports `paid`. Unrecognised statuses get a
 * neutral message and are never echoed to the customer.
 */
export function describeUnpaidStatus(status: string, supportEmail: string): UnpaidView {
  const contact = `If this is unexpected, email ${supportEmail} and quote the order number below.`;
  switch (status) {
    case "failed":
      return {
        heading: "Payment did not go through",
        message: `Your payment did not go through, so this booking was not made. You can start again from the home page. ${contact}`,
      };
    case "expired":
      return {
        heading: "Checkout expired",
        message: `This checkout expired before payment was completed, so this booking was not made. You can start again from the home page. ${contact}`,
      };
    case "refunded":
      return {
        heading: "Payment refunded",
        message: `This payment has been refunded. ${contact}`,
      };
    default:
      return {
        heading: "We could not confirm this booking",
        message: `We could not confirm the status of this booking. ${contact}`,
      };
  }
}

/** The word on the booking pass stamp. Readable labels only; the raw status is never shown. */
export function stampFor(status: string): string {
  switch (status) {
    case "paid":
      return "Booked";
    case "pending":
      return "Confirming";
    case "refunded":
      return "Refunded";
    default:
      return "Not booked";
  }
}
