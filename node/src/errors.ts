/** Errors raised by found-sdk. */

export class FoundSdkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FoundSdkError";
  }
}

export class FoundConfigError extends FoundSdkError {
  constructor(message: string) {
    super(message);
    this.name = "FoundConfigError";
  }
}

/** Inbound request failed authentication. Never carries the key. */
export class FoundAuthError extends FoundSdkError {
  constructor(message: string) {
    super(message);
    this.name = "FoundAuthError";
  }
}
