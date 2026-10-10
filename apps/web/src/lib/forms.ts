import type { RefObject } from "preact";
import { useEffect } from "preact/hooks";

/**
 * After a failed submit, move focus to the first field marked invalid so the
 * keyboard and screen reader user lands on the problem. Runs on every new
 * `errors` object, so a second failed attempt re-focuses too.
 */
export function useFocusFirstInvalid(
  formRef: RefObject<HTMLFormElement>,
  errors: Record<string, string>,
): void {
  useEffect(() => {
    if (Object.keys(errors).length === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors, formRef]);
}

/** Text for a polite live region: how many fields need attention, or nothing. */
export function errorSummary(errors: Record<string, string>): string {
  const count = Object.keys(errors).length;
  if (count === 0) return "";
  return count === 1 ? "1 field needs attention." : `${count} fields need attention.`;
}
