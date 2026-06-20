// Engine-agnostic world records. These mirror the shapes OpenWA's IWhatsAppEngine returns, but
// the simulator owns its own copy so the package never depends on OpenWA. The OpenWA-side adapter
// maps these records onto the engine interface (the same anti-corruption boundary every real engine
// crosses). Ids use the neutral dialect: `<phone>@c.us`, `<lid>@lid`, `<id>@g.us`.

export type Jid = string;

export type WorldMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'voice'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'revoked'
  | 'unknown';

export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface ContactRecord {
  id: Jid;
  phone: string;
  name?: string;
  pushName?: string;
  isMyContact: boolean;
  isBlocked: boolean;
  profilePicUrl?: string;
}

export interface GroupParticipantRecord {
  id: Jid;
  phone: string;
  name?: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export interface GroupRecord {
  id: Jid;
  name: string;
  description?: string;
  owner?: Jid;
  createdAt?: number;
  participants: GroupParticipantRecord[];
  isAnnounce?: boolean;
  linkedParentJID?: string | null;
}

export interface ChatRecord {
  id: Jid;
  name: string;
  isGroup: boolean;
}

export interface ReactionRecord {
  emoji: string;
  senderId: Jid;
  timestamp: number;
}

export interface MessageMedia {
  mimetype: string;
  filename?: string;
  data?: string;
}

export interface MessageRecord {
  id: string;
  chatId: Jid;
  from: Jid;
  to: Jid;
  author?: Jid;
  body: string;
  type: WorldMessageType;
  timestamp: number;
  fromMe: boolean;
  isGroup: boolean;
  mentionedIds?: Jid[];
  isStatusBroadcast?: boolean;
  media?: MessageMedia;
  quotedMessage?: { id: string; body: string };
  location?: { latitude: number; longitude: number; description?: string; address?: string; url?: string };
  reactions: ReactionRecord[];
  ackStatus?: DeliveryStatus;
  revoked?: boolean;
}

// Append-only log. Every mutation to the world is one event with a wall-clock `t` (ms epoch);
// the materialized state at time T is the fold of all events with t <= T.
export type WorldEvent =
  | { kind: 'contact'; t: number; contact: ContactRecord }
  | { kind: 'chat'; t: number; chat: ChatRecord }
  | { kind: 'group'; t: number; group: GroupRecord }
  | { kind: 'message'; t: number; message: MessageRecord }
  | { kind: 'reaction'; t: number; messageId: string; chatId: Jid; senderId: Jid; emoji: string }
  | { kind: 'revoke'; t: number; messageId: string }
  | { kind: 'ack'; t: number; messageId: string; status: DeliveryStatus }
  | { kind: 'block'; t: number; contactId: Jid; blocked: boolean };

export interface Scenario {
  name: string;
  description?: string;
  // The default cursor a Simulation opens at (ms epoch). Omitted = open at the last event.
  checkoutAt?: number;
  // Identity the simulated account presents as (its own phone + display name).
  me: { phone: string; pushName: string };
  events: WorldEvent[];
}
