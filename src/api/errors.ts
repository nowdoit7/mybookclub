export class MissingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingConfigurationError";
  }
}

export class ModelRefusalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelRefusalError";
  }
}

export class IncompleteGenerationError extends Error {
  constructor(readonly reason: string | undefined) {
    super("The model response ended before the structured output was complete.");
    this.name = "IncompleteGenerationError";
  }
}

export class InvalidStructuredOutputError extends Error {
  constructor() {
    super("The model response did not contain parsed structured output.");
    this.name = "InvalidStructuredOutputError";
  }
}
