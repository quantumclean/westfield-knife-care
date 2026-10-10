/** Errors the HTTP layer maps onto status codes. */
export class NotFoundError extends Error {
  override name = "NotFoundError";
}

/** Deliberately uninformative: unknown order, missing or wrong credential all look the same. */
export class ForbiddenError extends Error {
  override name = "ForbiddenError";
}

export class ConflictError extends Error {
  override name = "ConflictError";
}

export class ValidationError extends Error {
  override name = "ValidationError";
  readonly issues: string[];
  constructor(issues: string[]) {
    super(issues.join("; "));
    this.issues = issues;
  }
}
