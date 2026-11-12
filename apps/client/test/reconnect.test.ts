import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeGame } from '../../../packages/engine/test/helpers';
import { HostRoom } from '../src/net/hostroom';
import { NET_VERSION } from '../src/net/protocol';
import type { SaveInfo } from '../src/save';

const network = vi.hoisted(() => ({ accept: null as null | ((c: unknown) => void) }));
vi.mock('../src/net/peer', () => ({
  openPeer: async () => ({
    on: (_: string, f: (c: unknown) => void) => {
      network.accept = f;
    },
  }),
  peerErrorText: () => 'Connection problem',
}));

function connection() {
  const listeners = new Map<string, (data?: unknown) => void>();
  return {
    open: true,
    send: vi.fn(),
    on: (event: string, f: (data?: unknown) => void) => listeners.set(event, f),
    close: () => listeners.get('close')?.(),
    hello: () =>
      listeners.get('data')?.({ t: 'hello', v: NET_VERSION, token: 'friend-device', name: 'Friend' }),
  };
}
function saved(online = true): SaveInfo {
  const { G } = makeGame();
  G.players[0].cpu = false;
  G.players[1].cpu = false;
  G.players[0].name = 'Host';
  G.players[1].name = 'Friend';
  return {
    state: G,
    savedAt: 1,
    ...(online
      ? {
          online: {
            code: 'KQZD',
            seats: [
              { pid: 0, kind: 'host' as const, name: 'Host' },
              { pid: 1, kind: 'remote' as const, name: 'Friend', token: 'friend-device' },
            ],
          },
        }
      : {}),
  };
}

describe('reconnecting to a saved game', () => {
  beforeEach(() => {
    network.accept = null;
  });
  it('sends room details, waits for Resume, then starts the guest from the saved turn', async () => {
    const room = await HostRoom.reopen(saved());
    const changed = vi.fn();
    room.onChange(changed);
    const conn = connection();
    network.accept!(conn);
    conn.hello();
    expect(room.lobby().seats[1].online).toBe(true);
    expect(changed).toHaveBeenCalled();
    const messages = () => conn.send.mock.calls.map(([m]) => m);
    expect(messages().some((m) => m.t === 'lobby' && m.lobby.boardName && m.lobby.resuming)).toBe(true);
    expect(messages().some((m) => m.t === 'start')).toBe(false);
    room.begin(room.game!);
    expect(messages().find((m) => m.t === 'start').start.you).toEqual([1]);
    expect(room.lobby().resuming).toBe(false);
  });
  it('keeps the replacement connection online when the old connection closes', async () => {
    const room = await HostRoom.reopen(saved());
    const old = connection();
    network.accept!(old);
    old.hello();
    const next = connection();
    network.accept!(next);
    next.hello();
    expect(room.lobby().seats[1].online).toBe(true);
    room.begin(room.game!);
    expect(next.send.mock.calls.some(([m]) => m.t === 'start')).toBe(true);
  });
  it('gives a local saved game a host who can resume and lets friends claim only local seats', async () => {
    const room = await HostRoom.reopen(saved(false));
    expect(room.lobby().seats[0].kind).toBe('host');
    const conn = connection();
    network.accept!(conn);
    conn.hello();
    expect(room.lobby().seats[1].kind).toBe('remote');
    expect(room.lobby().seats[1].online).toBe(true);
  });
});
