import { Test, TestingModule } from '@nestjs/testing';
import { HealthActions } from './health.actions';

describe('HealthActions', () => {
  let actions: HealthActions;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthActions],
    }).compile();

    actions = module.get<HealthActions>(HealthActions);
  });

  describe('check', () => {
    it('should return ok status', () => {
      const result = actions.check();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('liveness', () => {
    it('should return ok status for liveness probe', () => {
      const result = actions.liveness();

      expect(result.status).toBe('ok');
    });
  });

  describe('readiness', () => {
    it('should return ok status for readiness probe', () => {
      const result = actions.readiness();

      expect(result.status).toBe('ok');
    });
  });
});
