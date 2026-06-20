import type { Scenario, MessageRecord, GroupRecord, ContactRecord } from '@openwa/wa-sim';
import { Simulation } from '@openwa/wa-sim';
import {
  Catalog,
  Channel,
  ChannelMessage,
  ChatSummary,
  Contact,
  ContactCard,
  EngineEventCallbacks,
  EngineStatus,
  Group,
  GroupInfo,
  IncomingMessage,
  IWhatsAppEngine,
  Label,
  LocationInput,
  MediaInput,
  MessageReaction,
  MessageResult,
  MessageType,
  PaginatedProducts,
  Product,
  Status,
  StatusResult,
} from '../interfaces/whatsapp-engine.interface';

export interface SimulatorEngineOptions {
  sessionId: string;
  scenario: Scenario;
}

/**
 * In-process fake engine backing the simulator. It satisfies the full IWhatsAppEngine contract over a
 * `Simulation` (a scenario opened at a point in time), so the entire service layer, REST/MCP surface,
 * webhooks and dashboard run against deterministic world data with no real WhatsApp connection.
 *
 * Beyond the interface it exposes test-only `inject*` helpers to drive inbound traffic. The world's
 * event listener is translated into the engine callbacks, so an injected message flows through exactly
 * the same path a real inbound message would.
 */
export class SimulatorEngineAdapter implements IWhatsAppEngine {
  private readonly sim: Simulation;
  private readonly sessionId: string;
  private readonly meJid: string;
  private callbacks: EngineEventCallbacks = {};
  private status: EngineStatus = EngineStatus.DISCONNECTED;
  private seq = 0;

  constructor(options: SimulatorEngineOptions) {
    this.sessionId = options.sessionId;
    this.sim = new Simulation(options.scenario);
    this.meJid = `${this.sim.me.phone}@c.us`;
  }

  // ---- Lifecycle -----------------------------------------------------------

  initialize(callbacks: EngineEventCallbacks): Promise<void> {
    this.callbacks = callbacks;
    this.sim.onEvent(event => this.dispatch(event));
    this.status = EngineStatus.READY;
    this.callbacks.onStateChanged?.(EngineStatus.READY);
    this.callbacks.onReady?.(this.sim.me.phone, this.sim.me.pushName);
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    this.status = EngineStatus.DISCONNECTED;
    return Promise.resolve();
  }

  logout(): Promise<void> {
    this.status = EngineStatus.DISCONNECTED;
    return Promise.resolve();
  }

  destroy(): Promise<void> {
    this.status = EngineStatus.DISCONNECTED;
    this.callbacks = {};
    return Promise.resolve();
  }

  forceDestroy(): Promise<void> {
    return this.destroy();
  }

  // ---- Status --------------------------------------------------------------

  getStatus(): EngineStatus {
    return this.status;
  }

  getQRCode(): string | null {
    return null;
  }

  requestPairingCode(): Promise<string> {
    return Promise.resolve('SIMULATE');
  }

  getPhoneNumber(): string | null {
    return this.sim.me.phone;
  }

  getPushName(): string | null {
    return this.sim.me.pushName;
  }

  // ---- Test-only inbound drivers -------------------------------------------

  /** Inject an inbound text message from a contact (1:1) or a group participant. */
  injectInboundText(fromJid: string, body: string, opts?: { groupId?: string; author?: string }): IncomingMessage {
    const isGroup = !!opts?.groupId;
    const chatId = opts?.groupId ?? fromJid;
    const record: MessageRecord = {
      id: this.nextId('IN'),
      chatId,
      from: isGroup ? chatId : fromJid,
      to: this.meJid,
      author: isGroup ? (opts?.author ?? fromJid) : undefined,
      body,
      type: 'text',
      timestamp: Date.now(),
      fromMe: false,
      isGroup,
      reactions: [],
    };
    this.sim.append({ kind: 'message', t: 0, message: record });
    return this.toIncoming(record);
  }

