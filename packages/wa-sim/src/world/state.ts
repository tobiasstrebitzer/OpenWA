import {
  ChatRecord,
  ContactRecord,
  GroupRecord,
  MessageRecord,
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
}
