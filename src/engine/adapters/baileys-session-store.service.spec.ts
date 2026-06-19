import { Repository } from 'typeorm';
import { BaileysSessionStoreService } from './baileys-session-store.service';
import { BaileysSessionData } from './baileys-session-data.entity';

describe('BaileysSessionStoreService', () => {
  let repo: { find: jest.Mock; upsert: jest.Mock; delete: jest.Mock };
  let service: BaileysSessionStoreService;

  beforeEach(() => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    service = new BaileysSessionStoreService(repo as unknown as Repository<BaileysSessionData>);
  });

  it('load groups rows by kind and parses contact/chat JSON; lid value is the bare phone', async () => {
    repo.find.mockResolvedValue([
      { kind: 'contact', entryKey: 'a@s.whatsapp.net', value: JSON.stringify({ id: 'a@s.whatsapp.net', name: 'A' }) },
      { kind: 'chat', entryKey: 'a@s.whatsapp.net', value: JSON.stringify({ id: 'a@s.whatsapp.net', name: 'A chat' }) },
      { kind: 'lid', entryKey: '111@lid', value: '628999' },
      { kind: 'contact', entryKey: 'bad', value: '{not json' }, // dropped
    ]);

    const snapshot = await service.load('sess-1');

    expect(repo.find).toHaveBeenCalledWith({ where: { sessionId: 'sess-1' } });
    expect(snapshot.contacts).toEqual([{ id: 'a@s.whatsapp.net', name: 'A' }]);
    expect(snapshot.chats).toEqual([{ id: 'a@s.whatsapp.net', name: 'A chat' }]);
    expect(snapshot.lidToPn).toEqual([['111@lid', '628999']]);
  });

  it('saveContacts upserts JSON rows keyed by (sessionId, kind, entryKey)', async () => {
    await service.saveContacts('sess-1', [{ id: 'a@s.whatsapp.net', name: 'A' } as { id: string }]);

    expect(repo.upsert).toHaveBeenCalledWith(
      [
        {
          sessionId: 'sess-1',
          kind: 'contact',
          entryKey: 'a@s.whatsapp.net',
          value: JSON.stringify({ id: 'a@s.whatsapp.net', name: 'A' }),
        },
      ],
      ['sessionId', 'kind', 'entryKey'],
    );
  });

  it('saveLidMappings stores the bare phone in value', async () => {
    await service.saveLidMappings('sess-1', [{ lid: '111@lid', pn: '628999' }]);
    expect(repo.upsert).toHaveBeenCalledWith(
      [{ sessionId: 'sess-1', kind: 'lid', entryKey: '111@lid', value: '628999' }],
      ['sessionId', 'kind', 'entryKey'],
    );
  });

  it('does not call the repo for an empty batch or entries without a key', async () => {
    await service.saveContacts('sess-1', []);
    await service.saveContacts('sess-1', [{ id: '' }]);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('clearSession deletes all rows for the session', async () => {
    await service.clearSession('sess-1');
    expect(repo.delete).toHaveBeenCalledWith({ sessionId: 'sess-1' });
  });
});
