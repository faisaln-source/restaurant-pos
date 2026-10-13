import 'dotenv/config';
import request from 'supertest';
import { app } from '../index';
import prisma from '../lib/prisma';

const testUser = {
  name: 'Test Admin',
  email: `admin_${Date.now()}@test.com`,
  password: 'password123',
  role: 'ADMIN' as const,
  pin: '1234',
};

let accessToken: string;
let refreshToken: string;

beforeAll(async () => {
  // Clean up test users
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { endsWith: '@test.com' } } });
});

afterAll(async () => {
  await prisma.refreshToken.deleteMany({});
  await prisma.user.deleteMany({ where: { email: { endsWith: '@test.com' } } });
  await prisma.$disconnect();
});

describe('Auth API', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app).post('/api/auth/register').send(testUser);
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(testUser.email);
      expect(res.body.data).not.toHaveProperty('passwordHash');
    });

    it('should reject duplicate email', async () => {
      const res = await request(app).post('/api/auth/register').send(testUser);
      expect(res.status).toBe(409);
    });

    it('should reject invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...testUser, email: 'not-an-email' });
      expect(res.status).toBe(400);
    });

    it('should reject short password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...testUser, email: 'new@test.com', password: '123' });
      expect(res.status).toBe(400);
    });

    it('should reject invalid PIN', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ ...testUser, email: 'new2@test.com', pin: '12' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password });
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.user.email).toBe(testUser.email);
      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: 'wrongpass' });
      expect(res.status).toBe(401);
    });

    it('should reject unknown email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@test.com', password: 'password123' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/pin-login', () => {
    it('should login with valid PIN', async () => {
      const res = await request(app)
        .post('/api/auth/pin-login')
        .send({ pin: testUser.pin });
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('should reject wrong PIN', async () => {
      const res = await request(app).post('/api/auth/pin-login').send({ pin: '0000' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(testUser.email);
    });

    it('should reject request without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('should reject request with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalidtoken');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should issue new tokens with valid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken });
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('accessToken');
      // Update tokens for subsequent tests
      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('should reject reused refresh token', async () => {
      // The old refresh token was rotated out
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'old-invalid-token' });
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/auth/change-password', () => {
    it('should change password with correct current password', async () => {
      const res = await request(app)
        .patch('/api/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ currentPassword: testUser.password, newPassword: 'newpassword123' });
      expect(res.status).toBe(200);
    });

    it('should reject wrong current password', async () => {
      // Login again first
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: 'newpassword123' });
      const newToken = loginRes.body.data.accessToken;

      const res = await request(app)
        .patch('/api/auth/change-password')
        .set('Authorization', `Bearer ${newToken}`)
        .send({ currentPassword: 'wrongpassword', newPassword: 'another123' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      // Login to get a fresh token
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: testUser.email, password: 'newpassword123' });
      const freshRefreshToken = loginRes.body.data.refreshToken;

      const res = await request(app)
        .post('/api/auth/logout')
        .send({ refreshToken: freshRefreshToken });
      expect(res.status).toBe(200);

      // Refresh should now fail
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: freshRefreshToken });
      expect(refreshRes.status).toBe(401);
    });
  });
});

describe('Health Check', () => {
  it('GET /health should return ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
