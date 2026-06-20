import {
  CatalogRecord,
  ChannelRecord,
  ContactRecord,
  GroupRecord,
  MessageRecord,
  ProductRecord,
  Scenario,
  StatusRecord,
  WorldEvent,
} from '../world/types';

// The model produces this high-level spec; the compiler turns it into a fully-formed, deterministic
// `Scenario`. Keeping ids, JIDs and timestamps out of the model's hands is what makes generated
// fixtures structurally valid and replayable every time, no matter what the model returns.
export interface GenSpec {
  name: string;
  description: string;
  account: { pushName: string };
  contacts: string[];
  groups: { name: string; description: string; participants: string[] }[];
  conversations: { with: string; messages: { from: string; text: string }[] }[];
  labels: string[];
  channels: { name: string; description: string; subscribed: boolean; posts: string[] }[];
  statuses: { from: string; text: string }[];
  catalog: { name: string; description: string; products: { name: string; description: string; price: number }[] };
}

// JSON Schema for structured output. Structured outputs disallow length/numeric constraints and require
// every object to set additionalProperties:false and list all properties in `required` - so the schema
// below is intentionally flat and constraint-free.
export const GEN_SPEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name',
    'description',
    'account',
    'contacts',
    'groups',
    'conversations',
    'labels',
    'channels',
    'statuses',
    'catalog',
  ],
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    account: {
      type: 'object',
      additionalProperties: false,
      required: ['pushName'],
      properties: { pushName: { type: 'string' } },
    },
    contacts: { type: 'array', items: { type: 'string' } },
    groups: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description', 'participants'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          participants: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    conversations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['with', 'messages'],
        properties: {
          with: { type: 'string' },
          messages: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['from', 'text'],
              properties: { from: { type: 'string' }, text: { type: 'string' } },
            },
          },
        },
      },
    },
    labels: { type: 'array', items: { type: 'string' } },
    channels: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description', 'subscribed', 'posts'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          subscribed: { type: 'boolean' },
          posts: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    statuses: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'text'],
        properties: { from: { type: 'string' }, text: { type: 'string' } },
      },
    },
    catalog: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'description', 'products'],
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        products: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'description', 'price'],
            properties: { name: { type: 'string' }, description: { type: 'string' }, price: { type: 'number' } },
          },
        },
      },
    },
  },
} as const;

