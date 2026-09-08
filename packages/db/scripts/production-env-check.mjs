/* global console, process */

import { existsSync, readFileSync } from 'node:fs'

const productionEnvFile = '/etc/u-app/api-production.env'

function readEnvFile(path) {
  if (!existsSync(path)) return {}
  return Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/).flatMap((line) => {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, '')]] : []
  }))
}

const env = { ...readEnvFile(productionEnvFile), ...process.env }
const status = (key) => env[key] ? 'SET' : 'MISSING'

console.log(JSON.stringify({
  event: 'production_env_check',
  CORE_REQUIRED: {
    NODE_ENV: status('NODE_ENV'),
    APP_ENV: status('APP_ENV'),
    DATABASE_URL: status('DATABASE_URL'),
    AUTH_SESSION_SECRET: status('AUTH_SESSION_SECRET'),
    CORS_ORIGINS: status('CORS_ORIGINS'),
  },
  OPTIONAL_AUTH: {
    WECHAT_APP_ID: status('WECHAT_APP_ID'),
    WECHAT_APP_SECRET: status('WECHAT_APP_SECRET'),
    CASDOOR_CLIENT_ID: status('CASDOOR_CLIENT_ID'),
    CASDOOR_CLIENT_SECRET: status('CASDOOR_CLIENT_SECRET'),
    ADMIN_LOGIN_SECRET_HASH: status('ADMIN_LOGIN_SECRET_HASH'),
  },
}))
