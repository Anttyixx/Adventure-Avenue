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
    id: '2026-10-28-menu-pause',
    date: 'Oct 28, 2026',
    title: 'Pause and stock market pop-ups',
    features: [
      {
        tag: 'new',
        title: 'Pause from the menu',
        text: 'The menu opens in the middle of the screen, and a game on this device pauses while it is open.',
      },
      {
        tag: 'better',
        title: 'Stock market panel',
        text: 'The Stock market button sits under the game info at the top left and opens into the market right there.',
      },
    ],
  },
  {
    id: '2026-10-28-celebrations',
    date: 'Oct 28, 2026',
    title: 'Victory dance and stock rallies',
    features: [
      {
        tag: 'new',
        title: 'Victory celebration',
        text: 'The winner dances under falling confetti before the results appear.',
      },
      {
        tag: 'new',
        title: 'Stock rises',
        text: 'When a district stock goes up, the camera zooms in on the district and a banner shows the new price.',
      },
      {
        tag: 'new',
        title: 'Which way?',
        text: 'Before you roll, arrows on the board show the directions you can move.',
      },
    ],
    extras: [
      'Tokens stop their walk animation while a pop-up pauses them mid-move',
      'Charity card: nothing happens if you are already in last place',
    ],
  },
  {
    id: '2026-10-28-hud-layout',
    date: 'Oct 28, 2026',
    title: 'Tidier game screen',
    features: [
      {
        tag: 'better',
        title: 'One bar for status and choices',
        text: 'The bar at the bottom says what is going on, and morphs into your options when it is your move, then back again.',
      },
      {
        tag: 'better',
        title: 'Game log button',
        text: 'A Game log button sits above the player cards and opens into the log, as wide as the cards.',
      },
      {
        tag: 'new',
        title: 'Game info chip',
        text: 'The top left shows the board you are playing, the current round and the goal, with a Room button for online games.',
      },
    ],
    extras: ['Player cards are always shown (no Hide button)'],
  },
  {
    id: '2026-10-27-status-line',
    date: 'Oct 27, 2026',
    title: 'One status line',
    features: [
      {
        tag: 'better',
        title: 'Status line',
        text: 'The bottom left now has a single status line saying what is going on, like "Rosa is buying stocks..." or the last thing that happened, with its icon and names in player colors. Tap it and it turns into the full game log, where the current turn shows what it is waiting on until the player acts.',
      },
    ],
    extras: [
      'Buy, buyout and circus prompts show the fee rivals will pay instead of your cash',
      'Stock screen: the deal summary sits under the map and the share counter beside the shops',
    ],
  },
  {
    id: '2026-10-27-stocks-polish',
    date: 'Oct 27, 2026',
    title: 'Clearer stock deals',
    features: [
      {
        tag: 'better',
        title: 'See your discount',
        text: 'Buying at 10% off or selling at 20% above shows your price next to the market price, and how much you save or gain.',
      },
      {
        tag: 'better',
        title: 'Stock cards use the stock screen',
        text: 'Gift shares, Bull market and Bear market open the stock screen: pick the district on the map or list and see what changes.',
      },
      {
        tag: 'rules',
        title: 'Your own checkpoint',
        text: 'Passing your own checkpoint costs nothing but still raises its toll.',
      },
    ],
    extras: [
      'New circus art for all four levels (the flags take the owner’s color)',
      'Stock screen map: hover a district to outline all its properties',
      'Stock screen map no longer shows player dots',
      'A soft sound as each hop starts; the step sounds as you land',
      'No more Closed chip on player cards',
    ],
  },
  {
    id: '2026-10-27-play-join',
    date: 'Oct 27, 2026',
    title: 'Play and Join',
    features: [
      {
        tag: 'online',
        title: 'One Play button',
        text: 'Play opens game setup with a join code. If friends join, it’s an online game; if not, you play on this device.',
      },
      {
        tag: 'online',
        title: 'Join from the main menu',
        text: 'Type a friend’s code in the Join box and tap Join. You’ll see their game settings while you wait, and can pick your name and character.',
      },
      {
        tag: 'better',
        title: 'Any target you like',
        text: 'Set the target net worth with arrows on each digit, from 1,000G to 90,000G.',
      },
    ],
  },
  {
    id: '2026-10-27-actionbar',
    date: 'Oct 27, 2026',
    title: 'Roomier action bar',
    features: [
      {
        tag: 'better',
        title: 'Trades side by side',
        text: 'Proposing or answering a trade shows each player’s side in its own column, left and right.',
      },
      {
        tag: 'better',
        title: 'Prices on buildings',
        text: 'Building or renovating shows each building’s price right under its picture.',
      },
      {
        tag: 'better',
        title: 'Full zoom-out fits the board',
        text: 'Zooming all the way out now shows the whole board in the space between the menus, cards and action bar.',
      },
    ],
    extras: [
      'New art for the bank and the checkpoint (its flag and banner take the owner’s color)',
      'Player colors are now red, blue, green and purple (orange for a fifth player); yellow is gone',
      'Action bar grows a little when a question has more to show',
      'Stock screen: summary on the left, shares on the right',
      'Stock market panel no longer has empty space at the bottom',
    ],
  },
  {
    id: '2026-10-27-boards',
    date: 'Oct 27, 2026',
    title: 'Bigger boards and islands',
    features: [
      {
        tag: 'new',
        title: 'Two island boards',
        text: 'Sky Islands and Lagoon have islands you reach by landing on a warp square. Each island has all four suits, and every warp there takes you home.',
      },
      {
        tag: 'better',
        title: 'Every board redesigned',
        text: 'About 15% more squares, eight districts each, the bank in the middle, stocks squares far from the bank and Boon and Boom far apart.',
      },
      {
        tag: 'rules',
        title: 'Choose how many vacant plots',
        text: 'A new game option sets the vacant plots: None, A few, Some, A lot or All. Unless it is All, each building can be built at most 3 times.',
      },
    ],
    extras: ['Roomier stock market screen', 'Building names no longer cover the art on tiles'],
  },
  {
    id: '2026-10-27-seven',
    date: 'Oct 27, 2026',
    title: 'Lucky seven',
    features: [
      {
        tag: 'rules',
        title: 'The die goes up to 7',
        text: 'The die now has a 7 face: a six with an extra dot in the middle.',
      },
      {
        tag: 'new',
        title: 'Set your own goal',
        text: 'Pick Custom for the target net worth and set any amount in 1,000G steps, up to 90,000G.',
      },
      {
        tag: 'better',
        title: 'Every square explains itself',
        text: 'Hover any square on the board to see what it does, not just properties.',
      },
    ],
    extras: ['A little dance when you level up', 'Red No thanks on 5x buyouts'],
  },
  {
    id: '2026-10-27-property-art',
    date: 'Oct 27, 2026',
    title: 'Trades, building and new property art',
    features: [
      {
        tag: 'better',
        title: 'Trades in the action bar',
        text: "The board pulls back so every square shows, with everything but the two players' properties dimmed. Tap properties to add them, set cash with + and -, and answer offers the same way.",
      },
      {
        tag: 'better',
        title: 'Build from pictures',
        text: "Building and renovating show each building's picture in the action bar. Hover one to see what it does.",
      },
      {
        tag: 'new',
        title: 'Shops close behind gates',
        text: "Closed shops keep their gate down until the owner's next turn, then the gates roll back up for everyone to see.",
      },
      {
        tag: 'new',
        title: 'Painted shops and buildings',
        text: "Every shop design, the 3-Star Shop, each circus level and all the plot buildings have new art. Windows, doors and signs take the owner's color, and stay grey while unowned.",
      },
    ],
    extras: [
      'Invest more than your cash when stock or property can cover it',
      'Stock screen shows price per share and your cash, now and after',
      'A player who can win glows on their card',
      'Coin and place in front of cash and net worth',
    ],
  },
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
        tag: 'better',
        title: 'Easier to follow',
        text: "When shops close, the view pulls back to the whole board and their shutters roll down one by one. Everything that happens gets about a second, there's a short pause between turns, and the active player grows (and the others shrink) smoothly.",
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
      'Squares you can pick pulse with a white outline and spreading rings',
      'Online: your own player card is always at the bottom of the stack',
      'Player cards: full names, level chip, colored suits, cash and net worth (with your place) along the bottom',
      'Boon and Boom squares have their own symbols, shown on player cards while active',
      'Action bar: short questions slide up at the bottom of the screen, with prices and cash as chips',
      'Hex tiles: prices and fees no longer cut off by the edges',
      'Fees on owned tiles shown as plain numbers; no Turn tag on player cards',
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
