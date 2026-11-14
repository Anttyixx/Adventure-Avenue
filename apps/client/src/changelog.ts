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
    id: '2026-11-14-podium-results',
    date: 'Nov 14, 2026',
    title: 'Podium finish',
    features: [
      {
        tag: 'new',
        title: 'A podium at the end of the game',
        text: 'The top three stand on a podium with gold, silver and bronze medals, and everyone else gets a participation ribbon. Under it: a clearer stats table in the style of the stock market, net worth by round, the stock market and what each net worth is made of. Big screens show them side by side.',
      },
      {
        tag: 'new',
        title: 'Pick your color',
        text: 'Tap your character in game setup to choose your color as well. There are now six colors, one more than the most players, so you can always swap. Colors other players have are crossed out.',
      },
      {
        tag: 'rules',
        title: 'Bid with what you own',
        text: 'In an auction you can bid past your cash if selling your stock or property could cover it. If you win, you sell right away to pay. Players already in debt sit auctions out.',
      },
      {
        tag: 'fix',
        title: 'Stock prices add up',
        text: 'Shares now cost a whole number of gold each: 10 shares at 20G cost 200G. Very big trades cost a coin or so more per share, shown before you buy.',
      },
    ],
    extras: [
      'Boon and Boom on player cards are the same size as the suits',
      'No casino chip beside the Lucky Wheel bet',
    ],
  },
  {
    id: '2026-11-14-stock-start-prices',
    date: 'Nov 14, 2026',
    title: 'Fairer fees and stock prices',
    features: [
      {
        tag: 'rules',
        title: 'Investing matters more than owning more',
        text: 'Shop fees are now 18% of value (was 20%). Owning more of a district still raises fees, but less: x1.2, x1.45, and x2.21 for the whole district (was x1.3, x1.6, x2.8). Owning more also grows your shops a little less. Investing is now the main way to raise a fee.',
      },
      {
        tag: 'rules',
        title: 'Stocks start between 4G and 11G',
        text: 'The district with the cheapest shops starts at 4G a share and the priciest at 11G, with the rest in between. No share ever drops below 3G.',
      },
      {
        tag: 'rules',
        title: 'Shares count a bit more, growth a bit less',
        text: 'Every 100 shares held now raise a price by 8.5% to 16% (was 7.5% to 15%). Shop growth moves prices 20% less, though investing still moves them more than buying shares.',
      },
    ],
  },
  {
    id: '2026-11-14-suits-trade-labels',
    date: 'Nov 14, 2026',
    title: 'Bigger suits',
    features: [],
    extras: [
      'Suits on the player cards are bigger, and missing ones show as an empty slot in the same shape',
      "Trade labels on the board are outlined in the owner's color",
    ],
  },
  {
    id: '2026-11-13-venture-hover-color',
    date: 'Nov 13, 2026',
    title: 'Player-colored venture highlights',
    features: [],
    extras: [
      'Hovering an available venture card now highlights it in the color of the player choosing the card.',
    ],
  },
  {
    id: '2026-11-13-painted-symbols-stack',
    date: 'Nov 13, 2026',
    title: 'Fresh symbols and a readable stack',
    features: [
      {
        tag: 'better',
        title: 'Matching painted symbols',
        text: 'Random Suit is now a freestanding shuffle of suits, Warp has a painted four-point star, and Boom keeps its coin burst with cleaner artwork. Player cards share the board’s Boon, Boom and suit sprites, plus a new Suit Yourself card. Spades are blue, hearts red, diamonds yellow and clubs green.',
      },
      {
        tag: 'better',
        title: 'See the stack during pop-ups',
        text: 'Hover over the player-card stack to expand it while a pop-up is open. Card and button clicks stay locked until View board is selected. Smart stack is now called Stack, with a stacked-card icon.',
      },
    ],
  },
  {
    id: '2026-11-13-jackpot-tile',
    date: 'Nov 13, 2026',
    title: 'Build a shared jackpot',
    features: [
      {
        tag: 'new',
        title: 'Jackpot tile',
        text: 'Find Jackpot in the Draw panel’s Buildings category. Each passing player adds 10G to its unowned pot. Stop there to collect the whole pot and reset it to zero. The current amount is shown on the tile, and pots stay saved with your game.',
      },
    ],
    extras: [
      'The Draw panel’s Properties category is now called Buildings. Property and Districts remain there alongside Jackpot.',
    ],
  },
  {
    id: '2026-11-13-district-brush-icon',
    date: 'Nov 13, 2026',
    title: 'A clearer Districts drawing option',
    features: [],
    extras: [
      'The Districts option uses three rounded, separated colors: three fitted pieces on hex grids, and two upper blocks with one wider lower block on square grids.',
    ],
  },
  {
    id: '2026-11-13-draw-tile-feedback',
    date: 'Nov 13, 2026',
    title: 'Draw-panel tiles match the board',
    features: [],
    extras: [
      'Selected Draw-panel tiles use the board’s gold tint, pulsing white outline and expanding rings. Hover and keyboard highlights follow the current square or hex tile shape.',
    ],
  },
  {
    id: '2026-11-13-bank-opening',
    date: 'Nov 13, 2026',
    title: 'A proper welcome to the board',
    features: [
      {
        tag: 'better',
        title: 'Players jump out of the bank',
        text: 'When everyone is ready, setup fades into the board with a custom start chime. Players jump out of the bank one after another, then the game music starts and the UI slides into place. Saved games and reconnects continue normally.',
      },
    ],
    extras: [
      'Sound controls are available from the Music button in the game toolbar; the duplicate controls have been removed from the game menu.',
    ],
  },
  {
    id: '2026-11-13-wheel-container-bets',
    date: 'Nov 13, 2026',
    title: 'Wheel bets stay with their choices',
    features: [],
    extras: [
      'Locked-in bets appear inside their chosen Lucky Wheel containers before the spin. The same player markers update to show wins and losses when the wheel stops.',
    ],
  },
  {
    id: '2026-11-13-draw-districts',
    date: 'Nov 13, 2026',
    title: 'Draw properties, then paint their districts',
    features: [
      {
        tag: 'better',
        title: 'Draw tool and district painting',
        text: 'Place is now Draw. New properties start without a district. Choose Districts in the Properties section, pick a color in the action bar, then click or drag across properties to color them. Painting a fifth property removes the oldest member from that district, keeping four colored properties. Full colors stay available, and Undo restores the whole change.',
      },
    ],
  },
  {
    id: '2026-11-13-editor-move-tool',
    date: 'Nov 13, 2026',
    title: 'Drag tiles into place',
    features: [
      {
        tag: 'new',
        title: 'Move tool',
        text: 'Use Move in the board builder to click and drag a tile straight to a new spot. Release to place it on the grid; Escape cancels. Undo, tile links and bank protection work as usual.',
      },
    ],
  },
  {
    id: '2026-11-13-random-suit-tile',
    date: 'Nov 13, 2026',
    title: 'A suit tile that fills the gaps',
    features: [
      {
        tag: 'new',
        title: 'Random suit tile',
        text: 'Add it from the builder’s Suits category. Stepping on it gives one random suit you are missing, including when arriving by transport. Have all four? No suit is given. Stopping also draws a venture card, just like a normal suit square.',
      },
    ],
  },
  {
    id: '2026-11-12-wheel-bet-preview',
    date: 'Nov 12, 2026',
    title: 'See every bet before the wheel spins',
    features: [],
    extras: [
      'Lucky Wheel shows everyone’s locked-in bets for two seconds before spinning. On larger screens the wheel grows by up to 25%, while phone sizing stays the same.',
    ],
  },
  {
    id: '2026-11-12-readable-arcade-text',
    date: 'Nov 12, 2026',
    title: 'Readable wheel numbers and memory prizes',
    features: [],
    extras: [
      'Lucky Wheel numbers stay upright inside the rim with a subtle outline. Wedges glow as they pass the pointer, and the winner stays lit.',
      'Memory prizes use larger, short labels inside the card frames. Landscape phones use two rows of cards to keep text readable.',
    ],
  },
  {
    id: '2026-11-12-arcade-sprite-art',
    date: 'Nov 12, 2026',
    title: 'Painted arcade prizes and location pins',
    features: [
      {
        tag: 'better',
        title: 'A matching arcade art set',
        text: 'New sprites bring painted reel symbols, memory cards, treasure chests, wheel trim, betting chips and finish flags to all five arcade games. Location pins match the board art and keep their bounce and player colors.',
      },
    ],
    extras: ['The original arcade and pin drawings remain available for rollback.'],
  },
  {
    id: '2026-11-13-motel-two-dice',
    date: 'Nov 13, 2026',
    title: 'Motel dice',
    features: [
      {
        tag: 'rules',
        title: 'Saved spaces get their own die',
        text: "Checking in at a motel sends your die into the motel. Next turn it pops back out beside your new roll, so you see two dice: the saved one counts down first, then the new one. Check in again on the way and only this turn's die is saved; the old one puffs away.",
      },
    ],
  },
  {
    id: '2026-11-13-motel-roll-text',
    date: 'Nov 13, 2026',
    title: 'Clearer motel rolls',
    features: [],
    extras: ['After a motel check-in, picking where to go says the roll plus the saved spaces'],
  },
  {
    id: '2026-11-13-zoom-results-tap',
    date: 'Nov 13, 2026',
    title: 'Better choice zoom and prettier results',
    features: [
      {
        tag: 'better',
        title: 'Choices fit the screen just right',
        text: "When you can pick where to go, the camera frames you and every choice as tightly as fits, centred between them. Scroll out to see more of the board and the view slides over to the board's centre.",
      },
      {
        tag: 'better',
        title: 'A prettier results screen',
        text: 'Each player gets a medal and the same net worth ring as their player page, and the stats table is easier to follow row by row.',
      },
    ],
    extras: ['On phones, tap a character to see which ways they can go'],
  },
  {
    id: '2026-11-13-results-log-hover',
    date: 'Nov 13, 2026',
    title: 'Clearer results, a tidier log and a closer look at players',
    features: [
      {
        tag: 'better',
        title: 'A new results screen',
        text: 'Each player gets a card with their place, net worth and what it is made of, the chart has a key, and a stats table compares everyone side by side: fees, salary, stocks, properties, buyouts, venture cards, squares walked and more, with the best in each row starred.',
      },
      {
        tag: 'new',
        title: 'Point at a player',
        text: "Point at a character or a player card to make them grow and show which ways they can go. The active player's arrows now go away once they roll.",
      },
    ],
    extras: [
      'The game log lines its icons up neatly with the text',
      'Buying a shop shows its price on the Buy button',
    ],
  },
  {
    id: '2026-11-12-linked-game-log',
    date: 'Nov 12, 2026',
    title: 'Follow the action in the game log',
    features: [
      {
        tag: 'better',
        title: 'Landings with their follow-up actions',
        text: 'The log records rolls and arrivals, with purchases and other follow-up actions underneath. Select a tile entry to briefly highlight and focus it on the board.',
      },
    ],
    extras: [
      'Tax Offices show the active player’s payment or owner payout. Estate Agencies show Buy for their owner and Break for rivals.',
      'Shop landing and buying prompts no longer repeat the shop price.',
    ],
  },
  {
    id: '2026-11-12-motel-carryover',
    date: 'Nov 12, 2026',
    title: 'Check in and save your steps',
    features: [
      {
        tag: 'rules',
        title: 'A new reason to visit the motel',
        text: 'Check in while passing to pay a 100G base fee, end your turn and add your unused spaces to your next roll. Owners who check in pay the bank and cannot invest; landing normally still lets owners invest. Normal landings never ask about check-in.',
      },
    ],
  },
  {
    id: '2026-11-12-suits-every-arrival',
    date: 'Nov 12, 2026',
    title: 'Every arrival collects its suit',
    features: [],
    extras: [
      'Suit pickup applies to every arrival, including cannons, taxis, balloons, portals, cards and both players in a swap. Taxi rides collect only at their destination, not along the road. Change-suit tiles rotate only once per arrival.',
    ],
  },
  {
    id: '2026-11-12-immediate-arrivals',
    date: 'Nov 12, 2026',
    title: 'Checkpoints trigger as you arrive',
    features: [],
    extras: [
      'Stopping at a checkpoint pays its toll and increases it immediately, just like passing. Suit tiles award their suit as soon as you arrive.',
    ],
  },
  {
    id: '2026-11-12-stock-balance',
    date: 'Nov 12, 2026',
    title: 'Stronger sell-offs, gentler stock growth',
    features: [],
    extras: [
      'Selling 75 shares dents a district by 12% (150 shares: 21.6%). Property growth contributes about 17% less to Dynamic stock prices. Classic stocks are unchanged.',
    ],
  },
  {
    id: '2026-11-12-auctions-trades',
    date: 'Nov 12, 2026',
    title: 'Clearer trades and optional bids',
    features: [],
    extras: [
      'The last eligible bidder can still pass; properties with no bids return to the bank.',
      'Traded properties change hands on the board before a domination is celebrated.',
      'Trade offers keep their compact layout, with clearer give/get labels, stronger text contrast and more readable amounts.',
    ],
  },
  {
    id: '2026-11-11-reconnect-continue',
    date: 'Nov 11, 2026',
    title: 'Reconnect before resuming',
    features: [],
    extras: [
      'Large saved games reconnect reliably. Friends reconnect to Continue Game and wait for the host to resume together. Saved games from one device always have a host Resume button.',
    ],
  },
  {
    id: '2026-11-11-closed-buyouts',
    date: 'Nov 11, 2026',
    title: 'Buy out closed shops',
    features: [
      {
        tag: 'rules',
        title: 'Closed shops can be bought out',
        text: 'Landing on a closed shop still charges no fee, but you can now buy it out. It opens right away if your shops are open, or stays closed if yours are closed too.',
      },
    ],
  },
  {
    id: '2026-11-10-balloon-boarding',
    date: 'Nov 10, 2026',
    title: 'A better fit in the balloon',
    features: [],
    extras: [
      'Players shrink as they board the balloon, ride inside its slightly larger basket, then hop out at full size.',
    ],
  },
  {
    id: '2026-11-11-balloon-ride-sprite',
    date: 'Nov 11, 2026',
    title: 'A painted balloon ride',
    features: [],
    extras: ['Balloon travel has a rounded painted canopy in your player color and a wicker basket.'],
  },
  {
    id: '2026-11-11-builder-blank-view',
    date: 'Nov 11, 2026',
    title: 'Plan boards faster in the builder',
    features: [
      {
        tag: 'new',
        title: 'Blank tiles',
        text: 'Lay a board out with Blank tiles first, then place the real tile over each one later. A board with blanks left can be saved but not played.',
      },
      {
        tag: 'new',
        title: 'Tile type view',
        text: 'A new view chip in the builder shows every tile as a color for its kind (property, suit, special, transport, blank), with district borders, so the layout is easy to read.',
      },
    ],
  },
  {
    id: '2026-11-11-taxi-roads',
    date: 'Nov 11, 2026',
    title: 'Taxis take the roads',
    features: [
      {
        tag: 'better',
        title: 'The taxi drives the board',
        text: 'Taxi rides now follow the roads tile by tile to your stop, taking the shortest way, and drive through portal links too.',
      },
    ],
    extras: ['Going through a portal is a little slower, so it is easier to follow'],
  },
  {
    id: '2026-11-11-rides-tooltips',
    date: 'Nov 11, 2026',
    title: 'Rides with style and clearer tile info',
    features: [
      {
        tag: 'new',
        title: 'Every ride is different',
        text: 'Warps beam you up, portals swirl you through a vortex, the cannon fires you on a tumbling arc through smoke, the taxi drives you over, balloons float you across, swaps fly both players past each other and venture cards lift you on a trail of stars. Portal links got sparks and a streak of light too.',
      },
      {
        tag: 'better',
        title: 'A cleaner tile pop-up',
        text: 'Hovering a tile shows its picture, its name and owner, one big number (the fee, or the price for a shop for sale) and the details below. No more repeated prices.',
      },
      {
        tag: 'better',
        title: 'Picture-only special tiles',
        text: 'Special tiles drop their names and show a bigger picture in the middle. The Boom burst is no longer cut off at its edges.',
      },
    ],
    extras: ['Coin Derby: tapping Sprint or Grab locks your choice in, no extra button'],
  },
  {
    id: '2026-11-10-boon-burst',
    date: 'Nov 10, 2026',
    title: 'A matching Boon badge',
    features: [
      {
        tag: 'better',
        title: 'A burst around the Boon coin',
        text: 'Boon now has a plain gold coin inside a green burst matching Boom’s pink badge. The coin is 30% smaller, with the up arrow removed.',
      },
    ],
  },
  {
    id: '2026-11-10-warp-floor-pad',
    date: 'Nov 10, 2026',
    title: 'A warp point to stand on',
    features: [
      {
        tag: 'better',
        title: 'A flat star warp pad',
        text: 'The warp is now a flat four-point star on the tile floor, with equal height and width. The pedestal is gone, and the pad sits under the player’s feet. Paired colors are preserved.',
      },
    ],
  },
  {
    id: '2026-11-10-closed-gate',
    date: 'Nov 10, 2026',
    title: 'The closed-shop gate is back',
    features: [],
    extras: ['Closed shops show the full-tile rolling gate with a CLOSED sign again'],
  },
  {
    id: '2026-11-10-stock-net-worth',
    date: 'Nov 10, 2026',
    title: 'Net worth waits for the stock price',
    features: [],
    extras: [
      "Buying shares no longer bumps your net worth: it goes up only after the district's price rise has been shown",
    ],
  },
  {
    id: '2026-11-10-steady-venture',
    date: 'Nov 10, 2026',
    title: 'Steadier venture board',
    features: [],
    extras: ['The venture board no longer jumps up when the card you drew appears below it'],
  },
  {
    id: '2026-11-10-resume-chip',
    date: 'Nov 10, 2026',
    title: 'Resume from your player card',
    features: [],
    extras: ['Continue Game: Resume is now on your player card, where Ready is when setting up a game'],
  },
  {
    id: '2026-11-10-auction-music-motel',
    date: 'Nov 10, 2026',
    title: 'Auction music and a friendlier motel',
    features: [
      {
        tag: 'new',
        title: 'Auctions sound like auctions',
        text: 'Live auctions have their own tense music. The clock ticks each second, beeps for the last two, and a gavel knocks when it ends. Every bid still resets the 5-second clock for everyone.',
      },
      {
        tag: 'rules',
        title: 'Motel: rest, then go any way',
        text: 'Stopping at a motel now lets you set off in any direction on your next move, like leaving the bank. Its fee drops from 25% to 15% of the cash you hold.',
      },
    ],
  },
  {
    id: '2026-11-10-invest-prompt',
    date: 'Nov 10, 2026',
    title: 'Shorter invest question',
    features: [],
    extras: ['Investing just asks "Invest in any of your shops?"; the limit shows when you pick the amount'],
  },
  {
    id: '2026-11-10-foliage',
    date: 'Nov 10, 2026',
    title: 'Trees and a river around the board',
    features: [
      {
        tag: 'better',
        title: 'Livelier grass',
        text: 'Woods, orchards, flowers and rocks now fill the open grass around the board, thicker further out, and a winding river with reeds and lily pads runs down one side. Tiles and roads stay clear, and zooming stays smooth.',
      },
    ],
  },
  {
    id: '2026-11-10-quick-redraws',
    date: 'Nov 10, 2026',
    title: 'No more hitches when things change',
    features: [
      {
        tag: 'better',
        title: 'Only what changed is redrawn',
        text: 'Buying a shop, a price going up or a building going in now redraws just that tile, not the whole board. Payments, suits and promotions no longer redraw the board at all.',
      },
    ],
    extras: ["Each player's tile colors are prepared at the start, so a first purchase doesn't stutter"],
  },
  {
    id: '2026-11-10-phone-centering',
    date: 'Nov 10, 2026',
    title: 'Board centered on phones',
    features: [],
    extras: ['On smaller screens the board centers in the space left of the player cards'],
  },
  {
    id: '2026-11-10-fast-ground',
    date: 'Nov 10, 2026',
    title: 'Faster zooming',
    features: [
      {
        tag: 'better',
        title: 'Plain grass, smooth zooms',
        text: 'The ground around the board is now plain grass. The painted grass, ponds and paving made every frame slow to draw; zooming in and out is now about twice as smooth.',
      },
    ],
    extras: [
      'The board picture no longer re-draws itself in the middle of a zoom',
      'Very big boards no longer risk showing blank on iPhones',
    ],
  },
  {
    id: '2026-11-10-classic-renderer',
    date: 'Nov 10, 2026',
    title: 'Back to the classic renderer',
    features: [],
    extras: ['The PixiJS test renderer is removed: the board draws the usual way again, path included'],
  },
  {
    id: '2026-11-10-smooth-zoom',
    date: 'Nov 10, 2026',
    title: 'Smoother camera zooms',
    features: [
      {
        tag: 'fix',
        title: 'No more stutter',
        text: 'Zooming between a player and the whole board is smooth again. The background no longer redraws itself all at once mid-zoom.',
      },
    ],
  },
  {
    id: '2026-11-10-transport-art',
    date: 'Nov 10, 2026',
    title: 'Crystal warps and living portals',
    features: [
      {
        tag: 'better',
        title: 'A new warp crystal',
        text: 'Warp tiles now show a beveled four-point crystal above a small stone-and-gold socket, keeping their paired colors.',
      },
      {
        tag: 'better',
        title: 'Animated portal links',
        text: 'Portal links have a jeweled circular frame with a flowing, counter-rotating vortex, gentle pulse and orbiting lights. Reduced motion keeps them still.',
      },
    ],
    extras: ['Earlier transport artwork preserved', 'Smoother wide board views'],
  },
  {
    id: '2026-11-10-active-glide',
    date: 'Nov 10, 2026',
    title: 'Smoother card unfolding',
    features: [],
    extras: ['The active player’s card glides out with the others when a stack opens into a list'],
  },
  {
    id: '2026-11-10-info-bar',
    date: 'Nov 10, 2026',
    title: 'Keep an eye on the game',
    features: [
      {
        tag: 'better',
        title: 'The action bar stays live',
        text: 'With Game info, the stock market or the properties open, the action bar keeps showing what is happening in the game. These pop-ups no longer show a View board button, since you can just close them.',
      },
    ],
  },
  {
    id: '2026-11-10-chip-borders',
    date: 'Nov 10, 2026',
    title: 'Neater card chips',
    features: [],
    extras: ['The layout chip shows just its icon', 'Thicker borders on the chips under the player cards'],
  },
  {
    id: '2026-11-10-popup-chips',
    date: 'Nov 10, 2026',
    title: 'Chips for stocks and properties',
    features: [
      {
        tag: 'new',
        title: 'Stocks and Properties chips',
        text: 'Two chips under the player cards open the stock market and the properties, each in its own pop-up. The Info button now shows just the game info.',
      },
      {
        tag: 'better',
        title: 'One layout chip',
        text: 'The player card buttons are now one chip showing the current layout: List or Smart stack. Tap it to switch.',
      },
      {
        tag: 'better',
        title: 'Pop-ups stay in focus',
        text: 'While a pop-up is open, the board, the player cards and the other chips wait. The action bar, View board, Game log, Music and Menu still work.',
      },
    ],
    extras: [
      'Tile pictures sized evenly and kept clear of tile borders',
      'The plain Stack layout is now Smart stack',
    ],
  },
  {
    id: '2026-11-10-stack-alignment',
    date: 'Nov 10, 2026',
    title: 'Player cards stay aligned',
    features: [
      {
        tag: 'fix',
        title: 'A tidy stack',
        text: 'Cards with extra status rows no longer stick out of the stack. Hidden cards match the front card’s height, and interrupted animations settle into the latest layout.',
      },
    ],
  },
  {
    id: '2026-11-10-sharp-landscape',
    date: 'Nov 10, 2026',
    title: 'A clearer cartoon background',
    features: [
      {
        tag: 'better',
        title: 'Clean details at every zoom',
        text: 'Trees, flowers and benches now draw at their own sprite resolution. Higher-resolution terrain and cleaner grass and paving artwork keep the background sharp and consistent with the board pieces.',
      },
    ],
    extras: ['Grass and clovers stay upright', 'Previous background artwork preserved'],
  },
  {
    id: '2026-11-09-player-card-controls',
    date: 'Nov 9, 2026',
    title: 'Player card controls stay put',
    features: [
      {
        tag: 'better',
        title: 'Layout buttons below the cards',
        text: 'The List, Stack and Smart buttons now sit below the player cards and stay in place while the cards expand, fold or pop out.',
      },
    ],
  },
  {
    id: '2026-11-09-cartoon-town-terrain',
    date: 'Nov 9, 2026',
    title: 'A lighter cartoon landscape',
    features: [
      {
        tag: 'better',
        title: 'A varied background',
        text: 'Softly joined grass, pond and paving textures give the landscape variety while matching the rounded cartoon style of the board tiles.',
      },
      {
        tag: 'new',
        title: 'Foliage and quiet details',
        text: 'Trees, flowers, reeds and lily pads add light decoration. A few benches and planters sit near the board, with open space keeping the route easy to see.',
      },
    ],
    extras: ['Continuous ground beneath square and hex tile edges', 'Previous scenery artwork preserved'],
  },
  {
    id: '2026-11-09-portal-flow',
    date: 'Nov 9, 2026',
    title: 'Clearer portal links',
    features: [
      {
        tag: 'fix',
        title: 'Every portal stays visible',
        text: 'Creating a portal between tiles that already connect now keeps both portal rings. Separate links between the same tiles keep their own endpoints. Larger rings meet the approach paths cleanly.',
      },
      {
        tag: 'better',
        title: 'Follow the flow',
        text: 'One-way link animations always run from entrance to exit. Two-way links show opposing flows. Players squeeze into a portal and launch from the paired exit in a quick new animation.',
      },
    ],
  },
  {
    id: '2026-11-09-park-landscape',
    date: 'Nov 9, 2026',
    title: 'A town in a living park',
    features: [
      {
        tag: 'better',
        title: 'A landscape around your board',
        text: 'Warm path verges, shaded grass, sun-dried clearings and a painted stream give the board a richer setting. Trees and gardens grow in groups around the playable area.',
      },
      {
        tag: 'better',
        title: 'Scenery that belongs',
        text: 'New painted plants, furniture, ponds and a fountain have natural edges and soft ground shadows instead of sticker outlines. Previous artwork is preserved.',
      },
    ],
  },
  {
    id: '2026-11-09-music-controls',
    date: 'Nov 9, 2026',
    title: 'Music at your fingertips',
    features: [
      {
        tag: 'better',
        title: 'See what is playing',
        text: 'The refreshed music and sound pop-up shows the current track, clearer volume controls and a mute button. Open it from the new music chip between Game log and Menu while playing.',
      },
    ],
  },
  {
    id: '2026-11-09-varied-meadow-scenery',
    date: 'Nov 9, 2026',
    title: 'A livelier landscape',
    features: [
      {
        tag: 'better',
        title: 'Grass with natural variation',
        text: 'The painted meadow now blends varied grass patches with soft edges, breaking up visible repeats when zoomed out.',
      },
      {
        tag: 'new',
        title: 'Little details around town',
        text: 'Nine new painted scenery pieces add benches, shrubs, rocks, flowers, fences, saplings, mushrooms, lily ponds and picnic tables in empty spaces and around the board. Tiles, roads and portals stay clear; decorations remain hidden while building.',
      },
    ],
  },
  {
    id: '2026-11-09-painted-landscape',
    date: 'Nov 9, 2026',
    title: 'A painted landscape',
    features: [
      {
        tag: 'better',
        title: 'A softer setting for your town',
        text: 'A painted meadow with grass, clover and tiny flowers now surrounds the board. Fewer trees, ponds and flower beds keep the focus on the tiles. Previous artwork is preserved.',
      },
    ],
  },
  {
    id: '2026-11-09-painted-properties',
    date: 'Nov 9, 2026',
    title: 'New painted property sprites',
    features: [
      {
        tag: 'better',
        title: 'A matching town',
        text: 'Every shop tier, 3-Star Shop, Circus, special property building and the Bank now has new painted artwork matching the other board sprites. Owner colors use separate tint layers. All previous art is preserved.',
      },
    ],
  },
  {
    id: '2026-11-09-layered-art',
    date: 'Nov 9, 2026',
    title: 'A full PNG tile set',
    features: [
      {
        tag: 'better',
        title: 'Matching board sprites',
        text: 'Special tiles, suits, portals, vacant plots and scenery now use painted PNG sprites alongside the buildings. Recolorable art has separate base and tint layers, and the original artwork is preserved.',
      },
    ],
    extras: ['Inspect base layers, tint masks and color previews in the UI Lab.'],
  },
  {
    id: '2026-11-09-portal-info',
    date: 'Nov 9, 2026',
    title: 'Where does this portal go?',
    features: [
      {
        tag: 'new',
        title: 'Portal info',
        text: 'Hover over a portal to see what it does and where it leads. Tap it to zoom out for a moment: the portal and where it leads flash together.',
      },
      {
        tag: 'better',
        title: 'One portal look',
        text: 'Every portal now has the same double swirl. One-way portals have an arrow painted on their road, just like one-way roads.',
      },
    ],
  },
  {
    id: '2026-11-09-stack-buttons-glide',
    date: 'Nov 9, 2026',
    title: 'Smoother player cards',
    features: [],
    extras: ['The player card layout buttons glide up with the cards when a stack opens, instead of jumping'],
  },
  {
    id: '2026-11-09-spinning-portals',
    date: 'Nov 9, 2026',
    title: 'Spinning portals',
    features: [
      {
        tag: 'better',
        title: 'New portal look',
        text: 'Portals now swirl. Entrances and exits have spiral lines curling into a dark center: an entrance spins clockwise, an exit the other way. Two-way portals have two swirls spinning in opposite directions.',
      },
    ],
  },
  {
    id: '2026-11-08-portal-kinds',
    date: 'Nov 8, 2026',
    title: 'Portals beside tiles',
    features: [
      {
        tag: 'new',
        title: 'Portal links replace portal tiles',
        text: 'Portals now sit beside tiles instead of taking a space, so you can see where you step in and where you come out. Built-in and saved boards switch over on their own.',
      },
      {
        tag: 'new',
        title: 'Two-way, entrance and exit portals',
        text: 'A two-way portal lets you go in and come out. An entrance only lets you in, and an exit only lets you out. Several entrances can lead to one exit. Arrows on the rings show which is which.',
      },
      {
        tag: 'better',
        title: 'Easier portal building',
        text: 'With the Links tool, every free tile side shows a faint portal: tap one, then another to link them. Tap a portal (with Links or Select) to change its kind or remove it in the side panel.',
      },
    ],
    extras: [
      'One-way roads are back to the normal road look, with an arrow painted on them',
      'Trees and ponds no longer grow over portals',
      'Placing a tile in front of a portal breaks its link',
    ],
  },
  {
    id: '2026-11-08-portal-links',
    date: 'Nov 8, 2026',
    title: 'Portal links',
    features: [
      {
        tag: 'new',
        title: 'Portal links',
        text: 'A new kind of connection: link the side of one tile to the side of another anywhere on the board, without using a tile. Players step through the swirling rings as if the tiles were next to each other. Add them with the Links tool: tap a tile, pick a side, then pick where it comes out.',
      },
      {
        tag: 'better',
        title: 'One-way roads look different',
        text: 'One-way roads are now blue with white chevrons painted along them, pointing the way you can go, instead of a sign on top of the road.',
      },
    ],
  },
  {
    id: '2026-11-08-links-tool',
    date: 'Nov 8, 2026',
    title: 'One-way roads',
    features: [
      {
        tag: 'new',
        title: 'Links tool',
        text: 'The board builder has a new Links tool. It shows every link between neighboring tiles: tap one to make it one way, the other way, remove it, or link it again.',
      },
      {
        tag: 'rules',
        title: 'One-way roads',
        text: 'Boards can now have one-way roads, marked with a gold arrow. Players can only travel them the way the arrow points.',
      },
    ],
    extras: [
      'The board viewer and builder put the board in the middle of the grid',
      'Cleaner board collection: no Hidden tag or status messages, and a smaller eye button',
    ],
  },
  {
    id: '2026-11-08-board-viewer',
    date: 'Nov 8, 2026',
    title: 'View, edit and hide boards',
    features: [
      {
        tag: 'new',
        title: 'Board viewer',
        text: 'View in the board collection opens the board full screen: drag and zoom to look around. Tap Edit to unlock the builder tools, then Done to save, save as a new board, or leave your changes.',
      },
      {
        tag: 'new',
        title: 'Hide boards',
        text: 'Tap the eye on a board to hide it from new games without removing it. Shown boards have a gold border; hidden ones turn grey.',
      },
    ],
    extras: ["Built-in boards can't be removed or saved over: use Save as to keep your own version"],
  },
  {
    id: '2026-11-08-board-collection',
    date: 'Nov 8, 2026',
    title: 'Your board collection',
    features: [
      {
        tag: 'new',
        title: 'Board collection',
        text: 'Menu now has a Board collection in place of the board editor: every built-in board and every board you made, side by side. View one up close, remove the ones you never play, add boards from a file, or make a new one.',
      },
      {
        tag: 'better',
        title: 'Edit any board',
        text: 'Edit your own boards, or make a copy of a built-in board and change it to your liking. Removed built-in boards can be added back at any time.',
      },
    ],
    extras: ['Removed boards no longer show up in the new game board picker'],
  },
  {
    id: '2026-11-08-steady-board-panel',
    date: 'Nov 8, 2026',
    title: 'A steady board picker',
    features: [
      {
        tag: 'fix',
        title: 'The panels keep their size',
        text: 'On the new game screen, the Board and Game Settings panels stay the same size as you flip through the boards: each board fits inside one fixed frame, tall or wide.',
      },
    ],
  },
  {
    id: '2026-11-08-card-button',
    date: 'Nov 8, 2026',
    title: 'Your player card button',
    features: [
      {
        tag: 'better',
        title: 'Your character on the title screen',
        text: 'The player card button on the title screen matches Sound and Menu and shows your whole character with your name. New players start with a friendly name and character, which they can change any time.',
      },
    ],
    extras: ["When the round chip leaves, the player's turn chip glides up into its place"],
  },
  {
    id: '2026-11-08-bar-blur-fix',
    date: 'Nov 8, 2026',
    title: 'Fewer blurs',
    features: [
      {
        tag: 'fix',
        title: 'The board stays sharp on phones',
        text: 'Questions like "Buy this shop?" no longer blur the board on phones: the action bar sits in the bottom left as before. The blur only comes when choices truly don\'t fit beside the player cards.',
      },
    ],
  },
  {
    id: '2026-11-07-never-cut-off',
    date: 'Nov 7, 2026',
    title: 'Nothing cut off',
    features: [
      {
        tag: 'fix',
        title: 'Every choice stays in view',
        text: 'When the action bar has more choices than fit beside the player cards, it spreads across the screen with the board blurred behind it, and its buttons wrap onto another line instead of hiding. Big pop-ups do the same rather than shrinking too far.',
      },
    ],
  },
  {
    id: '2026-11-07-skips-logged',
    date: 'Nov 7, 2026',
    title: 'Skips in the log',
    features: [
      {
        tag: 'better',
        title: 'Skipped choices show in the game log',
        text: 'When a player passes on buying a shop, a buyout, stock, an investment, a building or a venture card offer, the game log (and the status line) says so.',
      },
    ],
    extras: ['Smart stack cards rise out of the stack smoothly'],
  },
  {
    id: '2026-11-07-smooth-stack',
    date: 'Nov 7, 2026',
    title: 'Smoother cards',
    features: [
      {
        tag: 'fix',
        title: 'The stack opens smoothly',
        text: 'Opening the card stack into a list (and folding it back) now glides the same way as switching the card layout, and that glide is a touch slower.',
      },
    ],
    extras: ["The info screen shows players by their picture only when their names don't all fit"],
  },
  {
    id: '2026-11-07-continue-panel',
    date: 'Nov 7, 2026',
    title: 'A simpler Continue screen',
    features: [
      {
        tag: 'better',
        title: 'Your saved game at a glance',
        text: 'Continuing a game shows one panel with the board and the settings you picked, and the Resume button right under them. The players stay in the bottom right corner.',
      },
    ],
  },
  {
    id: '2026-11-07-open-stack',
    date: 'Nov 7, 2026',
    title: 'Peek at the stack',
    features: [
      {
        tag: 'better',
        title: 'Open the card stack',
        text: "In the Stack and Smart layouts, tap the stack to open it into a list for 3 seconds, or rest the mouse on it to keep it open. Tap a player's card while it is open to see their info.",
      },
    ],
  },
  {
    id: '2026-11-07-takeover-pick',
    date: 'Nov 7, 2026',
    title: 'Pick, then buy',
    features: [
      {
        tag: 'fix',
        title: 'Buying a shop from a venture card',
        text: 'Hostile takeover and Estate Agency cards no longer list shops in the action bar. Tap a glowing shop on the board, check its price, then tap Buy (or Skip).',
      },
      {
        tag: 'better',
        title: 'Smart cards show the money',
        text: "In the Smart layout a player's card only pops out when their cash or net worth changes, and you see the numbers count and the money chip once the card is up.",
      },
    ],
    extras: [
      'Fixed the old front card landing out of line at the back of the stack',
      'The card layout buttons have a light backing so they are easier to find',
    ],
  },
  {
    id: '2026-11-07-rename-in-setup',
    date: 'Nov 7, 2026',
    title: 'Rename in game setup',
    features: [
      {
        tag: 'better',
        title: 'Change names before the game',
        text: "Tap a name on the new game screen to change it: yours, other players on this device, or your own seat when you've joined a friend's game. Names can now be up to 12 letters. A name too long for its card fades at the end and slides slowly back and forth so you can read all of it.",
      },
    ],
  },
  {
    id: '2026-11-07-smart-cards',
    date: 'Nov 7, 2026',
    title: 'Smart player cards',
    features: [
      {
        tag: 'new',
        title: 'List, Stack or Smart',
        text: "Three small buttons above the player cards pick how they show. List shows every card, Stack shows only the active player's card, and Smart is a stack where another player's card pops out for a moment whenever it changes on someone else's turn, so you can watch their money move.",
      },
    ],
    extras: ['The card layout buttons are a quiet outline, so they stay out of the way of the board'],
  },
  {
    id: '2026-11-07-stock-popup-fit',
    date: 'Nov 7, 2026',
    title: 'A steadier stock market',
    features: [
      {
        tag: 'better',
        title: 'The stock market stays put',
        text: 'The buy and sell pop-up never scrolls: it fits the room between the toolbar and the action bar. On small screens it fills that room with the board blurred behind it, and View board is still there. The district list shows as many districts as fit and loops round: after the last district comes the first again.',
      },
    ],
    extras: ['The live auction fills small screens the same way'],
  },
  {
    id: '2026-11-07-map-carousel',
    date: 'Nov 7, 2026',
    title: 'Map carousel',
    features: [
      {
        tag: 'better',
        title: 'Slide through the maps',
        text: 'The maps on the new game screen sit in a carousel that loops: the boards before and after peek out on the sides, and the row slides over when you pick another. Tap a side board, swipe or use the arrow keys. A gold bar on the line underneath shows where you are in the list.',
      },
    ],
    extras: [
      'Smaller screens show Board or Game Settings, picked with two chips under the title',
      'Upright windows stack Board over Game Settings when they fit',
      'The whole screen scales with the window, from phones to 4K monitors',
      'Bigger player cards',
      'Panel shadows no longer end in a hard line',
      'Board and Game Settings are the same size, with settings in two columns',
      'Vacant Plots cycles with arrows',
      'Boards are imported and edited from the board editor in the main menu',
      'Thicker Ready chips',
      'No more round limit option',
      'The board and settings sit in the middle of the room and grow on big monitors',
      'Add local player is blue, Add bot is gold',
      'Back and the title sit in the top left corner, Sound in the top right',
      'The join code sits right next to the title',
      'Bigger Map and Game settings headings',
      'A cleaner pencil on characters you can change',
    ],
  },
  {
    id: '2026-11-07-players-column',
    date: 'Nov 7, 2026',
    title: 'Players in the corner',
    features: [
      {
        tag: 'better',
        title: 'Players sit like player cards',
        text: 'The bar along the bottom of the new game screen is gone. Players and bots now sit in the bottom right corner, stacked like the player cards in the game, with Ready on each card. The map and settings get the rest of the screen.',
      },
      {
        tag: 'better',
        title: 'Newest players on top',
        text: "You're always at the bottom of the list. Anyone who joins, bot, local player or friend, pops in at the top, under the Add local player and Add bot chips. Those chips step aside once the game is full.",
      },
    ],
    extras: [
      'Joined and continued games use the same player cards',
      'Who we wait for now shows in the top bar',
      'Players keep their name and character as others come and go',
      'Narrow phones show the settings in one column',
    ],
  },
  {
    id: '2026-11-06-ready-up',
    date: 'Nov 6, 2026',
    title: 'Ready up',
    features: [
      {
        tag: 'better',
        title: 'Name plates on the seats',
        text: "Each seat shows the player's name in a colored plate above their character, just like on the board, with the Ready chip under their feet. Names are set before the game: yours is on your player card in the main menu. The players bar now glides smoothly as players come and go.",
      },
      {
        tag: 'better',
        title: 'Start with just you',
        text: 'A new game starts with only you in the players bar. The empty spot looks like a seat: tap the big + (or Add bot) for a bot, or + Local player for someone on this device, or share the code so friends can join.',
      },
      {
        tag: 'new',
        title: 'Ready up to start',
        text: 'Game setup has no Start button any more. Each player taps the Ready chip on their own seat, and when everyone is ready the game starts after a short countdown. Changed your mind? Tap Ready again to stop it.',
      },
      {
        tag: 'online',
        title: 'Friends ready up too',
        text: 'Friends who join tap the Ready chip on their own seat. Changing the board or a setting asks everyone to ready up again, so nobody starts a game they did not see.',
      },
    ],
  },
  {
    id: '2026-11-06-card-stack',
    date: 'Nov 6, 2026',
    title: 'Fold the player cards away',
    features: [
      {
        tag: 'new',
        title: 'Player card stack',
        text: 'Tap the arrow above the player cards to fold them into a stack with only the active player in front. When the turn passes, the stack cycles: the next player comes forward and the last one goes to the back. Tap the arrow again to see everyone.',
      },
    ],
    extras: [
      'The player cards glide into and out of the stack, and the last player drops to the back',
      'Player cards are a little slimmer on phones',
      'Game setup on phones: the map and settings fit side by side without scrolling',
      'The card stack arrow is a small faded button that stays out of the way',
      'Player names can be up to 10 letters, so they always fit on the player cards',
      'Continue game looks like New game: the map, settings and players, with who is back',
    ],
  },
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
    extras: [
      'Game setup keeps the players and Start on one row on phones',
      'Motel tiles show what the current player would pay there',
    ],
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
