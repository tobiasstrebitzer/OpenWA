import { evaluateFilters } from './filter-evaluator';
import { WebhookFilters } from './filter-types';

const msg = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  from: '111@c.us',
  to: '999@c.us',
  body: 'Hello World',
  type: 'text',
  fromMe: false,
  isGroup: false,
  ...over,
});

const filters = (...conditions: WebhookFilters['conditions']): WebhookFilters => ({ conditions });

describe('evaluateFilters', () => {
  it('passes when filters are absent or empty (additive/optional)', () => {
    expect(evaluateFilters(null, 'message.received', msg())).toBe(true);
    expect(evaluateFilters(undefined, 'message.received', msg())).toBe(true);
    expect(evaluateFilters(filters(), 'message.received', msg())).toBe(true);
  });

  it('matches sender by JID, case-insensitively', () => {
    const f = filters({ field: 'sender', operator: 'is', value: ['111@C.US'] });
    expect(evaluateFilters(f, 'message.received', msg())).toBe(true);
    expect(evaluateFilters(f, 'message.received', msg({ from: '222@c.us' }))).toBe(false);
  });

  it('resolves sender to author in group messages', () => {
    const f = filters({ field: 'sender', operator: 'is', value: ['part@c.us'] });
    const groupMsg = msg({ from: '120@g.us', author: 'part@c.us', isGroup: true });
    expect(evaluateFilters(f, 'message.received', groupMsg)).toBe(true);
  });

  it('supports isNot (negation), including unknown sender', () => {
    const f = filters({ field: 'sender', operator: 'isNot', value: ['111@c.us'] });
    expect(evaluateFilters(f, 'message.received', msg())).toBe(false);
    expect(evaluateFilters(f, 'message.received', msg({ from: '222@c.us' }))).toBe(true);
    expect(evaluateFilters(f, 'message.received', msg({ from: undefined }))).toBe(true);
  });

  it('ANDs all conditions', () => {
    const f = filters(
      { field: 'sender', operator: 'is', value: ['111@c.us'] },
      { field: 'type', operator: 'is', value: ['image'] },
    );
    expect(evaluateFilters(f, 'message.received', msg({ type: 'image' }))).toBe(true);
    expect(evaluateFilters(f, 'message.received', msg({ type: 'text' }))).toBe(false);
  });

  it('body contains is case-insensitive by default and case-sensitive when set', () => {
    expect(
      evaluateFilters(filters({ field: 'body', operator: 'contains', value: 'hello' }), 'message.received', msg()),
    ).toBe(true);
    expect(
      evaluateFilters(
        filters({ field: 'body', operator: 'contains', value: 'hello', caseSensitive: true }),
        'message.received',
        msg(),
      ),
    ).toBe(false);
  });

  it('body equals and regex matches', () => {
    expect(
      evaluateFilters(filters({ field: 'body', operator: 'equals', value: 'Hello World' }), 'message.received', msg()),
    ).toBe(true);
    expect(
      evaluateFilters(filters({ field: 'body', operator: 'matches', value: '^hello' }), 'message.received', msg()),
    ).toBe(true);
    expect(
      evaluateFilters(filters({ field: 'body', operator: 'matches', value: '^world' }), 'message.received', msg()),
    ).toBe(false);
  });

  it('rejects an invalid regex by failing the match, not throwing', () => {
    expect(
      evaluateFilters(filters({ field: 'body', operator: 'matches', value: '(' }), 'message.received', msg()),
    ).toBe(false);
  });

  it('boolean fields (isGroup, fromMe, hasMedia)', () => {
    expect(
      evaluateFilters(
        filters({ field: 'isGroup', operator: 'is', value: true }),
        'message.received',
        msg({ isGroup: true }),
      ),
    ).toBe(true);
    expect(evaluateFilters(filters({ field: 'fromMe', operator: 'is', value: false }), 'message.received', msg())).toBe(
      true,
    );
    expect(
      evaluateFilters(filters({ field: 'hasMedia', operator: 'is', value: true }), 'message.received', msg()),
    ).toBe(false);
    expect(
      evaluateFilters(
        filters({ field: 'hasMedia', operator: 'is', value: true }),
        'message.received',
        msg({ media: { mimetype: 'image/png' } }),
      ),
    ).toBe(true);
  });

  it('mentions (idArray) intersects', () => {
    const f = filters({ field: 'mentions', operator: 'is', value: ['boss@c.us'] });
    expect(evaluateFilters(f, 'message.received', msg({ mentionedIds: ['boss@c.us', 'x@c.us'] }))).toBe(true);
    expect(evaluateFilters(f, 'message.received', msg({ mentionedIds: ['x@c.us'] }))).toBe(false);
  });

  it('skips conditions whose field is not registered for the event family', () => {
    // A message-family field carried on a (future) session event is ignored, not failed.
    const f = filters({ field: 'sender', operator: 'is', value: ['nobody@c.us'] });
    expect(evaluateFilters(f, 'session.status', msg())).toBe(true);
  });
});
