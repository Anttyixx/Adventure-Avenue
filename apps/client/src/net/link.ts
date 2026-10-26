/**
 * What the game screen (HotSeat) needs from an online game: who answers each decision, and
 * how answers travel. The host and guest rooms implement it.
 */
import type { DecisionRequest, GameState } from '@aa/engine';
import type { OnlineSave } from '../save';
import type { Answer } from './protocol';

/** Who answers a player's decisions on this device. */
export type Answerer = 'local' | 'cpu' | 'remote';

export interface GameLink {
  role: 'host' | 'guest';
  /** The room code, so it can be shown in the game for anyone who needs to rejoin. */
  code: string;
  who(pid: number): Answerer;
  /** Host: wait for a remote player's answer (a CPU answers if they drop). */
  request(seq: number, req: DecisionRequest): Promise<unknown>;
  /** Host: share an answer with every guest. */
  publish(a: Answer): void;
  /** Guest: send this device's answer to the host. */
  submit(seq: number, ans: unknown): void;
  /** Guest: wait for the host's answer to decision `seq`. */
  answer(seq: number): Promise<Answer>;
  /** True when the host is well ahead, so animations should hurry to catch up. */
  behind(seq: number): boolean;
  /** Called at every turn start (host: snapshot + hash; guest: hash check). */
  turnStart(seq: number, G: GameState): void;
  /** Host: the room details to keep in the save, so the game can be reopened online. */
  saveInfo?(): OnlineSave;
  /** Leave the game (closes connections). */
  leave(): void;
}