const STEP = 60_000; // 1 minute between events
const T0 = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const PALETTE = ['#34B7F1', '#25D366', '#FFB300', '#E91E63', '#9C27B0', '#FF5722'];

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// Deterministically compiles a GenSpec into a replayable Scenario: assigns phones/JIDs/ids, stamps a
// monotonically increasing clock, and resolves every name reference to its JID.
export function compileSpec(spec: GenSpec): Scenario {
  const accountPhone = '14155550100';
  const meJid = `${accountPhone}@c.us`;
  const events: WorldEvent[] = [];
  let clock = T0;
  let seq = 0;
  const tick = (): number => (clock += STEP);

  // name -> JID resolution. "me" and the account display name both map to the account.
  const jids = new Map<string, string>([['me', meJid]]);
  jids.set(spec.account.pushName.toLowerCase(), meJid);
  const resolve = (name: string): string => jids.get(name.toLowerCase()) ?? meJid;

  spec.contacts.forEach((name, i) => {
    const phone = `1415555${String(1000 + i + 1).padStart(4, '0')}`;
    const id = `${phone}@c.us`;
    jids.set(name.toLowerCase(), id);
    const contact: ContactRecord = { id, phone, name, pushName: name, isMyContact: true, isBlocked: false };
    events.push({ kind: 'contact', t: tick(), contact });
  });

  spec.groups.forEach((g, i) => {
    const id = `1203630000000000${String(i + 1).padStart(2, '0')}@g.us`;
    jids.set(g.name.toLowerCase(), id);
    const participants = [
      { id: meJid, phone: accountPhone, name: spec.account.pushName, isAdmin: true, isSuperAdmin: true },
      ...g.participants.map(p => {
        const pid = resolve(p);
        return { id: pid, phone: pid.replace(/[^0-9]/g, ''), name: p, isAdmin: false, isSuperAdmin: false };
      }),
    ];
    const group: GroupRecord = {
      id,
      name: g.name,
      description: g.description,
      owner: meJid,
      createdAt: tick(),
      participants,
    };
    events.push({ kind: 'group', t: clock, group });
  });

  spec.conversations.forEach(conv => {
    const chatId = resolve(conv.with);
    const isGroup = chatId.endsWith('@g.us');
    conv.messages.forEach(m => {
      const senderJid = resolve(m.from);
      const fromMe = senderJid === meJid;
      const id = `GEN_MSG_${String(++seq).padStart(4, '0')}`;
      const message: MessageRecord = {
        id,
        chatId,
        from: isGroup ? chatId : fromMe ? meJid : chatId,
        to: isGroup ? chatId : fromMe ? chatId : meJid,
        author: isGroup ? senderJid : undefined,
        body: m.text,
        type: 'text',
        timestamp: tick(),
        fromMe,
        isGroup,
        reactions: [],
        ackStatus: fromMe ? 'read' : undefined,
      };
      events.push({ kind: 'message', t: clock, message });
    });
  });

  spec.labels.forEach((name, i) => {
    const id = `GEN_LABEL_${i + 1}`;
    events.push({ kind: 'label', t: tick(), label: { id, name, hexColor: PALETTE[i % PALETTE.length] } });
    // Apply each label to the matching conversation's chat so the chat-label path has data.
    const conv = spec.conversations[i];
    if (conv) events.push({ kind: 'chat-label', t: clock, chatId: resolve(conv.with), labelId: id, applied: true });
  });

  spec.channels.forEach((c, i) => {
    const id = `12036311111111${String(i + 1).padStart(4, '0')}@newsletter`;
    const channel: ChannelRecord = {
      id,
      name: c.name,
      description: c.description,
      inviteCode: slug(c.name),
      subscriberCount: 100 * (i + 1),
      verified: i === 0,
      createdAt: tick(),
      subscribed: c.subscribed,
    };
    events.push({ kind: 'channel', t: clock, channel });
    c.posts.forEach((body, j) => {
      events.push({
        kind: 'channel-message',
        t: tick(),
        message: { id: `GEN_CHMSG_${i + 1}_${j + 1}`, channelId: id, body, timestamp: clock, hasMedia: false },
      });
    });
  });

  spec.statuses.forEach((s, i) => {
    const t = tick();
    const status: StatusRecord = {
      id: `GEN_STATUS_${i + 1}`,
      contactId: resolve(s.from),
      type: 'text',
      caption: s.text,
      backgroundColor: PALETTE[i % PALETTE.length],
      timestamp: t,
      expiresAt: t + DAY,
    };
    events.push({ kind: 'status', t, status });
  });

  const catalog: CatalogRecord = {
    id: 'GEN_CAT',
    name: spec.catalog.name,
    description: spec.catalog.description,
    url: `https://wa.me/c/${accountPhone}`,
  };
  events.push({ kind: 'catalog', t: tick(), catalog });
  spec.catalog.products.forEach((p, i) => {
    const id = `GEN_PROD_${String(i + 1).padStart(4, '0')}`;
    const product: ProductRecord = {
      id,
      name: p.name,
      description: p.description,
      price: p.price,
      currency: 'USD',
      priceFormatted: `$${p.price.toFixed(2)}`,
      url: `https://wa.me/p/${id}/${accountPhone}`,
      isAvailable: true,
      retailerId: `SKU-${i + 1}`,
    };
    events.push({ kind: 'product', t: tick(), product });
  });

  return {
    name: spec.name,
    description: spec.description,
    me: { phone: accountPhone, pushName: spec.account.pushName },
    events,
  };
}
