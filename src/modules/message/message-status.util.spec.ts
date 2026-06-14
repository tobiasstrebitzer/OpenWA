import { ackToMessageStatus } from './message-status.util';
import { MessageStatus } from './entities/message.entity';

describe('ackToMessageStatus', () => {
  it('maps an error ack (<0) to FAILED', () => {
    expect(ackToMessageStatus(-1)).toBe(MessageStatus.FAILED);
  });

  it('maps device ack (2) to DELIVERED', () => {
    expect(ackToMessageStatus(2)).toBe(MessageStatus.DELIVERED);
  });

  it('maps read/played ack (>=3) to READ', () => {
    expect(ackToMessageStatus(3)).toBe(MessageStatus.READ);
    expect(ackToMessageStatus(4)).toBe(MessageStatus.READ);
  });

  it('returns null for pending (0) and server-sent (1) — no upgrade beyond SENT', () => {
    expect(ackToMessageStatus(0)).toBeNull();
    expect(ackToMessageStatus(1)).toBeNull();
  });
});
