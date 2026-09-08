/* global process */

// Keep the production entrypoint as an explicit .mjs script while running the
// shared, type-checked implementation through the repository's tsx tool.
await import('./import-academic-config.ts')
