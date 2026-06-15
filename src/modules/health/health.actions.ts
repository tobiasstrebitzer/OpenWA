import { Injectable } from '@nestjs/common';
import { Action, Actions } from '@silkweave/nestjs';
import { z } from 'zod/v4';

interface HealthCheckResult {
  status: 'ok' | 'error';
  info?: Record<string, unknown>;
  error?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

const EmptyInput = z.object({});

@Injectable()
@Actions()
export class HealthActions {
  @Action({
    name: 'health',
    description: 'Basic health check',
    input: EmptyInput,
    kind: 'query',
  })
  check(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Action({
    name: 'health.live',
    description: 'Liveness probe for Kubernetes',
    input: EmptyInput,
    kind: 'query',
  })
  liveness(): { status: string } {
    return { status: 'ok' };
  }

  @Action({
    name: 'health.ready',
    description: 'Readiness probe for Kubernetes',
    input: EmptyInput,
    kind: 'query',
  })
  readiness(): HealthCheckResult {
    // In the future, check database connection, Redis, etc.
    return {
      status: 'ok',
      details: {
        database: { status: 'up' },
      },
    };
  }
}
