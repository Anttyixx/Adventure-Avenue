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
    id: '2026-11-06-phone-layout',
    date: 'Nov 6, 2026',
    title: 'Fits on small phones',
    features: [
      {
        tag: 'better',
        title: 'Made for small screens',
        text: 'On phones the player cards are slimmer, the top buttons stay on one row, and arcade games and auctions shrink to fit instead of being cut off. Nothing overlaps, even with five players on a small phone.',
      },
    ],
    extras: ['Game setup keeps the players and Start on one row on phones'],
  },
  {
    id: '2026-11-06-live-auctions',
    date: 'Nov 6, 2026',
    title: 'Live auctions',
    features: [
      {
        tag: 'new',
        title: 'Bid any time',
        text: 'Auctions no longer go round in turns: everyone can bid or pass at any moment. The auction ends 5 seconds after the last bid (the highest bid wins), or as soon as everyone else has passed.',
      },
      {
        tag: 'better',
        title: 'A new auction screen',
        text: 'A countdown bar that refills with every bid, the high bid and every bidder in the pop-up, and Bid and Pass always ready in the action bar. Players sharing a device each get their own buttons.',
      },
    ],
    extras: ['The Guide is now in the Menu'],
  },
  {
    id: '2026-11-06-phone-popups',
    date: 'Nov 6, 2026',
    title: 'Bigger venture board, tidier phone screens',
    features: [
      {
        tag: 'better',
        title: 'A bigger venture board',
        text: 'The venture board and its tiles are bigger, so tiles are easier to tap, especially on phones.',
      },
      {
        tag: 'better',
        title: 'Pop-ups line up on phones',
        text: 'On small screens, where the action bar sits in the bottom left, the stock market, auctions, the venture board, arcade games and the info pop-up line up on the left with it, using all the room up to the player cards.',
      },
    ],
    extras: ['A compact auction pop-up on phones, so every bidder fits'],
  },
  {
    id: '2026-11-06-quiet-moves',
    date: 'Nov 6, 2026',
    title: 'Quieter moves',
    features: [
      {
        tag: 'better',
        title: 'No more hop sound',
        text: 'Players moving across the board now only make a soft step on each tile and a chime where they stop.',
      },
    ],
  },
  {
    id: '2026-11-06-shutters',
    date: 'Nov 6, 2026',
    title: 'Snappier shop shutters',
    features: [
      {
        tag: 'better',
        title: 'Every shutter makes a sound',
        text: 'When shops close or reopen, each shutter plays its own quick rattle as it moves, and the shops start closing one right after another, so it is over much sooner.',
      },
    ],
  },
  {
    id: '2026-11-06-motel-taxi-swap',
    date: 'Nov 6, 2026',
    title: 'Motels, taxis, swaps and your player card',
    features: [
      {
        tag: 'new',
        title: 'Three new squares',
        text: 'Price Up raises your fees 10% until your next turn. Taxi rides you to any special square and uses it. Swap trades places with any player. Find them on Town, Harbor and Crossroads City, and in the board builder.',
      },
      {
        tag: 'new',
        title: 'The Motel',
        text: 'A new building that replaces the Home. Anyone passing a motel can stop there instead of moving on. Rivals who stop pay 25% of the cash they hold; the owner can invest in a shop.',
      },
      {
        tag: 'new',
        title: 'Your player card',
        text: 'Set your name and character on the main menu. You play as them when you start or join a game. If someone in the game already has your character, you get a random one (you can still change it).',
      },
      {
        tag: 'better',
        title: 'Party games: everyone chooses at once',
        text: 'In Coin Derby, Lucky Wheel and Treasure Split everyone picks at the same time and locks in. The round starts as soon as everyone has.',
      },
      {
        tag: 'better',
        title: 'Auctions in the action bar',
        text: 'The auction is a pop-up with the lot and the bidders, and you bid from the action bar, like the stock market.',
      },
    ],
    extras: [
      'New motel art: its sign shows the owner’s color',
      'The build menu shows how many of each building are left',
      'Flying or riding anywhere no longer lights up every square',
      'The 250% zoom is as close on big boards as on small ones',
      'Players who joined can type their name without being interrupted',
      'Smaller red remove buttons on player cards',
    ],
  },
  {
    id: '2026-11-05-bank-districts',
    date: 'Nov 5, 2026',
    title: 'New districts around the bank',
    features: [],
    extras: [
      'Return Ridge adds a district above the bank and one below, replacing eight middle specials. Four Boon tiles become Roll-again tiles, for eight Roll-again tiles total.',
    ],
  },
  {
    id: '2026-11-05-compact-ridge',
    date: 'Nov 5, 2026',
    title: 'A smaller Return Ridge',
    features: [],
    extras: [
      'Return Ridge now has ten districts on a smaller board, no change-of-suit tiles, and four Roll-again tiles. Each suit is near a branch tip, just before its return portal.',
    ],
  },
  {
    id: '2026-11-05-ridge-variety',
    date: 'Nov 5, 2026',
    title: 'More varied Return Ridge routes',
    features: [],
    extras: [
      'Special tiles appear in different orders and at varied distances from the bank across Return Ridge’s four branches.',
    ],
  },
  {
    id: '2026-11-05-ridge-pairs',
    date: 'Nov 5, 2026',
    title: 'Return Ridge property pairs',
    features: [],
    extras: [
      'Return Ridge now groups each district into two touching property pairs, separated by relief tiles.',
    ],
  },
  {
    id: '2026-11-05-twelve-districts',
    date: 'Nov 5, 2026',
    title: 'Bigger districts lineup',
    features: [
      {
        tag: 'rules',
        title: 'Up to twelve districts',
        text: 'Boards can now have twelve districts, with four properties in each. Two new district colors and names are available in the builder.',
      },
      {
        tag: 'better',
        title: 'Return Ridge expanded',
        text: 'Return Ridge now has twelve districts and 48 properties. Only four venture squares remain, with varied relief stops between shops.',
      },
    ],
  },
  {
    id: '2026-11-05-return-ridge',
    date: 'Nov 5, 2026',
    title: 'More portal routes',
    features: [
      {
        tag: 'better',
        title: 'Eight districts in Prism Junction',
        text: 'Prism Junction now has four hexagonal loops with eight full districts and four portal pairs.',
      },
      {
        tag: 'new',
        title: 'Return Ridge',
        text: 'Explore four winding dead-end branches. Portals at their tips return you two spaces before the bank. Eight districts, with relief stops between properties.',
      },
    ],
  },
  {
    id: '2026-11-06-setup-tidy',
    date: 'Nov 6, 2026',
    title: 'Tidier game setup',
    features: [
      {
        tag: 'fix',
        title: 'Everything lines up',
        text: 'In game setup, the winning goal digits sit level, the player cards line up their names and tags, and your name box no longer looks greyed out.',
      },
    ],
    extras: ['"+ Player on this device" is now "+ Local player", and phones show it too'],
  },
  {
    id: '2026-11-05-portal-maps',
    date: 'Nov 5, 2026',
    title: 'Two new portal boards',
    features: [
      {
        tag: 'new',
        title: 'Crossgate Gardens',
        text: 'Four square courtyards joined by portal shortcuts. Step into a portal and keep moving through a different quarter.',
      },
      {
        tag: 'new',
        title: 'Prism Junction',
        text: 'Three hexagonal loops with portals between their outer rims and roads back to the central bank.',
      },
    ],
    extras: [
      'Districts stay together, with relief tiles between every property. Both boards are available in game setup and the board builder.',
    ],
  },
  {
    id: '2026-11-08-setup-layout',
    date: 'Nov 8, 2026',
    title: 'A new game setup screen',
    features: [
      {
        tag: 'better',
        title: 'Game setup, rearranged',
        text: 'Back, the title, the join code and Sound stay at the top; the players and Start game stay at the bottom in a bar that grows and shrinks with the players. The board picker and the game settings sit side by side, and on most screens it all fits without scrolling.',
      },
      {
        tag: 'new',
        title: 'Setup music',
        text: 'Game setup and the online lobbies have their own upbeat "getting ready" tune.',
      },
    ],
    extras: [
      'Board tools are chips on the board picker',
      'The winning goal has no Min/Max buttons',
      'Music cross-fades when it changes between screens',
    ],
  },
  {
    id: '2026-11-08-info-popup',
    date: 'Nov 8, 2026',
    title: 'One Info pop-up for the game, stocks and players',
    features: [
      {
        tag: 'new',
        title: 'Info button',
        text: 'A new Info button next to the info chip opens one pop-up with everything to look up. Pick a page in the action bar: Game (how to win, the game so far and the standings), Stocks (the stock market) or any player.',
      },
      {
        tag: 'better',
        title: 'Player cards open the player page',
        text: 'Tapping a player card opens their page in the same pop-up. It replaces the old Stock market button and the separate player pop-up.',
      },
    ],
    extras: [
      'A Properties page shows every property, two districts to a row, with owners and what is still for sale',
      'Properties page: tap a player chip to highlight their properties; the chips stay pinned at the top',
      'Finding a property on the board waits for you: Back to info returns, and zooming centers on it',
      'The Game page standings look like the player cards',
      'Player pages: net worth beside the name, a goal bar that shows how far along on hover, and the next promotion pay',
      "A player's properties are a list: the building on the left, its details on the right",
      'Closing the Info pop-up no longer flickers',
      'The main menu title and Play button sit higher on the screen',
      'Player pages are shorter; a long property list scrolls inside its column',
      'The View board chip works with the Info pop-up too, and glows to catch your eye',
      'Info pages pop out and in; every player page has the same size and more breathing room',
      'The info chip is shorter: the board and round moved to the Game page',
    ],
  },
  {
    id: '2026-11-08-stock-sounds-view-board',
    date: 'Nov 8, 2026',
    title: 'Stock sounds and a peek at the board',
    features: [
      {
        tag: 'new',
        title: 'View the board from any pop-up',
        text: 'While the stock market, the venture board or an arcade game is up, a View board chip pops in next to the zoom. Tap it to hide the pop-up and see the whole board; tap Back to return. The chip, the action bar and the pop-up all animate smoothly as they change.',
      },
      {
        tag: 'better',
        title: 'Tidier stock bar',
        text: 'The summary is split in two: the market (price and your shares) on top, and what you pay (price per share and your cash) below. Deals cross out the market price and show their chip in the corner; the counter is smaller with Max right beside it.',
      },
    ],
    extras: [
      'New sounds for buying and selling stock',
      'A slightly wider Price column',
      'Picking a district on the stock screen clicks',
      'Gift shares: a shorter heading',
    ],
  },
  {
    id: '2026-11-07-stock-bar-polish',
    date: 'Nov 7, 2026',
    title: 'Stock screen polish',
    features: [
      {
        tag: 'better',
        title: 'Clearer deals',
        text: 'At a discount or a premium, the normal price per share is crossed out with your price glowing beside it. The heading just says which shares you are buying or selling.',
      },
      {
        tag: 'new',
        title: 'Shaken districts',
        text: 'A district hit by a sell-off shows a small red falling-chart icon next to its name. The note under the table is gone.',
      },
    ],
    extras: [
      'Stock screen: map top left, shop cards under it, table on the right, centered on screen',
      'Stock table: wider share columns, a slimmer Price column with a bigger heading',
      'Phones show 6 districts at a time; the list shifts as you move through them',
      'Even spacing inside the stock action bar',
    ],
  },
  {
    id: '2026-11-07-stocks-zoom-venture',
    date: 'Nov 7, 2026',
    title: 'A new stock screen, clearer zoom and smoother venture cards',
    features: [
      {
        tag: 'better',
        title: 'New stock screen',
        text: 'Buying and selling stock now works like the rest of the game: the stock market opens in the middle of the screen and your choice (how many shares, what it costs, Buy or Skip) sits in the action bar.',
      },
      {
        tag: 'new',
        title: 'Zoom modes',
        text: 'The zoom chip shows who controls the zoom: grey when it is all yours, blue when the game is showing you part of the board (you can still zoom), red when the game is showing something and the zoom is locked for a moment.',
      },
      {
        tag: 'better',
        title: 'Venture cards without the flicker',
        text: 'Flip a card and it shows straight away with what it does and an OK button, with nothing else in between. A bonus line pays out once you close the venture board.',
      },
      {
        tag: 'online',
        title: 'Watch where others can go',
        text: 'While another player decides where to move, you see the squares they can land on. Once they pick, they walk there as usual.',
      },
    ],
    extras: [
      'Every arcade game gets played once before any repeats',
      'Landing on your own shop with nothing to invest in now says so',
      'New sounds for shops closing and reopening',
    ],
  },
  {
    id: '2026-11-06-setup-venture-domination',
    date: 'Nov 6, 2026',
    title: 'New game setup, dominations and a grand finale',
    features: [
      {
        tag: 'better',
        title: 'Redesigned game setup',
        text: 'You start in the game; add bots with one tap (up to 5 players). Friends who join take a free seat, or replace a bot when the game is full. Characters stand centered on their own spot.',
      },
      {
        tag: 'new',
        title: 'Dominations',
        text: 'Owning a whole district now gets its own moment: the camera shows it, a banner and fanfare play and the shops sparkle, once the purchase or trade is done.',
      },
      {
        tag: 'better',
        title: 'Venture cards, your pace',
        text: 'Read your card and press OK when done (it closes by itself after 10 seconds); everyone else sees it until then. Line bonuses burst up from your tile, with a fanfare for a full row.',
      },
      {
        tag: 'new',
        title: 'A grand finale',
        text: 'Winning now plays a longer victory fanfare with fireworks and confetti.',
      },
    ],
    extras: [
      'Other players can watch the terms while two players negotiate a trade; the log keeps just one line for how it ended.',
      'District stock moves play straight away, even mid-walk; investing shows the shop rising first.',
      'After a roll, the die shrinks beside you before you start walking.',
      'Zoomed all the way out, the board sits in the middle of the window, clear of the menus.',
      'Lucky Reels pays a bit more, and kept slots stay still while the others spin.',
      'Memory Blocks prizes take effect after the game closes, on the board.',
      'Build and Skip sit side by side in the build bar.',
      'Peppier venture board music and livelier arcade tunes.',
      'The game log no longer cuts off its newest line.',
    ],
  },
  {
    id: '2026-11-05-arcade-music',
    date: 'Nov 5, 2026',
    title: 'A tune for every game',
    features: [
      {
        tag: 'new',
        title: 'Music for each arcade game',
        text: 'Lucky Reels, Memory Blocks, Coin Derby, Lucky Wheel and Treasure Split each have their own music, alongside the venture board’s.',
      },
      {
        tag: 'better',
        title: 'Spinning reels',
        text: 'Lucky Reels slots now spin through the symbols and stop one by one, with ticking and a clunk as each lands.',
      },
    ],
    extras: ['Treasure Split adds up your coins each round and hands them all out at the end.'],
  },
  {
    id: '2026-11-05-music-guide-tiles',
    date: 'Nov 5, 2026',
    title: 'Music, a card-style Guide and tidier tiles',
    features: [
      {
        tag: 'new',
        title: 'Venture and arcade music',
        text: 'The venture board and the arcade games each have their own tune, and turning over a venture card makes a card-flip sound. Bonus lines now flip tile by tile from the card you picked.',
      },
      {
        tag: 'better',
        title: 'Guide with cards and an Arcade tab',
        text: 'Every Guide topic is now a card with an icon and short points, and a new Arcade games tab explains all five games and their prizes.',
      },
      {
        tag: 'better',
        title: 'Tidier board tiles',
        text: 'Pictures and prices sit in the same place on every tile, with a little room around them inside the border, so the board looks cleaner.',
      },
    ],
    extras: [
      'Shops reopen in the background: no zooming out and no waiting.',
      'People watching a venture card no longer get a Close button; the card closes by itself after a few seconds (also for the player who drew it).',
      'Lucky Reels slots are square.',
      'Coin Derby shows each player walking down their lane on bigger spaces.',
    ],
  },
  {
    id: '2026-11-05-arcade-boards',
    date: 'Nov 5, 2026',
    title: 'Arcade games, redone',
    features: [
      {
        tag: 'better',
        title: 'Arcade games on the board',
        text: 'Like the venture board, each arcade game now sits in the middle of the screen with its instructions, choices and results in the action bar, instead of a pop-up. Party games show who has picked so far.',
      },
      {
        tag: 'new',
        title: 'Memory Blocks with flip cards',
        text: 'Cards deal in, flip face up so you can memorize them, then flip face down. Nothing peeks through any more: the coin cards used to show their coins.',
      },
      {
        tag: 'rules',
        title: 'A clearer Coin Derby',
        text: 'Race down a 15-space track. Each leg, sprint 3-5 spaces or grab 30G and move 1-3. Whoever is furthest after three legs wins a bonus, and everyone keeps their coins.',
      },
    ],
    extras: [
      'Lucky Reels: two rerolls and smaller prizes, a prize ladder that lights your set, and only the winning slots glow at the end.',
      'Lucky Wheel: tap a bet on the board; winning bets light up with each player’s result.',
      'Treasure Split: chests open to show who picked them and each share.',
      'Arcade results move on faster with Fast CPU when only CPUs played.',
    ],
  },
  {
    id: '2026-11-04-arcade-party',
    date: 'Nov 4, 2026',
    title: 'More ways to play at the arcade',
    features: [
      {
        tag: 'better',
        title: 'Five-slot Lucky Reels',
        text: 'Build a winning set with five slots, locks and three rerolls. Collect early or chase the jackpot.',
      },
      {
        tag: 'new',
        title: 'Everyone joins in',
        text: 'Race in Coin Derby, share chests in Treasure Split, or bet up to 100G on Lucky Wheel. All five arcade games can appear when you land on an arcade.',
      },
    ],
    extras: ['Try every game in the Arcade Lab. Memory Blocks remains in the rotation.'],
  },
  {
    id: '2026-11-04-venture-size',
    date: 'Nov 4, 2026',
    title: 'Bigger venture board',
    features: [],
    extras: [
      'The venture board and its tiles are bigger on monitors and large screens; phones keep the same size.',
    ],
  },
  {
    id: '2026-11-04-play-join',
    date: 'Nov 4, 2026',
    title: 'Play and Join in one button',
    features: [
      {
        tag: 'better',
        title: 'One button to start or join',
        text: 'The Play button now has a code field on its right. Type a friend’s 4-letter code and it turns into a blue Join button. Continue sits just under it when you have a saved game.',
      },
    ],
    extras: [
      'Continue is now a smaller, narrower button centered under Play.',
      'On phones the action bar now shrinks to fit short messages instead of keeping a fixed minimum width.',
    ],
  },
  {
    id: '2026-11-04-log-toolbar',
    date: 'Nov 4, 2026',
    title: 'Game log in the toolbar',
    features: [
      {
        tag: 'better',
        title: 'Game log button moved',
        text: 'The Game log button now sits in the top right toolbar, between the zoom and Guide. It opens the log as a panel just under the toolbar, above the player cards.',
      },
    ],
  },
  {
    id: '2026-11-04-menu-compact',
    date: 'Nov 4, 2026',
    title: 'A neater title screen',
    features: [
      {
        tag: 'better',
        title: 'Main menu layout',
        text: 'The title always sits on top, so it no longer overlaps the buttons on small screens. Play stays the big button; Continue and Join are now slim rows, and Rejoin is a small chip in the top left corner.',
      },
    ],
    extras: [
      'Fixed the action bar sometimes squeezing its buttons under the player cards on tablets: when they would not fit centered, it now moves to the bottom left.',
      'The building picker no longer resizes the action bar on every tap: a building’s details now show in a tip just above its card.',
    ],
  },
  {
    id: '2026-11-04-fixed-title-screen',
    date: 'Nov 4, 2026',
    title: 'A single-page main menu',
    features: [],
    extras: [
      'The main menu fits the screen without scrolling, including Continue and Rejoin. Landscape phones place the title beside the menu actions.',
    ],
  },
  {
    id: '2026-11-04-build-picker',
    date: 'Nov 4, 2026',
    title: 'A clearer building picker',
    extras: [
      'On phones and other narrow screens, the action bar sits in the bottom left corner so its text and buttons have more room.',
    ],
    features: [
      {
        tag: 'better',
        title: 'Building on a vacant plot',
        text: 'The action bar now shows every building as a same-size card. Tap one to read what it does for rivals and for you, then press Build (or tap it again). Buildings you can’t build are greyed out and say why. Works the same when renovating, and fits on phones.',
      },
    ],
  },
  {
    id: '2026-11-03-main-menu',
    date: 'Nov 3, 2026',
    title: 'A tidier main menu',
    features: [
      {
        tag: 'better',
        title: 'Menu button',
        text: "What's new, the board editor and Credits now live in a Menu button in the top right, next to Sound, so the title screen is just Play and Join.",
      },
    ],
  },
  {
    id: '2026-11-02-handoff-start',
    date: 'Nov 2, 2026',
    title: 'A shorter turn-end pause',
    features: [],
    extras: [
      'Turn-end pauses are back to one second. Passing-the-turn text starts with the camera glide; the slower camera transition stays.',
    ],
  },
  {
    id: '2026-11-02-action-lifecycle',
    date: 'Nov 2, 2026',
    title: 'Messages follow the action',
    features: [
      {
        tag: 'fix',
        title: 'The current action comes first',
        text: 'The action bar explains turn handoffs and switches as rolling, moving and other actions actually start. Roll results show for a second before movement. Suit pickups briefly take priority over moving, then movement text resumes. Short CPU choices no longer flash deciding messages.',
      },
    ],
  },
  {
    id: '2026-11-02-calm-action-messages',
    date: 'Nov 2, 2026',
    title: 'Smoother turns and clearer messages',
    features: [
      {
        tag: 'better',
        title: 'Events come before waiting',
        text: 'Action messages get reading time and queue during bursts. Movement and waiting text return only after a quiet gap. Purchases announce once and accepted trades clear their considering message before effects play.',
      },
      {
        tag: 'better',
        title: 'Gentler turn handoffs',
        text: 'Turns pause for two seconds before switching players, with an extra second for the camera glide. The pause before purchase payments is now half a second. Suit pickups happen immediately, whether passing or stopping.',
      },
    ],
  },
  {
    id: '2026-11-02-readable-problems',
    date: 'Nov 2, 2026',
    title: 'Clearer board problems',
    features: [
      {
        tag: 'better',
        title: 'Find and fix board problems',
        text: 'Problems have clearer text, spacing and severity labels in Board settings and tile info. Click a tile-related problem to select its tile, bring it into view and open its info panel.',
      },
    ],
  },
  {
    id: '2026-11-02-builder-badges',
    date: 'Nov 2, 2026',
    title: 'Board builder: problem badges and automatic districts',
    features: [
      {
        tag: 'new',
        title: 'See problems on the tiles',
        text: 'Tiles with a problem get a badge: red when the board can’t be played yet, yellow when it’s only worth fixing. Select a tile to read what’s wrong. Board settings shows the count and every problem; click one to jump to its tile.',
      },
      {
        tag: 'better',
        title: 'Districts fill themselves',
        text: 'No more picking colors: each property joins the first district that still needs one, and a new district starts when the others are full.',
      },
      {
        tag: 'better',
        title: 'Livelier building',
        text: 'Placed tiles bounce in with a gold ring, and selected tiles glow the way choices do in a game.',
      },
    ],
    extras: [
      'Erase works with the bank selected (the bank stays)',
      'Property tiles no longer show a light rim outside their colored border',
      'Vacant plots’ dashed outline sits neatly inside the border',
    ],
  },
  {
    id: '2026-11-02-warps-portals',
    date: 'Nov 2, 2026',
    title: 'Warps and portals, simplified',
    features: [
      {
        tag: 'rules',
        title: 'Warps and portals work the same way',
        text: 'Both link to a partner of their kind or to the bank. A warp sends you when you stop on it; a portal sends you as you step on it, and you keep moving.',
      },
      {
        tag: 'better',
        title: 'Colors pick themselves',
        text: 'New warps and portals are placed grey. Select one, press Link and click its partner or the bank: pairs get their own color, bank links turn gold.',
      },
      {
        tag: 'better',
        title: 'A clearer link line',
        text: 'The line to a linked tile bends gently at its middle, in the link’s color, with glowing dots traveling to where it leads.',
      },
    ],
    extras: ['Unlink a warp or portal from its tile info'],
  },
  {
    id: '2026-11-02-builder-pan',
    date: 'Nov 2, 2026',
    title: 'Board builder: move around and a cleaner look',
    features: [
      {
        tag: 'new',
        title: 'Pan around the board',
        text: 'Drag with the new Pan tool, the right mouse button, Space held, or two fingers to move around the whole grid. Arrow keys glide too. Tap the zoom percentage to reset the zoom and center your board.',
      },
      {
        tag: 'better',
        title: 'Board settings in a side panel',
        text: 'Board settings now opens beside the board, with a card per district: its color, name, property count and a simple - / + starting price.',
      },
      {
        tag: 'better',
        title: 'Tidier menus',
        text: 'New board shows a picture of every template, My boards shows each board trimmed to its tiles, and questions use the game’s own pop-ups.',
      },
    ],
    extras: ['Escape closes Board settings', 'Boards open centered on their tiles'],
  },
  {
    id: '2026-11-01-transport-color-bar',
    date: 'Nov 1, 2026',
    title: 'Transport colors in the action bar',
    features: [
      {
        tag: 'better',
        title: 'Pick warp and portal colors as you build',
        text: 'Choose transport colors from rounded squares in the action bar, just like properties. Completed pairs animate away and the next available color is selected automatically. Selected transport tiles also use the action bar for color changes.',
      },
    ],
  },
  {
    id: '2026-11-01-board-link-picker',
    date: 'Nov 1, 2026',
    title: 'See and change tile links',
    features: [
      {
        tag: 'new',
        title: 'Choose links on the board',
        text: 'Selected warps and portals show their linked tile and an animated curved connection. Use Change link, then click a compatible tile or the bank for a portal. Existing pairs swap partners to preserve the limits.',
      },
    ],
  },
  {
    id: '2026-11-02-portals-on-passing',
    date: 'Nov 2, 2026',
    title: 'Keep moving through portals',
    features: [
      {
        tag: 'rules',
        title: 'Portals work as you pass',
        text: 'Step onto a connected portal to teleport immediately, then use your remaining movement from the matching portal or bank. Warps still require landing.',
      },
    ],
  },
  {
    id: '2026-11-02-paired-transport',
    date: 'Nov 2, 2026',
    title: 'Warps and portals',
    features: [
      {
        tag: 'better',
        title: 'Paired star warps',
        text: 'Four-pointed star warps teleport only to their partner. Build up to five pairs and change a tile’s pair in its info panel.',
      },
      {
        tag: 'new',
        title: 'Colored portals',
        text: 'Portals replace backstreets. Use up to two of each of five colors, and choose a matching portal or the bank as the destination.',
      },
    ],
  },
  {
    id: '2026-11-02-builder-tile-info',
    date: 'Nov 2, 2026',
    title: 'Cleaner tile information',
    features: [],
    extras: [
      'Selected tiles show a clear tile-name heading, position, district and starting value with cleaner spacing.',
    ],
  },
  {
    id: '2026-11-01-builder-clear-placement',
    date: 'Nov 1, 2026',
    title: 'Bigger tiles and clearer placement',
    features: [
      {
        tag: 'better',
        title: 'More tile art, less empty space',
        text: 'Tiles fill more of the sidebar columns. Tile-name popups and the selected tile’s corner checkmark have been removed.',
      },
      {
        tag: 'better',
        title: 'Keep building automatically',
        text: 'Property placement selects the leftmost available district and switches back to the leftmost available color when a district fills. A brighter, contrasting hover outline makes the current board space easier to see at every zoom.',
      },
    ],
  },
  {
    id: '2026-11-01-builder-tile-sidebar',
    date: 'Nov 1, 2026',
    title: 'A cleaner tile pane',
    features: [
      {
        tag: 'better',
        title: 'Just the tiles',
        text: 'The builder tile pane now shows two columns of tile art without cards or captions. Hover or focus a tile to see its name. Find tiles under Properties, Suits, Specials and Transport, with warps, cannons and backstreets together.',
      },
    ],
  },
  {
    id: '2026-11-01-builder-typing-reveal',
    date: 'Nov 1, 2026',
    title: 'Typing text in the board builder',
    features: [],
    extras: [
      'The builder action bar now reveals new messages with the same typing animation as the game, while keeping its smooth layout without wrapping or snapping.',
    ],
  },
  {
    id: '2026-11-01-editor-300-smooth-bar',
    date: 'Nov 1, 2026',
    title: 'Get closer and build smoothly',
    features: [
      {
        tag: 'better',
        title: 'Zoom the builder to 300%',
        text: 'Get a closer look at your board with a new 300% zoom limit. The existing zoom levels and 5% steps stay the same.',
      },
      {
        tag: 'fix',
        title: 'A smoother action bar',
        text: 'Text and options keep their final layout while the action bar changes size, so words no longer wrap and snap back at the end. New controls settle into place smoothly.',
      },
    ],
  },
  {
    id: '2026-11-01-ten-district-colors',
    date: 'Nov 1, 2026',
    title: 'Pick your district by color',
    features: [
      {
        tag: 'better',
        title: 'Ten district colors in the action bar',
        text: 'Choose a rounded color square when placing properties. Boards can have up to ten districts. Full districts shrink away and the remaining colors slide back to the center.',
      },
      {
        tag: 'fix',
        title: 'Four properties, with no overflow',
        text: 'Placing or reassigning a property cannot give a district more than four. When a district fills, choose another color to keep building. Freeing a space brings its color back.',
      },
    ],
  },
  {
    id: '2026-11-01-four-properties-random-plots',
    date: 'Nov 1, 2026',
    title: 'Four properties in every district',
    features: [
      {
        tag: 'rules',
        title: 'Exactly four properties',
        text: 'Each district needs exactly four properties before a board can be played. The builder now has one Property tile, with no preset shops or vacant plots.',
      },
      {
        tag: 'rules',
        title: 'Vacant plots chosen per district',
        text: 'Game setup randomly chooses 0, 1, 2, 3 or all 4 properties in each district as vacant plots for None, A few, Some, A lot or All. There is no board-wide plot cap. Easy games keep every property as a shop.',
      },
    ],
  },
  {
    id: '2026-11-01-editor-bank-district-prices',
    date: 'Nov 1, 2026',
    title: 'A safe bank and simple district pricing',
    features: [
      {
        tag: 'better',
        title: 'Your bank stays on the board',
        text: 'New boards start with a bank. Move it where you like, but erasing, painting or moving other tiles onto it cannot remove it. Place now has a pencil icon.',
      },
      {
        tag: 'rules',
        title: 'Set one starting average per district',
        text: 'In Board settings, set a district’s average starting value or reset it to the distance-based default. In a four-property district, two shops use the average, the nearest costs 30G less and the farthest costs 30G more. Tile-by-tile price controls are gone.',
      },
    ],
  },
  {
    id: '2026-11-01-editor-tile-options',
    date: 'Nov 1, 2026',
    title: 'Simpler roads and smarter property values',
    features: [
      {
        tag: 'better',
        title: 'Tile options on the right',
        text: 'Select a tile to change its district or starting value. New properties use Auto: prices rise with walking distance from the bank. You can choose a fixed value instead.',
      },
      {
        tag: 'better',
        title: 'More room for your board',
        text: 'Adjacent tiles always connect, so leave a gap to separate paths. The Link tool is gone. Moving groups follow your pointer from their middle, and the action bar stays centered and compact until there are options to choose.',
      },
    ],
  },
  {
    id: '2026-11-01-editor-group-selection',
    date: 'Nov 1, 2026',
    title: 'Build and rearrange your board',
    features: [
      {
        tag: 'better',
        title: 'Select and move whole groups',
        text: 'Click a tile or drag around several, then Move or Erase them from the action bar. Moving tiles follow your pointer, snap to the grid and replace tiles underneath. Cancel a move or undo it any time.',
      },
      {
        tag: 'better',
        title: 'A dedicated Place tool',
        text: 'Place shows the tile pane when you need it and hides it when you switch tools. Board settings now sits in the top-left info bar.',
      },
    ],
  },
  {
    id: '2026-11-01-editor-tool-toolbar',
    date: 'Nov 1, 2026',
    title: 'Your board tools, close at hand',
    features: [
      {
        tag: 'better',
        title: 'A compact tool bar',
        text: 'Select, Move, Erase and Link now have their own icons on the left side of the board builder. Hover or focus a tool to see its name. Use Move to pick a tile and place it in an empty space.',
      },
    ],
  },
  {
    id: '2026-11-01-editor-no-decorations',
    date: 'Nov 1, 2026',
    title: 'A clearer board builder',
    features: [],
    extras: [
      'Trees, ponds and flower beds stay hidden while editing a board and appear when you start a game or test play.',
    ],
  },
  {
    id: '2026-11-01-infinite-grass',
    date: 'Nov 1, 2026',
    title: 'Grass as far as you can see',
    features: [
      {
        tag: 'better',
        title: 'A background without edges',
        text: 'Grass now extends across the whole screen in the board builder and in games. It stays lined up with the tiles as you zoom, with no background borders or texture seams at the edge of the board.',
      },
    ],
  },
  {
    id: '2026-10-31-editor-centered-zoom',
    date: 'Oct 31, 2026',
    title: 'Zoom your board as you build',
    features: [
      {
        tag: 'better',
        title: 'A full-screen board',
        text: 'The board now fills the screen behind the builder controls. Scroll, pinch or use - and + to zoom around the screen center, with the same zoom range and board sizing as the game. Tap the zoom chip to reset.',
      },
    ],
  },
  {
    id: '2026-10-31-editor-game-hud',
    date: 'Oct 31, 2026',
    title: 'Build with a familiar view',
    features: [
      {
        tag: 'better',
        title: 'The board builder feels like the game',
        text: 'Build on a full-screen board with floating game-style controls. Two columns of real tile examples take the place of player cards, and the bottom action bar smoothly changes its prompts and controls as you work.',
      },
    ],
  },
  {
    id: '2026-11-01-board-builder',
    date: 'Nov 1, 2026',
    title: 'More room to build',
    features: [
      {
        tag: 'better',
        title: 'A new board builder',
        text: 'Build on a full 32 × 20 grid. Choose tiles from the scrolling palette on the right, click again to deselect, and place them on the board. The action bar follows your editing task, and unused outer space disappears when you play.',
      },
    ],
  },
  {
    id: '2026-10-30-cleaner-setup',
    date: 'Oct 30, 2026',
    title: 'A cleaner way to start',
    features: [
      {
        tag: 'better',
        title: 'Set up your next game',
        text: 'A clearer layout puts your map, players and winning goal first. Extra rules, board tools and online invites tuck away, and a summary beside Start game helps you check your choices.',
      },
    ],
  },
  {
    id: '2026-10-30-slower-action-morph',
    date: 'Oct 30, 2026',
    title: 'A gentler action bar',
    extras: [
      'Action bar resizing takes half a second longer for a calmer transition. Buttons still respond immediately.',
    ],
    features: [],
  },
  {
    id: '2026-10-30-immediate-results',
    date: 'Oct 30, 2026',
    title: 'Results when you act',
    features: [
      {
        tag: 'fix',
        title: 'Bought means bought',
        text: 'Confirmed purchases and other money actions update the action bar before their animations. Completing a choice no longer brings back its old deciding message.',
      },
    ],
  },
  {
    id: '2026-10-30-observer-status',
    date: 'Oct 30, 2026',
    title: 'Follow every turn',
    features: [
      {
        tag: 'better',
        title: 'Results before waiting',
        text: 'While watching another player, the action bar shows their roll and movement choice together and names the space they land on. Results stay briefly before changing to a waiting message. Your own choices remain available immediately.',
      },
    ],
  },
  {
    id: '2026-10-30-venture-numbers',
    date: 'Oct 30, 2026',
    title: 'Venture cards by number',
    features: [
      {
        tag: 'new',
        title: 'Know your venture cards',
        text: 'Flipped venture tiles now show a fixed card number. Find every numbered card and its effect in Guide → Venture cards, with stock cards marked Standard only.',
      },
    ],
  },
  {
    id: '2026-10-30-action-text-reveal',
    date: 'Oct 30, 2026',
    title: 'A little life in each message',
    features: [
      {
        tag: 'better',
        title: 'Quick text reveal',
        text: 'New action bar messages reveal with a quick typing-style sweep. Text stays in place, buttons work immediately, and reduced motion shows the message instantly.',
      },
    ],
  },
  {
    id: '2026-10-30-steady-action-text',
    date: 'Oct 30, 2026',
    title: 'Steadier action bar text',
    features: [
      {
        tag: 'fix',
        title: 'No bouncing text',
        text: 'Action bar text no longer slides in again during resizing. Small and expanded prompts keep more precise spacing, and repeated status messages stay in place.',
      },
    ],
  },
  {
    id: '2026-10-30-action-bar-resize',
    date: 'Oct 30, 2026',
    title: 'Smoother action bar',
    features: [
      {
        tag: 'fix',
        title: 'Steadier prompts',
        text: 'The action bar resizes without repeatedly rewrapping its text. Quick changes continue smoothly from the current size, including when the screen size changes.',
      },
    ],
  },
  {
    id: '2026-10-30-stock-growth',
    date: 'Oct 30, 2026',
    title: 'Gentler stock growth',
    features: [
      {
        tag: 'rules',
        title: 'Shop upgrades move stocks less',
        text: 'Shop growth now has 62.5% less influence on Dynamic share prices. The boost from buying shares stays the same. Existing Dynamic saves use the new prices when loaded; Classic stocks are unchanged.',
      },
    ],
  },
  {
    id: '2026-10-30-venture-action-bar',
    date: 'Oct 30, 2026',
    title: 'Venture results in the action bar',
    features: [
      {
        tag: 'better',
        title: 'Keep the board in view',
        text: 'The venture board floats in the center with rounded square tiles and no dim background. Bonuses and cards now appear in the action bar, with OK to continue.',
      },
    ],
  },
  {
    id: '2026-10-30-venture-reveal',
    extras: ['Clearer arcade controls and results', 'Arcade Lab: replay games and try specific outcomes'],
    date: 'Oct 30, 2026',
    title: 'Venture and arcade polish',
    features: [
      {
        tag: 'better',
        title: 'One reveal at a time',
        text: 'The venture board stays centered while your card appears underneath. Line bonuses appear first, with their own OK button before the card is revealed.',
      },
    ],
  },
  {
    id: '2026-10-30-guide',
    date: 'Oct 30, 2026',
    title: 'Game guide and smarter zoom',
    features: [
      {
        tag: 'new',
        title: 'Guide',
        text: 'A new Guide button next to Menu explains the game in tabs: the basic rules, how stocks work, and what every vacant plot building does.',
      },
      {
        tag: 'better',
        title: 'Zoom stays yours',
        text: 'You can zoom while choosing where to move, picking a square or trading, and the camera goes back to your own zoom afterwards. Only the player choosing gets zoomed out; short shows like shops closing or a stock move still play for everyone, and lock the zoom until they finish.',
      },
      {
        tag: 'fix',
        title: 'Circus upgrades',
        text: 'Stopping on your circus offers the upgrade whenever stock or property can cover it, like any other purchase, and the log says why when it cannot.',
      },
    ],
    extras: [
      'A sound of its own for buying out a rival',
      'Player overview: a Close button, and the whole shares table fits',
      'Finding a property from the overview greys out every other tile',
      'Hovering the overview no longer lights up the board',
    ],
  },
  {
    id: '2026-10-29-player-overview',
    date: 'Oct 29, 2026',
    title: 'Player overview',
    features: [
      {
        tag: 'new',
        title: 'Click a player card',
        text: "It pops up that player's overview, with everyone else's properties greyed out on the board. See their net worth and a ring showing what it is made of, their properties as little cards with their rent, their shares in each district and their earnings (and, at the end of the game, how they grew each round). Click a property to see it on the board.",
      },
    ],
    extras: ['Buying a property claims it as the coins fly, instead of after'],
  },
  {
    id: '2026-10-29-stocks',
    date: 'Oct 29, 2026',
    title: 'A new stock market',
    features: [
      {
        tag: 'rules',
        title: 'Dynamic stocks',
        text: 'Investing in a district now moves its stock twice as much as before, so buy where the owners are building. Share prices also climb a little with the shares everyone holds (Calm districts slowest, Wild ones up to twice as fast), and you trade at the average of the price before and after.',
      },
      {
        tag: 'rules',
        title: 'Sell-offs shake a district',
        text: 'Selling 75 or more shares of a district in one turn knocks 10% off its price, and more the more you sell (150 shares: 18%). The seller still gets the price they sold at. Buying shares there or investing in its shops repairs it.',
      },
      {
        tag: 'new',
        title: 'Pick your stock market',
        text: 'Game setup has a Stocks option: Dynamic (new) or Classic (the old market, where trades of 10+ shares move the price 10%).',
      },
    ],
    extras: [
      'The default goal is now 10,000G',
      'CPUs buy stock more eagerly, picking districts where shops will grow',
      'CPUs line up their venture panels to earn line bonuses',
      'Shops near the bank cost a little less (up to 10% off)',
      'CPUs dump their stock to crash a district when a rival is close to winning',
      'Player cards show each character from head to toe',
      'The Roll button no longer gets clipped or shows scroll bars when it bounces',
      "The stock market shows each district's mood and whether it is shaken",
    ],
  },
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
    extras: [
      'The die shrinks beside the player and counts down the steps left',
      'Direction arrows stay up until the player moves',
      'After a roll the camera zooms out to show everywhere you could land',
      'Name plates sit right above the characters; the steps-left die is bigger and flips a different way each step',
      'Quit asks over the menu instead of behind it',
      'Net worth no longer dips and recovers when buying, selling or trading: each deal updates it once',
      'The winner no longer shrinks when they win',
      'The zoom-out after a roll waits for the die to land',
      'Investing sends the coins into the shop instead of the bank',
      'Stock drops are announced too (e.g. Bear market), with red arrows',
      'Picking properties to sell for a debt keeps them all clear of the action bar',
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
