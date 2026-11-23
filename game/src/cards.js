// Emberclash card data: 24 unique cards across four elements. Every card is an
// original Emberclash invention; nothing here copies a commercial card game.
// Synergy rule (see engine.js): playing a card whose element matches the element of
// the card you played just before it this turn gives +1 attack / +1 damage.
// Rarity is shown by frame colour: common (grey), rare (blue), epic (purple).
export const ELEMENTS = {
  fire: { name: 'Fire', color: '#e8590c', glow: '#ff922b', icon: '🔥' },
  water: { name: 'Water', color: '#1971c2', glow: '#4dabf7', icon: '💧' },
  earth: { name: 'Earth', color: '#8a6d1b', glow: '#e9c46a', icon: '🪨' },
  wind: { name: 'Wind', color: '#0b7285', glow: '#3bc9db', icon: '🌪️' },
};
// Element icons are emoji glyphs from the system font stack: no image files, no network.

/**
 * Card fields:
 *  id, name, element, cost, rarity ('common' | 'rare' | 'epic'),
 *  kind ('minion' | 'spell'), attack, health (minions),
 *  text (rules text), target ('enemy-minion' | 'enemy-hero' | 'any-enemy' |
 *  'own-hero' | 'none'), damage / heal / draw (spells), taunt, destroyMax (removal).
 */
export const CARDS = [
  // ---- Fire: fast damage, burn the enemy down ----
  { id: 'ember-sprite', name: 'Ember Sprite', element: 'fire', cost: 1, rarity: 'common', kind: 'minion', attack: 2, health: 1, text: 'A spark with teeth.' },
  { id: 'flame-imp', name: 'Flame Imp', element: 'fire', cost: 2, rarity: 'common', kind: 'minion', attack: 3, health: 2, text: 'Cackles as it bites.' },
  { id: 'fireball', name: 'Fireball', element: 'fire', cost: 3, rarity: 'rare', kind: 'spell', target: 'any-enemy', damage: 4, text: 'Deal 4 damage to any enemy.' },
  { id: 'inferno-wave', name: 'Inferno Wave', element: 'fire', cost: 4, rarity: 'rare', kind: 'spell', target: 'none', damage: 2, text: 'Deal 2 damage to all enemy minions.' },
  { id: 'pyro-drake', name: 'Pyro Drake', element: 'fire', cost: 5, rarity: 'epic', kind: 'minion', attack: 5, health: 5, text: 'Its wings are wildfire.' },
  { id: 'meteor-fall', name: 'Meteor Fall', element: 'fire', cost: 8, rarity: 'epic', kind: 'spell', target: 'enemy-hero', damage: 8, text: 'Deal 8 damage to the enemy hero.' },
  // ---- Water: defence, healing, big bodies ----
  { id: 'tide-wisp', name: 'Tide Wisp', element: 'water', cost: 1, rarity: 'common', kind: 'minion', attack: 1, health: 2, text: 'Drifts in on the tide.' },
  { id: 'frost-ray', name: 'Frost Ray', element: 'water', cost: 2, rarity: 'common', kind: 'spell', target: 'any-enemy', damage: 3, text: 'Deal 3 damage to any enemy.' },
  { id: 'coral-guardian', name: 'Coral Guardian', element: 'water', cost: 3, rarity: 'rare', kind: 'minion', attack: 2, health: 5, taunt: true, text: 'Taunt. Enemies must attack it first.' },
  { id: 'healing-rain', name: 'Healing Rain', element: 'water', cost: 3, rarity: 'rare', kind: 'spell', target: 'own-hero', heal: 6, text: 'Restore 6 health to your hero.' },
  { id: 'deep-leviathan', name: 'Deep Leviathan', element: 'water', cost: 6, rarity: 'epic', kind: 'minion', attack: 6, health: 6, text: 'The sea itself, angry.' },
  { id: 'tidal-surge', name: 'Tidal Surge', element: 'water', cost: 5, rarity: 'epic', kind: 'spell', target: 'none', damage: 3, draw: 1, text: 'Deal 3 to all enemy minions. Draw a card.' },
  // ---- Earth: tough blockers and removal ----
  { id: 'pebble-golem', name: 'Pebble Golem', element: 'earth', cost: 2, rarity: 'common', kind: 'minion', attack: 2, health: 3, text: 'Slow, stubborn, solid.' },
  { id: 'stone-wall', name: 'Stone Wall', element: 'earth', cost: 2, rarity: 'common', kind: 'minion', attack: 1, health: 6, taunt: true, text: 'Taunt. Enemies must attack it first.' },
  { id: 'root-grasp', name: 'Root Grasp', element: 'earth', cost: 2, rarity: 'rare', kind: 'spell', target: 'enemy-minion', destroyMax: 3, text: 'Destroy an enemy minion with 3 or less attack.' },
  { id: 'thorn-vine', name: 'Thorn Vine', element: 'earth', cost: 3, rarity: 'rare', kind: 'minion', attack: 4, health: 2, text: 'Beautiful. Do not touch it.' },
  { id: 'quake', name: 'Quake', element: 'earth', cost: 4, rarity: 'rare', kind: 'spell', target: 'none', damage: 3, text: 'Deal 3 damage to all enemy minions.' },
  { id: 'mountain-giant', name: 'Mountain Giant', element: 'earth', cost: 6, rarity: 'epic', kind: 'minion', attack: 7, health: 7, text: 'It was a hill until it stood up.' },
  // ---- Wind: speed, card draw, storm finishers ----
  { id: 'swift-scout', name: 'Swift Scout', element: 'wind', cost: 1, rarity: 'common', kind: 'minion', attack: 2, health: 1, draw: 1, text: 'Draw a card when played.' },
  { id: 'gale-hawk', name: 'Gale Hawk', element: 'wind', cost: 2, rarity: 'common', kind: 'minion', attack: 3, health: 1, text: 'Strikes before the thunder.' },
  { id: 'whisper-wind', name: 'Whispering Wind', element: 'wind', cost: 1, rarity: 'common', kind: 'spell', target: 'none', draw: 2, text: 'Draw 2 cards.' },
  { id: 'cyclone', name: 'Cyclone', element: 'wind', cost: 3, rarity: 'rare', kind: 'spell', target: 'none', damage: 2, text: 'Deal 2 damage to all enemy minions.' },
  { id: 'storm-eagle', name: 'Storm Eagle', element: 'wind', cost: 4, rarity: 'rare', kind: 'minion', attack: 4, health: 4, text: 'Rides the storm, never flees it.' },
  { id: 'sky-tempest', name: 'Sky Tempest', element: 'wind', cost: 8, rarity: 'epic', kind: 'minion', attack: 8, health: 7, text: 'The last storm. The final sky.' },
];

/** Look a card definition up by id. */
export function cardById(id) {
  return CARDS.find((c) => c.id === id);
}

/** A 30-card deck: all 24 uniques plus a second copy of the six 1-cost cards. */
export function buildDeck() {
  const ids = CARDS.map((c) => c.id);
  const extra = CARDS.filter((c) => c.cost === 1).map((c) => c.id);
  return ids.concat(extra);
}

/** Frame colour per rarity, used by the renderer for card borders. */
export const RARITY_STYLE = {
  common: { border: '#9aa0a6', label: 'Common' },
  rare: { border: '#4dabf7', label: 'Rare' },
  epic: { border: '#b197fc', label: 'Epic' },
};
