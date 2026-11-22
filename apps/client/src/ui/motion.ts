/** Motion shared by more than one part of the interface (see "Motion" in docs/design.md). */

/** Pop-ups closing: a tiny lift, then they sink and shrink away (the opening, reversed). */
export const POP_OUT: Keyframe[] = [
  { transform: 'none', opacity: 1 },
  { transform: 'translateY(-3px) scale(1.01)', opacity: 1, offset: 0.25 },
  { transform: 'translateY(18px) scale(0.95)', opacity: 0 },
];
