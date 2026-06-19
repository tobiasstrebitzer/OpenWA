/**
 * Shared webhook delivery contracts. These live here (not in webhook.service.ts) so the queue
 * processor and other consumers depend on a type module rather than on the service implementation.
 */

export interface WebhookPayload {
  event: string;
  timestamp: string;
  sessionId: string;
  idempotencyKey: string;
  deliveryId: string;
  data: Record<string, unknown>;
}

export interface WebhookJobData {
  webhookId: string;
  url: string;
  event: string;
  payload: WebhookPayload;
  signature: string;
  headers: Record<string, string>;
  attempt: number;
  maxRetries: number;
}
