import {
  CatalogRecord,
  ChannelMessageRecord,
  ChannelRecord,
  ChatRecord,
  ContactRecord,
  GroupRecord,
  LabelRecord,
  MessageRecord,
  ProductRecord,
  StatusRecord,
  WorldEvent,
} from './types';

// Materialized world: the fold of an event log. Pure reducer (`apply`) plus query helpers.
// Holds no wall-clock state of its own; callers decide which events to feed it.
export class WorldState {
  private readonly contacts = new Map<string, ContactRecord>();
  private readonly chats = new Map<string, ChatRecord>();
  private readonly groups = new Map<string, GroupRecord>();
  private readonly messages = new Map<string, MessageRecord>();
  private readonly messageOrder: string[] = [];
  private readonly labels = new Map<string, LabelRecord>();
  private readonly chatLabels = new Map<string, Set<string>>();
  private readonly channels = new Map<string, ChannelRecord>();
  private readonly channelMessages = new Map<string, ChannelMessageRecord[]>();
  private readonly statuses = new Map<string, StatusRecord>();
  private readonly statusOrder: string[] = [];
  private readonly products = new Map<string, ProductRecord>();
  private readonly productOrder: string[] = [];
  private catalog?: CatalogRecord;

  apply(event: WorldEvent): void {
    switch (event.kind) {
      case 'contact':
        this.contacts.set(event.contact.id, { ...event.contact });
        break;
      case 'chat':
        this.chats.set(event.chat.id, { ...event.chat });
        break;
      case 'group':
        this.groups.set(event.group.id, { ...event.group });
        if (!this.chats.has(event.group.id)) {
          this.chats.set(event.group.id, { id: event.group.id, name: event.group.name, isGroup: true });
        }
        break;
      case 'message': {
        const msg: MessageRecord = { ...event.message, reactions: [...event.message.reactions] };
        if (!this.messages.has(msg.id)) this.messageOrder.push(msg.id);
        this.messages.set(msg.id, msg);
        this.ensureChatForMessage(msg);
        break;
      }
      case 'reaction': {
        const msg = this.messages.get(event.messageId);
        if (msg) {
          msg.reactions = msg.reactions.filter(r => r.senderId !== event.senderId);
          if (event.emoji) msg.reactions.push({ emoji: event.emoji, senderId: event.senderId, timestamp: event.t });
        }
        break;
      }
      case 'revoke': {
        const msg = this.messages.get(event.messageId);
        if (msg) {
          msg.revoked = true;
          msg.type = 'revoked';
          msg.body = '';
        }
        break;
      }
      case 'ack': {
        const msg = this.messages.get(event.messageId);
        if (msg) msg.ackStatus = event.status;
        break;
      }
      case 'block': {
        const contact = this.contacts.get(event.contactId);
        if (contact) contact.isBlocked = event.blocked;
        break;
      }
      case 'label':
        this.labels.set(event.label.id, { ...event.label });
        break;
      case 'chat-label': {
        const set = this.chatLabels.get(event.chatId) ?? new Set<string>();
        if (event.applied) set.add(event.labelId);
        else set.delete(event.labelId);
        this.chatLabels.set(event.chatId, set);
        break;
      }
      case 'channel': {
        const prev = this.channels.get(event.channel.id);
        this.channels.set(event.channel.id, { ...prev, ...event.channel });
        break;
      }
      case 'channel-subscription': {
        const channel = this.channels.get(event.channelId);
        if (channel) channel.subscribed = event.subscribed;
        break;
      }
      case 'channel-message': {
        const list = this.channelMessages.get(event.message.channelId) ?? [];
        if (!list.some(m => m.id === event.message.id)) list.push({ ...event.message });
        this.channelMessages.set(event.message.channelId, list);
        break;
      }
      case 'status': {
        if (!this.statuses.has(event.status.id)) this.statusOrder.push(event.status.id);
        this.statuses.set(event.status.id, { ...event.status });
        break;
      }
      case 'status-delete': {
        this.statuses.delete(event.statusId);
        const i = this.statusOrder.indexOf(event.statusId);
        if (i >= 0) this.statusOrder.splice(i, 1);
        break;
      }
      case 'catalog':
        this.catalog = { ...event.catalog };
        break;
      case 'product': {
        if (!this.products.has(event.product.id)) this.productOrder.push(event.product.id);
        this.products.set(event.product.id, { ...event.product });
        break;
      }
    }
  }

