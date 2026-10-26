/**
 * Investing, on the board: the player's shops that can grow light up with how much each can
 * take; tapping one opens the amount picker for that shop.
 */
import { PLAYER_COLORS, type GameState, type Player } from '@aa/engine';
import type { BoardView } from '../board';
import { fmt } from './dom';
import type { Hud } from './hud';
import { investAmountModal } from './modals';

export async function investOnBoard(
  hud: Hud,
  board: BoardView,
  G: GameState,
  p: Player,
  shops: { sq: number; room: number }[],
  max: number,
): Promise<{ sq: number; amount: number } | null> {
  const lim = new Map(shops.map((s) => [s.sq, Math.min(s.room, max)]));
  const color = PLAYER_COLORS[p.color];
  for (;;) {
    board.setChoices(
      shops.map((s) => s.sq),
      color,
      (id) => hud.resolvePrompt(id),
    );
    const id = await hud.prompt<number | null>(
      shops.length > 1
        ? `Invest: tap any of your glowing shops (you can invest up to ${fmt(max)}).`
        : `Invest: tap your glowing shop to invest in it.`,
      [{ label: "Don't invest", value: null, secondary: true }],
      p.color,
    );
    board.clearChoices();
    if (id == null) return null;
    // Keep the chosen shop lit while the amount is picked.
    board.setChoices([id], color, () => {}, undefined, { pins: false });
    const amount = await investAmountModal(hud, G, id, lim.get(id)!);
    board.clearChoices();
    if (amount) return { sq: id, amount };
  }
}
