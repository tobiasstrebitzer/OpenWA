import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { rest, SilkweaveModule } from '@silkweave/nestjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { HealthModule } from '../src/modules/health/health.module';

interface HealthBody {
  status: string;
  timestamp?: string;
  details?: { database?: { status?: string } };
}

describe('Health (Silkweave REST, e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        HealthModule,
        SilkweaveModule.forRoot({
          silkweave: {
            name: 'openwa-test',
            description: 'OpenWA e2e',
            version: '0.0.0',
          },
          adapters: [rest({ basePath: '/api' })],
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health returns ok + timestamp', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    const body = res.body as HealthBody;
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });

  it('GET /api/health/live returns ok', async () => {
    const res = await request(app.getHttpServer()).get('/api/health/live').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/health/ready reports database up', async () => {
    const res = await request(app.getHttpServer()).get('/api/health/ready').expect(200);
    const body = res.body as HealthBody;
    expect(body.status).toBe('ok');
    expect(body.details?.database?.status).toBe('up');
  });
});
