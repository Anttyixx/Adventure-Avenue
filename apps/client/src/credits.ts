/**
 * Credits for work by other people that the game uses, shown in "Credits" on the main menu.
 * Add an entry whenever an asset, font or library from someone else goes into the game.
 */
export interface CreditLink {
  label: string;
  url: string;
}

export interface Credit {
  /** The person or group. */
  who: string;
  /** What kind of thing they made, e.g. "Character art". */
  role: string;
  /** What the game uses from them. */
  used: string[];
  license: CreditLink;
  links: CreditLink[];
  note?: string;
  /** The player characters (ids) to show on the card. */
  characters?: string[];
}

const CC_BY_4 = { label: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };
const OFL = { label: 'SIL Open Font License 1.1', url: 'https://openfontlicense.org/' };

export const CREDITS: Credit[] = [
  {
    who: 'Franuka',
    role: 'Character art',
    used: [
      'Fantasy RPG - Medieval townsfolk (v1.0)',
      'Nine player characters with their idle and walking animations: Farmer, Fisherman, Blacksmith, Merchant, Alchemist, Barmaid, Bartender and the two kids',
    ],
    license: CC_BY_4,
    links: [
      { label: 'itch.io', url: 'https://franuka.itch.io/' },
      { label: 'Twitter', url: 'https://twitter.com/franuka_art' },
      { label: 'Instagram', url: 'https://www.instagram.com/franuka.art/' },
    ],
    note: 'Also makes the Fantasy RPG asset pack and takes commissions.',
    characters: [
      'farmer',
      'fisherman',
      'blacksmith',
      'merchant',
      'alchemist',
      'barmaid',
      'bartender',
      'kid01',
      'kid02',
    ],
  },
  {
    who: 'Phewcumber',
    role: 'Character art',
    used: [
      'Skeleton Pack and the zombie',
      'The Skeleton and Zombie player characters with their idle and walking animations',
    ],
    license: { label: 'Terms on the pack page', url: 'https://phewcumber.itch.io/skeleton-pack' },
    links: [
      { label: 'itch.io', url: 'https://phewcumber.itch.io/' },
      { label: 'Bluesky', url: 'https://bsky.app/profile/phewcumber.bsky.social' },
      { label: 'Portfolio', url: 'https://lukaslundin.carrd.co/' },
      { label: 'Skeleton Pack', url: 'https://phewcumber.itch.io/skeleton-pack' },
    ],
    characters: ['skeleton', 'zombie'],
  },

  {
    who: 'Juan Montoreano',
    role: 'Font',
    used: ['Lilita One: titles, buttons and name tags'],
    license: OFL,
    links: [{ label: 'Google Fonts', url: 'https://fonts.google.com/specimen/Lilita+One' }],
  },
  {
    who: 'Braille Institute of America',
    role: 'Font',
    used: ['Atkinson Hyperlegible: all body text'],
    license: OFL,
    links: [
      { label: 'Google Fonts', url: 'https://fonts.google.com/specimen/Atkinson+Hyperlegible' },
      { label: 'Braille Institute', url: 'https://www.brailleinstitute.org/freefont/' },
    ],
  },
  {
    who: 'The PeerJS team',
    role: 'Online play',
    used: ['PeerJS: the library that connects players for online games, and its free connection server'],
    license: { label: 'MIT License', url: 'https://github.com/peers/peerjs/blob/master/LICENSE' },
    links: [
      { label: 'peerjs.com', url: 'https://peerjs.com/' },
      { label: 'GitHub', url: 'https://github.com/peers/peerjs' },
    ],
  },
];
