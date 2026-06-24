import { requestSlotFields, populateRequestSlots } from './request-slots';
import type { Binding } from './rebind';

describe('request-slots', () => {
  describe('requestSlotFields', () => {
    it('classifies bindings into params/query/body slots', () => {
      const bindings: Binding[] = [
        { kind: 'value', field: 'sessionId', source: 'path' },
        { kind: 'value', field: 'limit', source: 'query' },
        { kind: 'object', source: 'body', fields: ['text', 'chatId'] },
        { kind: 'params', fields: ['id'] },
        { kind: 'request' },
      ];
      expect(requestSlotFields(bindings)).toEqual({
        params: ['sessionId', 'id'],
        query: ['limit'],
        body: ['text', 'chatId'],
      });
    });
  });

  describe('populateRequestSlots', () => {
    it('fills params/query from input (stringified) and body (parsed), only when absent', () => {
      const request: {
        params: Record<string, unknown>;
        query: Record<string, unknown>;
        body: Record<string, unknown>;
      } = {
        params: {},
        query: {},
        body: {},
      };
      const slots = { params: ['sessionId'], query: ['limit'], body: ['count'] };
      populateRequestSlots(request, slots, { sessionId: 'abc', limit: 10, count: 5 });
      // path/query are stringified (Express delivers them as strings)
      expect(request.params).toEqual({ sessionId: 'abc' });
      expect(request.query).toEqual({ limit: '10' });
      // body keeps the parsed value
      expect(request.body).toEqual({ count: 5 });
    });

    it('never overwrites a key already present on the request', () => {
      const request = { params: { sessionId: 'real' }, query: {}, body: {} };
      populateRequestSlots(request, { params: ['sessionId'], query: [], body: [] }, { sessionId: 'forged' });
      expect(request.params.sessionId).toBe('real');
    });

    it('is a no-op for a non-object request', () => {
      expect(() => populateRequestSlots(undefined, { params: ['x'], query: [], body: [] }, { x: '1' })).not.toThrow();
    });
  });
});
