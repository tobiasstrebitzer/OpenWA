/**
 * Thrown by the engine layer when an operation requires a connected, READY
 * WhatsApp client but the session is not in that state — e.g. it was just
 * disconnected from the phone, is still initializing, or is reconnecting.
 *
 * The global exception filter maps this to HTTP 409 Conflict so API callers
 * (and the dashboard) receive a clear, retryable "session not connected" error
 * instead of a generic 500 Internal Server Error.
 */
export class EngineNotReadyError extends Error {
  constructor(message = 'WhatsApp client is not ready') {
    super(message);
    this.name = 'EngineNotReadyError';
    // Restore the prototype chain so `instanceof` works after TS downlevel.
    Object.setPrototypeOf(this, EngineNotReadyError.prototype);
  }
}
