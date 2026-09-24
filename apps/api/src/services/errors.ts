/** Errors the HTTP layer maps onto status codes. */
export class NotFoundError extends Error {
  override name = "NotFoundError";
}

export class ValidationError extends Error {
  override name = "ValidationError";
  readonly issues: string[];
  constructor(issues: string[]) {
    super(issues.join("; "));
    this.issues = issues;
  }
}
