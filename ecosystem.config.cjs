module.exports = {
  apps: [
    {
      name: 'u-app-api',
      cwd: './apps/api',
      script: 'dist/server.cjs',
      interpreter: 'node',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