  /** Advance the simulation clock, replaying (and emitting) any scheduled future events crossed. */
  advanceTo(timestamp: number): void {
    this.sim.advanceTo(timestamp);
  }

  // ---- Event translation ---------------------------------------------------

  private dispatch(event: ReturnType<Simulation['append']>): void {
    switch (event.kind) {
      case 'message': {
        const incoming = this.toIncoming(event.message);
        if (event.message.fromMe) this.callbacks.onMessageCreate?.(incoming);
        else this.callbacks.onMessage?.(incoming);
        break;
      }
      case 'ack':
        this.callbacks.onMessageAck?.(event.messageId, event.status);
        break;
      case 'reaction':
        this.callbacks.onMessageReaction?.({
          messageId: event.messageId,
          chatId: event.chatId,
          reaction: event.emoji,
          senderId: event.senderId,
        });
        break;
      case 'revoke': {
        const msg = this.sim.world.getMessage(event.messageId);
        if (msg) {
          this.callbacks.onMessageRevoked?.({
            id: msg.id,
            chatId: msg.chatId,
            from: msg.from,
            to: msg.to,
            type: 'revoked',
            body: '',
            timestamp: msg.timestamp,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  // ---- Messaging -----------------------------------------------------------

  sendTextMessage(chatId: string, text: string): Promise<MessageResult> {
    return Promise.resolve(this.appendOutgoing(chatId, text, 'text'));
  }

  sendImageMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    return Promise.resolve(this.appendOutgoing(chatId, media.caption ?? '', 'image', this.mediaFrom(media)));
  }

  sendVideoMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    return Promise.resolve(this.appendOutgoing(chatId, media.caption ?? '', 'video', this.mediaFrom(media)));
  }

  sendAudioMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    return Promise.resolve(this.appendOutgoing(chatId, '', 'audio', this.mediaFrom(media)));
  }

  sendDocumentMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    return Promise.resolve(this.appendOutgoing(chatId, media.caption ?? '', 'document', this.mediaFrom(media)));
  }

  sendLocationMessage(chatId: string, location: LocationInput): Promise<MessageResult> {
    return Promise.resolve(this.appendOutgoing(chatId, '', 'location', { location: { ...location } }));
  }

  sendContactMessage(chatId: string, contact: ContactCard): Promise<MessageResult> {
    return Promise.resolve(this.appendOutgoing(chatId, contact.name, 'contact'));
  }

  sendStickerMessage(chatId: string, media: MediaInput): Promise<MessageResult> {
    return Promise.resolve(this.appendOutgoing(chatId, '', 'sticker', this.mediaFrom(media)));
  }

  replyToMessage(chatId: string, quotedMsgId: string, text: string): Promise<MessageResult> {
    const quoted = this.sim.world.getMessage(quotedMsgId);
    return Promise.resolve(
      this.appendOutgoing(chatId, text, 'text', {
        quotedMessage: quoted ? { id: quoted.id, body: quoted.body } : { id: quotedMsgId, body: '' },
      }),
    );
  }

  forwardMessage(fromChatId: string, toChatId: string, messageId: string): Promise<MessageResult> {
    const source = this.sim.world.getMessage(messageId);
    return Promise.resolve(this.appendOutgoing(toChatId, source?.body ?? '', source?.type ?? 'text'));
  }

  // ---- Reactions -----------------------------------------------------------

  reactToMessage(chatId: string, messageId: string, emoji: string): Promise<void> {
    this.sim.append({ kind: 'reaction', t: 0, messageId, chatId, senderId: this.meJid, emoji });
    return Promise.resolve();
  }

  getMessageReactions(_chatId: string, messageId: string): Promise<MessageReaction[]> {
    const msg = this.sim.world.getMessage(messageId);
    if (!msg) return Promise.resolve([]);
    const byEmoji = new Map<string, MessageReaction>();
    for (const r of msg.reactions) {
      const entry = byEmoji.get(r.emoji) ?? { emoji: r.emoji, senders: [] };
      entry.senders.push({ senderId: r.senderId, emoji: r.emoji, timestamp: r.timestamp });
      byEmoji.set(r.emoji, entry);
    }
    return Promise.resolve([...byEmoji.values()]);
  }

  // ---- Contacts ------------------------------------------------------------

  getContacts(): Promise<Contact[]> {
    return Promise.resolve(this.sim.world.getContacts().map(c => this.toContact(c)));
  }

  getContactById(contactId: string): Promise<Contact | null> {
    const c = this.sim.world.getContact(contactId);
    return Promise.resolve(c ? this.toContact(c) : null);
  }

  checkNumberExists(number: string): Promise<boolean> {
    return Promise.resolve(!!this.sim.world.getContactByPhone(this.digits(number)));
  }

  getNumberId(number: string): Promise<string | null> {
    const c = this.sim.world.getContactByPhone(this.digits(number));
    return Promise.resolve(c ? c.id : null);
  }

  resolveContactPhone(contactId: string): Promise<string | null> {
    const c = this.sim.world.getContact(contactId);
    if (c) return Promise.resolve(c.phone || null);
    return Promise.resolve(contactId.endsWith('@c.us') ? this.digits(contactId) : null);
  }

  getProfilePicture(contactId: string): Promise<string | null> {
    return Promise.resolve(this.sim.world.getContact(contactId)?.profilePicUrl ?? null);
  }

  blockContact(contactId: string): Promise<void> {
    this.sim.append({ kind: 'block', t: 0, contactId, blocked: true });
    return Promise.resolve();
  }

  unblockContact(contactId: string): Promise<void> {
    this.sim.append({ kind: 'block', t: 0, contactId, blocked: false });
    return Promise.resolve();
  }

  // ---- Groups --------------------------------------------------------------

  getGroups(): Promise<Group[]> {
    return Promise.resolve(this.sim.world.getGroups().map(g => this.toGroup(g)));
  }

  getGroupInfo(groupId: string): Promise<GroupInfo | null> {
    const g = this.sim.world.getGroup(groupId);
    if (!g) return Promise.resolve(null);
    return Promise.resolve({
      id: g.id,
      name: g.name,
      description: g.description,
      owner: g.owner,
      createdAt: g.createdAt,
      participants: g.participants.map(p => ({
        id: p.id,
        number: p.phone,
        name: p.name,
        isAdmin: p.isAdmin,
        isSuperAdmin: p.isSuperAdmin,
      })),
      isAnnounce: g.isAnnounce,
      linkedParentJID: g.linkedParentJID,
    });
  }

  createGroup(name: string, participants: string[]): Promise<Group> {
    const id = `${this.nextId('GRP')}@g.us`;
    const record: GroupRecord = {
      id,
      name,
      owner: this.meJid,
      createdAt: Date.now(),
      participants: [
        { id: this.meJid, phone: this.sim.me.phone, name: this.sim.me.pushName, isAdmin: true, isSuperAdmin: true },
        ...participants.map(p => ({ id: p, phone: this.digits(p), isAdmin: false, isSuperAdmin: false })),
      ],
    };
    this.sim.append({ kind: 'group', t: 0, group: record });
    return Promise.resolve(this.toGroup(record));
  }

  addParticipants(groupId: string, participants: string[]): Promise<void> {
    return this.mutateGroup(groupId, g => {
      for (const p of participants) {
        if (!g.participants.some(x => x.id === p)) {
          g.participants.push({ id: p, phone: this.digits(p), isAdmin: false, isSuperAdmin: false });
        }
      }
    });
  }

  removeParticipants(groupId: string, participants: string[]): Promise<void> {
    return this.mutateGroup(groupId, g => {
      g.participants = g.participants.filter(p => !participants.includes(p.id));
    });
  }

  promoteParticipants(groupId: string, participants: string[]): Promise<void> {
    return this.setAdmin(groupId, participants, true);
  }

  demoteParticipants(groupId: string, participants: string[]): Promise<void> {
    return this.setAdmin(groupId, participants, false);
  }

  leaveGroup(groupId: string): Promise<void> {
    return this.mutateGroup(groupId, g => {
      g.participants = g.participants.filter(p => p.id !== this.meJid);
    });
  }

  setGroupSubject(groupId: string, subject: string): Promise<void> {
    return this.mutateGroup(groupId, g => {
      g.name = subject;
    });
  }

  setGroupDescription(groupId: string, description: string): Promise<void> {
    return this.mutateGroup(groupId, g => {
      g.description = description;
    });
  }

  getGroupInviteCode(groupId: string): Promise<string> {
    return Promise.resolve(`sim-invite-${this.digits(groupId)}`);
  }

  revokeGroupInviteCode(groupId: string): Promise<string> {
    return Promise.resolve(`sim-invite-${this.digits(groupId)}-${++this.seq}`);
  }

  // ---- Message operations --------------------------------------------------

  deleteMessage(_chatId: string, messageId: string, forEveryone?: boolean): Promise<void> {
    if (forEveryone) this.sim.append({ kind: 'revoke', t: 0, messageId });
    return Promise.resolve();
  }

  getChatHistory(chatId: string, limit?: number): Promise<IncomingMessage[]> {
    const msgs = this.sim.world.getMessages(chatId).map(m => this.toIncoming(m));
    return Promise.resolve(typeof limit === 'number' ? msgs.slice(-limit) : msgs);
  }

  // ---- Chats ---------------------------------------------------------------

  getChats(): Promise<ChatSummary[]> {
    return Promise.resolve(
      this.sim.world.getChats().map(chat => {
        const last = this.sim.world.getLastMessage(chat.id);
        return {
          id: chat.id,
          name: chat.name,
          isGroup: chat.isGroup,
          unreadCount: 0,
          timestamp: last?.timestamp ?? 0,
          lastMessage: last?.body,
        };
      }),
    );
  }

  sendSeen(): Promise<boolean> {
    return Promise.resolve(true);
  }

  deleteChat(): Promise<boolean> {
    return Promise.resolve(true);
  }

  sendChatState(): Promise<void> {
    return Promise.resolve();
  }

  // ---- Phase-3 long tail (neutral stubs; fleshed out separately) ------------

  getLabels(): Promise<Label[]> {
    return Promise.resolve([]);
  }
  getLabelById(): Promise<Label | null> {
    return Promise.resolve(null);
  }
  getChatLabels(): Promise<Label[]> {
    return Promise.resolve([]);
  }
  addLabelToChat(): Promise<void> {
    return Promise.resolve();
  }
  removeLabelFromChat(): Promise<void> {
    return Promise.resolve();
  }
  getSubscribedChannels(): Promise<Channel[]> {
    return Promise.resolve([]);
  }
  getChannelById(): Promise<Channel | null> {
    return Promise.resolve(null);
  }
  subscribeToChannel(): Promise<Channel> {
    return Promise.reject(new Error('channels are not simulated'));
  }
  unsubscribeFromChannel(): Promise<void> {
    return Promise.resolve();
  }
  getChannelMessages(): Promise<ChannelMessage[]> {
    return Promise.resolve([]);
  }
  getContactStatuses(): Promise<Status[]> {
    return Promise.resolve([]);
  }
  getContactStatus(): Promise<Status[]> {
    return Promise.resolve([]);
  }
  postTextStatus(): Promise<StatusResult> {
    return Promise.reject(new Error('status posting is not simulated'));
  }
  postImageStatus(): Promise<StatusResult> {
    return Promise.reject(new Error('status posting is not simulated'));
  }
  postVideoStatus(): Promise<StatusResult> {
    return Promise.reject(new Error('status posting is not simulated'));
  }
  deleteStatus(): Promise<void> {
    return Promise.resolve();
  }
  getCatalog(): Promise<Catalog | null> {
    return Promise.resolve(null);
  }
  getProducts(): Promise<PaginatedProducts> {
    return Promise.resolve({ products: [], pagination: { page: 1, limit: 0, total: 0, totalPages: 0 } });
  }
  getProduct(): Promise<Product | null> {
    return Promise.resolve(null);
  }
  sendProduct(chatId: string, productId: string, body?: string): Promise<MessageResult> {
    return Promise.resolve(this.appendOutgoing(chatId, body ?? productId, 'text'));
  }
  sendCatalog(chatId: string, body?: string): Promise<MessageResult> {
    return Promise.resolve(this.appendOutgoing(chatId, body ?? '', 'text'));
  }

  // ---- Helpers -------------------------------------------------------------

  private appendOutgoing(
    chatId: string,
    body: string,
    type: MessageType,
    extra?: Partial<MessageRecord>,
  ): MessageResult {
    const id = this.nextId('OUT');
    const timestamp = Date.now();
    const isGroup = chatId.endsWith('@g.us');
    const record: MessageRecord = {
      id,
      chatId,
      from: this.meJid,
      to: chatId,
      body,
      type,
      timestamp,
      fromMe: true,
      isGroup,
      ackStatus: 'sent',
      reactions: [],
      ...extra,
    };
    this.sim.append({ kind: 'message', t: 0, message: record });
    this.sim.append({ kind: 'ack', t: 0, messageId: id, status: 'sent' });
    return { id, timestamp };
  }

  private mutateGroup(groupId: string, fn: (g: GroupRecord) => void): Promise<void> {
    const current = this.sim.world.getGroup(groupId);
    if (!current) return Promise.resolve();
    const next: GroupRecord = { ...current, participants: current.participants.map(p => ({ ...p })) };
    fn(next);
    this.sim.append({ kind: 'group', t: 0, group: next });
    return Promise.resolve();
  }

  private setAdmin(groupId: string, participants: string[], isAdmin: boolean): Promise<void> {
    return this.mutateGroup(groupId, g => {
      for (const p of g.participants) {
        if (participants.includes(p.id)) p.isAdmin = isAdmin;
      }
    });
  }

  private mediaFrom(media: MediaInput): Partial<MessageRecord> {
    return {
      media: {
        mimetype: media.mimetype,
        filename: media.filename,
        data: typeof media.data === 'string' ? media.data : undefined,
      },
    };
  }

  private toIncoming(m: MessageRecord): IncomingMessage {
    const sender = this.sim.world.getContact(m.author ?? m.from);
    const senderJid = m.author ?? m.from;
    return {
      id: m.id,
      from: m.from,
      to: m.to,
      chatId: m.chatId,
      body: m.body,
      type: m.type,
      timestamp: m.timestamp,
      fromMe: m.fromMe,
      isGroup: m.isGroup,
      isStatusBroadcast: m.isStatusBroadcast,
      author: m.author,
      mentionedIds: m.mentionedIds,
      isLidSender: senderJid.endsWith('@lid'),
      senderPhone: sender?.phone || undefined,
      contact: sender ? { name: sender.name, pushName: sender.pushName } : undefined,
      media: m.media ? { mimetype: m.media.mimetype, filename: m.media.filename, data: m.media.data } : undefined,
      quotedMessage: m.quotedMessage,
      location: m.location,
    };
  }

  private toContact(c: ContactRecord): Contact {
    return {
      id: c.id,
      name: c.name,
      pushName: c.pushName,
      number: c.phone,
      isMyContact: c.isMyContact,
      isBlocked: c.isBlocked,
      profilePicUrl: c.profilePicUrl,
    };
  }

  private toGroup(g: GroupRecord): Group {
    return {
      id: g.id,
      name: g.name,
      participantsCount: g.participants.length,
      isAdmin: g.participants.find(p => p.id === this.meJid)?.isAdmin,
      linkedParentJID: g.linkedParentJID,
    };
  }

  private nextId(prefix: string): string {
    return `SIM_${prefix}_${this.sessionId}_${++this.seq}`;
  }

  private digits(value: string): string {
    return value.replace(/[^0-9]/g, '');
  }
}
