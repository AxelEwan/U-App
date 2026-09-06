import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function loadApiLocalEnv(): void {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (!match) continue
    const key = match[1]
    const value = match[2]
    if (!key || value === undefined || key in process.env) continue
    process.env[key] = value.replace(/^['"]|['"]$/g, '')
  }
}
