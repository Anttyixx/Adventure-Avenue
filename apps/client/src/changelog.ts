/**
 * Player-facing release notes, newest first, shown in "What's new" on the main menu. Add an
 * entry at the top with every update players will notice. The `id` must be unique: the menu
 * shows a "New" badge until the player has opened the latest one.
 */
export interface ChangelogEntry {
  id: string;
  date: string;
  title: string;
  items: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-10-26-continue-online',
    date: 'Oct 26, 2026',
    title: 'Continue online games',
    items: [
      'The host can Continue a saved online game: the same room code opens again.',
      'Friends rejoin with the code and the same name (or their old invite link), then the host resumes.',
      'Anyone not back yet is played by a CPU until they join.',
    ],
  },
  {
    id: '2026-10-26-whats-new',
    date: 'Oct 26, 2026',
    title: "What's new",
    items: ['This page! See what changed in each update from the main menu.'],
  },
  {
    id: '2026-10-26-board-first',
    date: 'Oct 26, 2026',
    title: 'Pick on the board, live auctions and 5 players',
    items: [
      'Trades, auctions, renovations, debt sales and the cannon are chosen by tapping the board.',
      'Answer a trade with a counter-offer (up to 3 rounds).',
      'Auctions open a live window for everyone; bid right from it.',
      "Watch other players' arcade games and venture picks as they happen.",
      'Up to 5 players per game.',
      'The board is centered with seamless grass, district color areas, name tags over players and gold coins for money.',
      'The log opens above the player cards (newest at the bottom); online games show the room code.',
      'All four suits glow when you can level up at the bank.',
    ],
  },
  {
    id: '2026-10-26-playtest',
    date: 'Oct 26, 2026',
    title: 'Clearer turns and fairer boards',
    items: [
      'Player cards show cash, net worth, rank and money popups.',
      'Your options sit in the middle of the screen; choices glow with pins on the board.',
      'Invest right on the board, with a preview of what it does.',
      'Buy with stock and property as backup, and settle at the end of your turn.',
      'Venture lines of 4+ pay 10G per panel.',
      'A banner and faster music when someone can win.',
      'Every board has the bank in the middle and 4 properties per district.',
      'Rejoining online games works, and arcade screens are fixed.',
    ],
  },
  {
    id: '2026-10-26-online',
    date: 'Oct 26, 2026',
    title: 'Play online',
    items: [
      'Host a game and share a 4-letter room code; friends join from their own devices.',
      'If someone drops, a CPU plays for them until they rejoin.',
    ],
  },
  {
    id: '2026-10-25-sound',
    date: 'Oct 25, 2026',
    title: 'Sound and music',
    items: ['Sound effects and background music, with volume and mute in the speaker menu.'],
  },
  {
    id: '2026-10-25-menus',
    date: 'Oct 25, 2026',
    title: 'New menus and boards',
    items: [
      'A new main menu with Start and Continue, and a board carousel in game setup.',
      'Four new boards: Harbor, Crossroads City, Twin Lakes and Coral Isle.',
      'Build your own square or hex boards in the board editor and share them as files.',
    ],
  },
];

const SEEN_KEY = 'adventure-avenue-seen-update';

/** True when the newest entry has not been opened on this device yet. */
export function hasUnseenUpdate(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== CHANGELOG[0].id;
  } catch {
    return false;
  }
}

export function markUpdateSeen() {
  try {
    localStorage.setItem(SEEN_KEY, CHANGELOG[0].id);
  } catch {
    /* storage unavailable */
  }
}
