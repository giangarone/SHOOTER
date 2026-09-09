// THE TEN THEMES, ASSEMBLED.
//
// Importing a theme file is what puts that theme in the game: each one
// registers its own entries into the shared ENEMY_TYPES at the bottom of
// itself, so this file is a LIST rather than a table. There is nothing here to
// keep in step with the ten files below - adding a theme is one line, and
// forgetting to add it is a theme that is simply not in the game rather than a
// half-registered one.
//
// The `export *` lines are what let js/enemy.js reach a type's constants
// without knowing which theme owns them. Every name in the split is unique, so
// there is nothing for them to shadow.

export * from './shared.js';
export * from './brine.js';
export * from './ember.js';
export * from './plague.js';
export * from './rime.js';
export * from './rust.js';
export * from './solar.js';
export * from './strata.js';
export * from './tempest.js';
export * from './verdant.js';
export * from './void.js';
