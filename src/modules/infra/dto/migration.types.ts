// Row shapes for the data-DB export/import migration blob. Shared by the
// infra controller (export) and ImportDataDto (import) so both agree on the
// structure without a circular import.

export interface SessionRow {
  id: string;
  name: string;
  status: string;
  phone: string | null;
  pushName: string | null;
  config: string | Record<string, unknown>;
  proxyUrl: string | null;
  proxyType: string | null;
  connectedAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookRow {
  id: string;
  sessionId: string;
  url: string;
  events: string | string[];
  secret: string | null;
  headers: string | Record<string, string>;
  active: boolean;
  retryCount: number;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRow {
  id: string;
  sessionId: string;
  messageId: string;
  chatId: string;
  direction: string;
  type: string;
  content: string | Record<string, unknown>;
  status: string;
  metadata: string | Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MessageBatchRow {
  id: string;
  batchId: string;
  sessionId: string;
  status: string;
  messages: string | unknown[];
  options: string | Record<string, unknown>;
  progress: string | Record<string, unknown>;
  results: string | unknown[];
  currentIndex: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface MigrationTables {
  sessions: SessionRow[];
  webhooks: WebhookRow[];
  messages: MessageRow[];
  messageBatches: MessageBatchRow[];
}
