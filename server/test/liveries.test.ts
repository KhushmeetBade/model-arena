import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { ModelInfo, Provider } from '../src/types.js';

/** Test-only stub provider (never used by the real server). */
class Stub implements Provider {
  id = 'openrouter' as const;
  label = 'stub';
  billing = 'free' as const;
  keyEnvVar = 'OPENROUTER_API_KEY';
  isConfigured() {
    return true;
  }
  async listModels(): Promise<ModelInfo[]> {
    return [{ id: 'openrouter:acme/car:free', provider: 'openrouter', providerModel: 'acme/car:free', name: 'Acme: Car', free: true, available: true }];
  }
  async stream() {
    return { text: 'x' };
  }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-livery-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const ID = 'openrouter:acme/car:free';

describe('car customization API', () => {
  const { app } = createApp({ dataDir: dir, providers: [new Stub()] });

  it('saves colour, number, body style and nickname, and returns them to every page', async () => {
    const res = await request(app).put('/api/liveries').send({ modelId: ID, color: '#FF7A1A', number: 7, chassis: 2, nickname: '  Night   Owl ' });
    expect(res.status).toBe(200);
    expect(res.body.livery).toMatchObject({ color: '#ff7a1a', number: 7, chassis: 2, nickname: 'Night Owl' });
    const all = (await request(app).get('/api/liveries')).body.liveries;
    expect(all[ID]).toMatchObject({ color: '#ff7a1a', number: 7, chassis: 2, nickname: 'Night Owl' });
  });

  it('persists across a server restart', async () => {
    const again = createApp({ dataDir: dir, providers: [new Stub()] });
    expect((await request(again.app).get('/api/liveries')).body.liveries[ID]).toMatchObject({ number: 7, nickname: 'Night Owl' });
  });

  it('rejects invalid values with clear messages', async () => {
    const bad = async (body: object) => (await request(app).put('/api/liveries').send({ modelId: ID, ...body })).body.error as string;
    expect(await bad({ color: 'red' })).toMatch(/hex/);
    expect(await bad({ color: '#12345' })).toMatch(/hex/);
    expect(await bad({ number: 0 })).toMatch(/1 to 99/);
    expect(await bad({ number: 100 })).toMatch(/1 to 99/);
    expect(await bad({ number: 4.5 })).toMatch(/1 to 99/);
    expect(await bad({ chassis: 3 })).toMatch(/VORTEX/);
    expect(await bad({ nickname: 'x'.repeat(19) })).toMatch(/at most 18/);
    expect(await bad({ nickname: 42 })).toMatch(/text/);
    expect((await request(app).put('/api/liveries').send({ modelId: '../../etc/passwd' })).status).toBe(400);
    expect((await request(app).put('/api/liveries').send({ modelId: 'openrouter:unknown/model:free', number: 3 })).status).toBe(404);
  });

  it('strips markup and control characters from nicknames', async () => {
    const res = await request(app).put('/api/liveries').send({ modelId: ID, nickname: '<b>Bolt</b>\u0007' });
    expect(res.body.livery.nickname).toBe('bBolt/b');
  });

  it('an empty customization or reset restores the factory livery', async () => {
    await request(app).put('/api/liveries').send({ modelId: ID, number: 9 });
    expect((await request(app).put('/api/liveries').send({ modelId: ID, nickname: '' })).body.livery).toBeNull();
    await request(app).put('/api/liveries').send({ modelId: ID, number: 9 });
    await request(app).delete(`/api/liveries?modelId=${encodeURIComponent(ID)}`).expect(200);
    expect((await request(app).get('/api/liveries')).body.liveries[ID]).toBeUndefined();
  });
});
