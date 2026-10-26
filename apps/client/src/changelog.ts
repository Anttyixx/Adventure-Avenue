/**
 * Player-facing release notes, newest first, shown in "What's new" on the main menu. Add an
 * entry at the top with every update players will notice. The `id` must be unique: the menu
 * shows a "New" badge until the player has opened the latest one.
 *
 * Each entry lists its biggest changes first as `features` (cards with a short heading), then
 * smaller ones as `extras` (compact chips). Fold similar changes into one feature.
 */
export type ChangeTag = 'new' | 'better' | 'rules' | 'online' | 'fix';

export interface ChangelogFeature {
  tag: ChangeTag;
  title: string;
  text: string;
}

export interface ChangelogEntry {
  id: string;
  date: string;
  title: string;
  /** Most important first. */
  features: ChangelogFeature[];
  /** Small changes, one short phrase each. */
  extras?: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-10-26-townsfolk',
    date: 'Oct 26, 2026',
    title: 'New characters',
    features: [
      {
        tag: 'new',
        title: 'Pick your character',
        text: 'Nine hand-drawn townsfolk with idle and walking animations. Everyone starts with a random one; tap your picture in game setup or the online lobby to pick another nobody has. It stays yours for the whole game.',
      },
      {
        tag: 'better',
        title: 'Easier to spot on the board',
        text: 'Characters face the way they walk and have a soft shadow around them, so they stand out from the board. Player cards show their whole head, with their place next to the name.',
      },
      {
        tag: 'new',
        title: 'Credits',
        text: 'A new Credits button on the main menu thanks the artists and makers whose work the game uses, with links to their pages.',
      },
    ],
  },
  {
    id: '2026-10-26-camera-trades',
    date: 'Oct 26, 2026',
    title: 'Zoom, trade screen and auction timer',
    features: [
      {
        tag: 'new',
        title: 'Trade and auction screen',
        text: 'Pick your partner first, then tap properties on a view of the whole board. Nothing is hidden behind the interface.',
      },
      {
        tag: 'new',
        title: 'Auction timer',
        text: 'A new auction window with a 12-second clock. Run out of time and it counts as a pass.',
      },
      {
        tag: 'better',
        title: 'Zoom the map',
        text: 'The camera always follows the player. Scroll, pinch or press - and + to see more; zoomed far out, the whole board centers.',
      },
      {
        tag: 'rules',
        title: 'Bank and winning',
        text: 'Passing the bank only matters when you level up. Landing always lets you buy stock. To win, arrive at the bank with the target net worth.',
      },
      {
        tag: 'online',
        title: 'Easier rejoining',
        text: 'Reloading puts you straight back in. The menu offers Rejoin, and friends can take their seat after a continued game resumes.',
      },
    ],
    extras: [
      'Game menu in the top right: rules, sound, full screen and quit (with a confirm); Stock market button beside it',
      'Cleaner panels without scrollbars',
      'Game log moved to the bottom left: tap the last action to open it',
      'Round and target moved into the game menu',
      'Zoom out further',
      'Active player always centered',
      'Zoom % chip in the top right (tap to reset): 250% close up to 100% far out, in 5% steps',
      "Property tiles: district-colored border, filled with the owner's color (unowned ones plain grey)",
      'Checkpoint tolls paid while walking past',
      'Sell only the shares you need in debt',
      'Grey venture panels until picked',
      'Change-of-suit squares off built-in boards',
      'Tile pop-ups stay on screen',
      "Easier-to-read What's new",
    ],
  },
  {
    id: '2026-10-26-continue-online',
    date: 'Oct 26, 2026',
    title: 'Continue any game online',
    features: [
      {
        tag: 'online',
        title: 'Take a local game online',
        text: "Continue opens a room for every saved game. Friends join with the code and their player's name to take that seat.",
      },
      {
        tag: 'online',
        title: 'Reopen saved online games',
        text: 'The same room code opens again. Friends rejoin with the code and the same name; a CPU plays for anyone not back yet.',
      },
      {
        tag: 'new',
        title: "What's new",
        text: 'This page! See what changed in each update from the main menu.',
      },
    ],
  },
  {
    id: '2026-10-26-board-first',
    date: 'Oct 26, 2026',
    title: 'Pick on the board, live auctions and 5 players',
    features: [
      {
        tag: 'better',
        title: 'Choose on the board',
        text: 'Trades, auctions, renovations, debt sales and the cannon are picked by tapping the board.',
      },
      {
        tag: 'new',
        title: 'Live auctions and counter-offers',
        text: 'Everyone bids from a live auction window. Answer a trade with a counter-offer (up to 3 rounds).',
      },
      { tag: 'new', title: 'Up to 5 players', text: 'Room for one more at the table.' },
      {
        tag: 'better',
        title: 'Watch other players',
        text: "See other players' arcade games and venture picks as they happen.",
      },
    ],
    extras: [
      'Centered board with seamless grass',
      'Name tags over players',
      'Gold coins for money',
      'Log above the player cards',
      'Room code shown in online games',
      'Suits glow when you can level up',
    ],
  },
  {
    id: '2026-10-26-playtest',
    date: 'Oct 26, 2026',
    title: 'Clearer turns and fairer boards',
    features: [
      {
        tag: 'better',
        title: 'Clearer turns',
        text: 'Your options sit in the middle of the screen, choices glow with pins on the board, and player cards show cash, net worth and rank.',
      },
      {
        tag: 'rules',
        title: 'Buy now, settle later',
        text: 'Buy with stock and property as backup, and settle any debt at the end of your turn.',
      },
      {
        tag: 'better',
        title: 'Fairer boards',
        text: 'Every board has the bank in the middle and 4 properties per district.',
      },
    ],
    extras: [
      'Invest right on the board',
      'Venture lines of 4+ pay 10G per panel',
      'Banner and faster music when someone can win',
      'Rejoining and arcade fixes',
    ],
  },
  {
    id: '2026-10-25-online',
    date: 'Oct 25-26, 2026',
    title: 'Play online, sound and new boards',
    features: [
      {
        tag: 'online',
        title: 'Play online',
        text: 'Host a game and share a 4-letter room code; friends join from their own devices. A CPU fills in if someone drops.',
      },
      {
        tag: 'new',
        title: 'Board editor',
        text: 'Build your own square or hex boards and share them as files.',
      },
      {
        tag: 'new',
        title: 'Four new boards',
        text: 'Harbor, Crossroads City, Twin Lakes and Coral Isle.',
      },
      {
        tag: 'new',
        title: 'Sound and music',
        text: 'Sound effects and background music, with volume and mute in the speaker menu.',
      },
    ],
    extras: ['New main menu with Start and Continue', 'Board carousel in game setup'],
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
