/* global process, URL */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

function readEnvFile(path) {
  if (!existsSync(path)) return {}
  return Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/).flatMap((line) => {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, '')]] : []
  }))
}

export function mergedEnvironment() {
  return { ...readEnvFile(resolve(root, 'apps/api/.env.local')), ...process.env }
}

export function databaseTarget(env, { confirmation, readOnly = false } = {}) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  if (env.APP_ENV !== 'production') throw new Error('APP_ENV=production is required for production bootstrap tools')
  if (env.NODE_ENV !== 'production') throw new Error('NODE_ENV=production is required for production bootstrap tools')
  let url
  try { url = new URL(env.DATABASE_URL) } catch { throw new Error('DATABASE_URL must be a valid MySQL URL') }
  if (url.protocol !== 'mysql:') throw new Error('DATABASE_URL must use the mysql protocol')
  const host = url.hostname.toLowerCase()
  const port = url.port || '3306'
  const database = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) ?? '')
  if (!['127.0.0.1', 'localhost'].includes(host) || port !== '3306' || database !== 'u_app') {
    throw new Error('Production bootstrap tools only allow 127.0.0.1:3306/u_app')
  }
  if (!readOnly && confirmation && env[confirmation.name] !== confirmation.value) {
    throw new Error(`${confirmation.name}=${confirmation.value} is required for this production write`)
  }
  return { url, database: 'u_app', host: '127.0.0.1', port: 3306 }
}

export async function openProductionPool(options = {}) {
  const env = mergedEnvironment()
  const target = databaseTarget(env, options)
  const pool = mysql.createPool({ uri: target.url.toString(), connectionLimit: 2, timezone: 'Z' })
  const [[current]] = await pool.query('SELECT DATABASE() AS database_name')
  if (current?.database_name !== 'u_app') {
    await pool.end()
    throw new Error('Production bootstrap target is not u_app')
  }
  return { env, target, pool }
}

export function parseOption(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

export { root }
