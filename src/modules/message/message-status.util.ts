import { MessageStatus } from './entities/message.entity';

/**
 * Maps a whatsapp-web.js ack level to the delivery status it implies, or null
 * when the ack carries no upgrade beyond the stored `SENT` state.
 *
 * wwebjs MessageAck: -1 ERROR, 0 PENDING, 1 SERVER (sent), 2 DEVICE (delivered),
 * 3 READ, 4 PLAYED. This is how the stored message reflects *real* delivery
 * state (#220): a send that never receives ack≥2 stays `SENT`, visibly
 * "not delivered".
 */
export function ackToMessageStatus(ack: number): MessageStatus | null {
  if (ack < 0) return MessageStatus.FAILED;
  if (ack >= 3) return MessageStatus.READ;
  if (ack === 2) return MessageStatus.DELIVERED;
  return null; // 0 (pending) / 1 (server-received) — message is already SENT, no upgrade
}

/**
 * The stored statuses a delivery transition may advance FROM. Used as a conditional UPDATE guard so
 * delivery state only moves forward — preventing an out-of-order/late ack from downgrading a higher
 * status (e.g. a DELIVERED ack arriving after READ), even though the writes are fire-and-forget.
 * A late FAILED must not clobber a message already confirmed delivered/read, and vice versa.
 */
export function ackStatusTransitionFrom(target: MessageStatus): MessageStatus[] {
  switch (target) {
    case MessageStatus.DELIVERED:
      return [MessageStatus.PENDING, MessageStatus.SENT];
    case MessageStatus.READ:
      return [MessageStatus.PENDING, MessageStatus.SENT, MessageStatus.DELIVERED];
    case MessageStatus.FAILED:
      return [MessageStatus.PENDING, MessageStatus.SENT];
    default:
      return [];
  }
}
