import { resolveCorsPolicy, isSwaggerEnabled, resolveBodyLimit } from './bootstrap-security';

describe('resolveCorsPolicy', () => {
  it('defaults to wildcard in development, without credentials', () => {
    expect(resolveCorsPolicy(undefined, 'development')).toEqual({
      origins: ['*'],
      allowAnyOrigin: true,
      credentials: false,
    });
  });

  it('honors an explicit allowlist and enables credentials (no wildcard)', () => {
    expect(resolveCorsPolicy('https://a.com, https://b.com', 'production')).toEqual({
      origins: ['https://a.com', 'https://b.com'],
      allowAnyOrigin: false,
      credentials: true,
    });
  });

  it('REFUSES a wildcard origin in production (collapses to same-origin, no credentials)', () => {
    expect(resolveCorsPolicy('*', 'production')).toEqual({
      origins: [],
      allowAnyOrigin: false,
      credentials: false,
    });
  });

  it('treats the default (unset) as wildcard-blocked in production', () => {
    expect(resolveCorsPolicy(undefined, 'production')).toEqual({
      origins: [],
      allowAnyOrigin: false,
      credentials: false,
    });
  });

  it('still allows wildcard in development', () => {
    expect(resolveCorsPolicy('*', 'development').allowAnyOrigin).toBe(true);
  });
});

describe('isSwaggerEnabled', () => {
  it('is on by default (unset)', () => {
    expect(isSwaggerEnabled(undefined)).toBe(true);
  });
  it('is off only for the literal "false"', () => {
    expect(isSwaggerEnabled('false')).toBe(false);
    expect(isSwaggerEnabled('true')).toBe(true);
    expect(isSwaggerEnabled('')).toBe(true);
  });
});

describe('resolveBodyLimit', () => {
  it('defaults to a media-aware 25mb', () => {
    expect(resolveBodyLimit(undefined)).toBe('25mb');
    expect(resolveBodyLimit('')).toBe('25mb');
  });
  it('honors an explicit limit', () => {
    expect(resolveBodyLimit('5mb')).toBe('5mb');
  });
});
