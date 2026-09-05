const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// Taro stores non-essential CLI config in the user's home by default. Keep it
// inside the ignored project cache so builds remain self-contained.
const localHome = path.resolve(__dirname, '../.cache/home')
fs.mkdirSync(localHome, { recursive: true })
os.homedir = () => localHome

const cliRoot = path.dirname(require.resolve('@tarojs/cli/package.json'))
require(path.join(cliRoot, 'bin/taro'))