  private ensureChatForMessage(msg: MessageRecord): void {
    if (this.chats.has(msg.chatId)) return;
    const contact = this.contacts.get(msg.chatId);
    this.chats.set(msg.chatId, {
      id: msg.chatId,
      name: contact?.name ?? contact?.pushName ?? msg.chatId,
      isGroup: msg.isGroup,
    });
  }

  getContacts(): ContactRecord[] {
    return [...this.contacts.values()];
  }

  getContact(id: string): ContactRecord | undefined {
    return this.contacts.get(id);
  }

  getContactByPhone(phone: string): ContactRecord | undefined {
    return [...this.contacts.values()].find(c => c.phone === phone);
  }

  getGroups(): GroupRecord[] {
    return [...this.groups.values()];
  }

  getGroup(id: string): GroupRecord | undefined {
    return this.groups.get(id);
  }

  getChats(): ChatRecord[] {
    return [...this.chats.values()];
  }

  getMessage(id: string): MessageRecord | undefined {
    return this.messages.get(id);
  }

  // Messages for a chat in insertion order (oldest first).
  getMessages(chatId: string): MessageRecord[] {
    return this.messageOrder
      .map(id => this.messages.get(id))
      .filter((m): m is MessageRecord => !!m && m.chatId === chatId);
  }

  // Most recent message in a chat, used for the chat-list summary line.
  getLastMessage(chatId: string): MessageRecord | undefined {
    for (let i = this.messageOrder.length - 1; i >= 0; i--) {
      const m = this.messages.get(this.messageOrder[i]);
      if (m && m.chatId === chatId) return m;
    }
    return undefined;
  }

  getLabels(): LabelRecord[] {
    return [...this.labels.values()];
  }

  getLabel(id: string): LabelRecord | undefined {
    return this.labels.get(id);
  }

  // Labels applied to a chat, in label-definition order.
  getChatLabels(chatId: string): LabelRecord[] {
    const ids = this.chatLabels.get(chatId);
    if (!ids) return [];
    return [...this.labels.values()].filter(l => ids.has(l.id));
  }

  getChannels(): ChannelRecord[] {
    return [...this.channels.values()];
  }

  getChannel(id: string): ChannelRecord | undefined {
    return this.channels.get(id);
  }

  getChannelByInviteCode(inviteCode: string): ChannelRecord | undefined {
    return [...this.channels.values()].find(c => c.inviteCode === inviteCode);
  }

  getSubscribedChannels(): ChannelRecord[] {
    return [...this.channels.values()].filter(c => c.subscribed);
  }

  // Channel feed in insertion order (oldest first).
  getChannelMessages(channelId: string): ChannelMessageRecord[] {
    return [...(this.channelMessages.get(channelId) ?? [])];
  }

  // All live statuses in post order (oldest first). Expiry is applied by the adapter against its cursor.
  getStatuses(): StatusRecord[] {
    return this.statusOrder.map(id => this.statuses.get(id)).filter((s): s is StatusRecord => !!s);
  }

  getContactStatuses(contactId: string): StatusRecord[] {
    return this.getStatuses().filter(s => s.contactId === contactId);
  }

  getCatalog(): CatalogRecord | undefined {
    return this.catalog;
  }

  getProducts(): ProductRecord[] {
    return this.productOrder.map(id => this.products.get(id)).filter((p): p is ProductRecord => !!p);
  }

  getProduct(id: string): ProductRecord | undefined {
    return this.products.get(id);
  }
}
