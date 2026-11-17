/**
 * The UI Lab's sections, on their own so the dev menu can list them without loading the whole
 * Lab (it is a big file that only loads when the Lab is opened).
 */
export const LAB_SECTIONS = [
  { id: 'cards', title: 'Player cards' },
  { id: 'prompts', title: 'Action bar & banners' },
  { id: 'board', title: 'Board effects' },
  { id: 'dialogs', title: 'Dialogs' },
  { id: 'games', title: 'Venture' },
  { id: 'arcade', title: 'Arcade Lab' },
  { id: 'turns', title: 'Turn moments' },
  { id: 'art', title: 'Property designs' },
  { id: 'panels', title: 'Log, market & results' },
] as const;
