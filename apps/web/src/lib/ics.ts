/**
 * A calendar file for the pickup morning, built in the browser.
 *
 * The most likely way a booking fails is no bag at the door, so the event
 * covers the collection window and reminds the evening before. Times are
 * "floating" (no time zone): the window is 8am to 12pm wherever the customer
 * is, which for a Westfield pickup is Eastern time anyway.
 */
export interface PickupEvent {
  orderId: string;
  careDay: string; // YYYY-MM-DD
  knives: number;
  name: string; // business name
  now?: Date;
}

/** RFC 5545 text escaping. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");
}

/** Fold lines longer than 75 octets, as RFC 5545 requires. */
export function foldLine(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function stamp(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

export function pickupIcs({
  orderId,
  careDay,
  knives,
  name,
  now = new Date(),
}: PickupEvent): string {
  const day = careDay.replace(/-/g, "");
  const what = `${knives} ${knives === 1 ? "knife" : "knives"}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${escapeText(name)}//Pickup//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(orderId)}@westfield-knife-care`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${day}T080000`,
    `DTEND:${day}T120000`,
    `SUMMARY:${escapeText(`Knife pickup: leave ${what} at the door`)}`,
    `DESCRIPTION:${escapeText(
      `Leave them wrapped in a bag at your door in the morning. ${name} collects between 8am and 12pm. Order ${orderId}.`,
    )}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT12H",
    `DESCRIPTION:${escapeText("Knife pickup tomorrow morning: put the bag by the door tonight.")}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
