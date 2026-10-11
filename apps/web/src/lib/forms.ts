import type { RefObject } from "preact";
import { useEffect } from "preact/hooks";

/**
 * After a failed submit, move focus to the first field marked invalid so the
 * keyboard and screen reader user lands on the problem.
 *
 * `reportedAt` is a counter the form bumps once per submit that reported
 * errors, so a second failed attempt re-focuses too. It is deliberately not
 * the error map: a form that checks a field as it is typed, blurred or filled
 * in from an address suggestion rewrites that map while the customer is still
 * working, and focusing then would pull the cursor out of the field they are
 * fixing — or out of the address search box when a suggestion clears one
 * message but leaves another.
 */
export function useFocusFirstInvalid(
  formRef: RefObject<HTMLFormElement>,
  reportedAt: number,
): void {
  useEffect(() => {
    if (reportedAt === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [reportedAt, formRef]);
}

/** Text for a polite live region: how many fields need attention, or nothing. */
export function errorSummary(errors: Record<string, string>): string {
  const count = Object.keys(errors).length;
  if (count === 0) return "";
  return count === 1 ? "1 field needs attention." : `${count} fields need attention.`;
}
