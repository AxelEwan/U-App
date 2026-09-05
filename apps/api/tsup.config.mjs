export default {
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  sourcemap: true,
  noExternal: ['@qzu/config', '@qzu/contracts', '@qzu/core', '@qzu/db'],
}
