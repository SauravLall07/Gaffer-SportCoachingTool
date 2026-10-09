import { Controller, Get, Res, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import {
  API_CONTENT_SECURITY_POLICY,
  configureSecurityHeaders,
} from './security-headers';

@Controller()
class FixtureController {
  @Get('api')
  api() {
    return { ok: true };
  }

  @Get('auth/callback/google')
  callback(@Res() res: Response) {
    res.cookie('session', 'fixture', { httpOnly: true, sameSite: 'lax' });
    res.redirect('https://gaffer-virid.vercel.app/oauth/callback');
  }
}

describe('Browser security headers on HTTP responses', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [FixtureController],
    }).compile();
    app = module.createNestApplication();
    configureSecurityHeaders(app);
    app.enableCors({
      origin: 'https://gaffer-virid.vercel.app',
      credentials: true,
    });
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => app.close());

  it.each([
    ['/api', 200],
    ['/auth/callback/google', 302],
    ['/missing', 404],
  ])('protects %s without changing its status', async (path, status) => {
    const response = await request(server).get(path).expect(status);
    expect(response.headers['content-security-policy']).toBe(
      API_CONTENT_SECURITY_POLICY,
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe(
      'strict-origin-when-cross-origin',
    );
    expect(response.headers['x-powered-by']).toBeUndefined();
    // HSTS is managed by the deployment host, not asserted on local HTTP.
    expect(response.headers['strict-transport-security']).toBeUndefined();
    if (status === 302) {
      expect(response.headers.location).toBe(
        'https://gaffer-virid.vercel.app/oauth/callback',
      );
      expect(response.headers['set-cookie']).toEqual([
        expect.stringContaining('session=fixture;'),
      ]);
    }
  });

  it('keeps credentialed CORS preflight working with security headers', async () => {
    await request(server)
      .options('/api')
      .set('Origin', 'https://gaffer-virid.vercel.app')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204)
      .expect('Access-Control-Allow-Origin', 'https://gaffer-virid.vercel.app')
      .expect('Access-Control-Allow-Credentials', 'true')
      .expect('X-Content-Type-Options', 'nosniff');
  });
});
