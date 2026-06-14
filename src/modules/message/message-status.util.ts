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
