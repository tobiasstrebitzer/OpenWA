import { ArgumentsHost, HttpStatus, BadRequestException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { EngineNotReadyError } from '../errors/engine-not-ready.error';

function mockHost(): { host: ArgumentsHost; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ headers: {} }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  it('maps EngineNotReadyError to 409 SESSION_NOT_READY instead of a 500 (#100)', () => {
    const { host, status, json } = mockHost();

    filter.catch(new EngineNotReadyError(), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    const calls = json.mock.calls as Array<[{ success: boolean; error: { code: string } }]>;
    const payload = calls[0][0];
    expect(payload.success).toBe(false);
    expect(payload.error.code).toBe('SESSION_NOT_READY');
  });

  it('still maps an unexpected Error to 500', () => {
    const { host, status } = mockHost();

    filter.catch(new Error('boom'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('preserves an HttpException status', () => {
    const { host, status } = mockHost();

    filter.catch(new BadRequestException('bad'), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
  });
});
