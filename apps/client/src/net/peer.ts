/**
 * Browser-to-browser connections (WebRTC) through PeerJS. PeerJS's free public server only
 * introduces the browsers to each other; game messages then go directly between them.
 *
 * Dev builds can point at another PeerJS server with `?peer=host:port` (used by tests).
 */
import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import { IS_DEV_BUILD } from '../build';

export type { DataConnection };

function options(): PeerOptions {
  const o: PeerOptions = { debug: 0 };
  const custom = IS_DEV_BUILD ? new URLSearchParams(location.search).get('peer') : null;
  if (custom) {
    const [host, port] = custom.split(':');
    Object.assign(o, { host, port: Number(port) || 9000, path: '/', secure: false });
  }
  return o;
}

/** Friendly text for PeerJS errors. */
export function peerErrorText(err: { type?: string; message?: string }): string {
  switch (err.type) {
    case 'peer-unavailable':
      return 'No game found with that code. Check the code and that the host is still in the lobby.';
    case 'unavailable-id':
      return 'That room code is taken.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Could not reach the connection server. Check your internet connection and try again.';
    case 'browser-incompatible':
      return 'This browser does not support online play.';
    default:
      return err.message || 'Connection problem.';
  }
}

/** Open a peer with the given id (or a random one). Rejects with a PeerJS error. */
export function openPeer(id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, options()) : new Peer(options());
    const fail = (err: unknown) => {
      peer.destroy();
      reject(err);
    };
    peer.once('open', () => {
      peer.off('error', fail);
      // Keep the link to the connection server so new players can still find the room.
      peer.on('disconnected', () => {
        if (!peer.destroyed) setTimeout(() => !peer.destroyed && peer.reconnect(), 1000);
      });
      resolve(peer);
    });
    peer.once('error', fail);
  });
}

/** Connect to another peer; resolves once the data channel is open. */
export function connectTo(peer: Peer, id: string, timeoutMs = 15000): Promise<DataConnection> {
  return new Promise((resolve, reject) => {
    const conn = peer.connect(id, { reliable: true, serialization: 'json' });
    const timer = setTimeout(() => {
      cleanup();
      conn.close();
      reject({
        type: 'timeout',
        message: 'Could not connect to the host. Their network may be blocking it.',
      });
    }, timeoutMs);
    const onErr = (err: unknown) => {
      cleanup();
      reject(err);
    };
    const cleanup = () => {
      clearTimeout(timer);
      peer.off('error', onErr);
    };
    peer.on('error', onErr);
    conn.once('open', () => {
      cleanup();
      resolve(conn);
    });
  });
}

export type { Peer };
