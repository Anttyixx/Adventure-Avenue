/** Exact portal endpoints and permitted flow, shared by board feedback and travel animation. */
import type { GameState, Square } from '@aa/engine';

type Portal = NonNullable<Square['portals']>[number];
export interface PortalEnd {
  node: number;
  side: number;
}

/** Older saves have no destination side; retain their first matching endpoint as a fallback. */
export function portalPartner(G: GameState, node: number, link: Portal) {
  const candidates = G.nodes[link.to]?.portals?.filter((p) => p.to === node) ?? [];
  return link.toSide == null ? candidates[0] : candidates.find((p) => p.side === link.toSide);
}

/** Orient incoming links toward the selected exit, rather than animating backward from it. */
export function portalFlows(G: GameState, end: PortalEnd) {
  return (G.nodes[end.node]?.portals ?? [])
    .filter((p) => p.side === end.side)
    .flatMap((p) => {
      const back = portalPartner(G, end.node, p);
      if (!back) return [];
      const a = { node: end.node, side: end.side },
        b = { node: p.to, side: back.side };
      const forward = !G.nodes[a.node].noGo?.includes(b.node);
      const reverse = !G.nodes[b.node].noGo?.includes(a.node);
      if (!forward && !reverse) return [];
      return [{ from: forward ? a : b, to: forward ? b : a, both: forward && reverse }];
    });
}
