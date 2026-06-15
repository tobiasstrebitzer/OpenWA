import { ackToMessageStatus, ackStatusTransitionFrom } from './message-status.util';
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

describe('ackStatusTransitionFrom (monotonic delivery-state guard)', () => {
  it('DELIVERED may advance only from PENDING/SENT (never downgrades a READ row)', () => {
    expect(ackStatusTransitionFrom(MessageStatus.DELIVERED)).toEqual([MessageStatus.PENDING, MessageStatus.SENT]);
    expect(ackStatusTransitionFrom(MessageStatus.DELIVERED)).not.toContain(MessageStatus.READ);
  });

  it('READ may advance from PENDING/SENT/DELIVERED', () => {
    expect(ackStatusTransitionFrom(MessageStatus.READ)).toEqual([
      MessageStatus.PENDING,
      MessageStatus.SENT,
      MessageStatus.DELIVERED,
    ]);
  });

  it('FAILED does not clobber an already delivered/read message', () => {
    const from = ackStatusTransitionFrom(MessageStatus.FAILED);
    expect(from).toEqual([MessageStatus.PENDING, MessageStatus.SENT]);
    expect(from).not.toContain(MessageStatus.DELIVERED);
    expect(from).not.toContain(MessageStatus.READ);
  });
});
