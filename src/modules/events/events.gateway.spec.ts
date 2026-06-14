import { isSessionSubscriptionAllowed } from './events.gateway';

describe('isSessionSubscriptionAllowed (WS session-scope enforcement)', () => {
  it('allows an unrestricted key (null allowedSessions) to subscribe to anything, including *', () => {
    expect(isSessionSubscriptionAllowed(null, '*')).toBe(true);
    expect(isSessionSubscriptionAllowed(null, 'sess-1')).toBe(true);
  });

  it('allows an unrestricted key (empty allowedSessions) to subscribe to *', () => {
    expect(isSessionSubscriptionAllowed([], '*')).toBe(true);
  });

  it('forbids a session-scoped key from subscribing to the * wildcard', () => {
    expect(isSessionSubscriptionAllowed(['sess-1'], '*')).toBe(false);
  });

  it('allows a session-scoped key to subscribe to a session in its allowlist', () => {
    expect(isSessionSubscriptionAllowed(['sess-1', 'sess-2'], 'sess-2')).toBe(true);
  });

  it('forbids a session-scoped key from subscribing to a session outside its allowlist', () => {
    expect(isSessionSubscriptionAllowed(['sess-1'], 'sess-2')).toBe(false);
  });
});
