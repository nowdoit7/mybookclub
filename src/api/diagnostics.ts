export interface GenerationDiagnostic {
  id: string;
  timestamp: string;
  endpoint: string;
  outcome: "pending" | "success" | "failure";
  status: number;
  durationMs: number;
  code?: string;
  requestId?: string;
  upstreamRequestId?: string;
  detail?: string;
}

const MAX_EVENTS = 20;
const listeners = new Set<() => void>();
let events: GenerationDiagnostic[] = [];

function emit(): void {
  for (const listener of listeners) listener();
}

export function recordGenerationDiagnostic(event: GenerationDiagnostic): void {
  events = [event, ...events].slice(0, MAX_EVENTS);
  emit();
}

export function startGenerationDiagnostic(endpoint: string): string {
  const id = crypto.randomUUID();
  recordGenerationDiagnostic({
    id,
    timestamp: new Date().toISOString(),
    endpoint,
    outcome: "pending",
    status: 0,
    durationMs: 0,
  });
  return id;
}

export function completeGenerationDiagnostic(
  id: string,
  completion: Omit<GenerationDiagnostic, "id" | "timestamp" | "endpoint">,
): void {
  const pending = events.find((event) => event.id === id);
  if (!pending) return;
  events = events.map((event) =>
    event.id === id
      ? {
          ...pending,
          ...completion,
        }
      : event,
  );
  emit();
}

export function getGenerationDiagnostics(): GenerationDiagnostic[] {
  return events;
}

export function subscribeToGenerationDiagnostics(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearGenerationDiagnostics(): void {
  events = [];
  emit();
}

export function formatGenerationDiagnostics(): string {
  return [
    "The Reading Table diagnostics",
    `Generated: ${new Date().toISOString()}`,
    "Contains operational metadata only; request bodies, prompts, messages, and API keys are excluded.",
    "",
    JSON.stringify(events, null, 2),
  ].join("\n");
}
