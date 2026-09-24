// CLEAN-01 criterion 1: vite preview + headless Chromium, sim chunk blocked.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = 'D:/Desktop/Projects/PhysiSyst'
const PORT = 4179
const URL = `http://127.0.0.1:${PORT}/`
const CHROME = process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const preview = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: ROOT, shell: true, stdio: 'ignore' })
const profile = mkdtempSync(join(tmpdir(), 'clean01-'))
const chrome = spawn(CHROME, ['--headless=new', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
const endpoint = await new Promise((resolve) => {
  let logs = ''
  chrome.stderr.on('data', (c) => { logs += c; const m = /DevTools listening on (ws:\/\/\S+)/.exec(logs); if (m) resolve(m[1]) })
})

const ws = new WebSocket(endpoint)
await new Promise((r) => { ws.onopen = r })
let seq = 0
const pending = new Map()
const events = []
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id) } else if (msg.method) events.push(msg)
}
const send = (method, params = {}, sessionId) => new Promise((resolve) => { const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params, sessionId })) })

const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' })
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true })
const s = (m, p) => send(m, p, sessionId)
const evaluate = async (expression) => (await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value
const loads = () => events.filter((e) => e.method === 'Page.loadEventFired').length
const errorShown = () => evaluate("document.body.innerText.includes('não foi possível carregar o motor')")
const block = (on) => s('Network.setBlockedURLs', { urls: on ? ['*assets/sim-*.js'] : [] })
const clickRetry = () => evaluate("[...document.querySelectorAll('button')].find(b => b.textContent.includes('tentar de novo'))?.click()")

for (let i = 0; i < 50; i++) { try { await fetch(URL); break } catch { await sleep(200) } }
await s('Page.enable'); await s('Network.enable'); await s('Network.setCacheDisabled', { cacheDisabled: true })

const log = []
// Scenario A: persistent block.
await block(true)
await s('Page.navigate', { url: URL })
await sleep(4000)
log.push(`A persistent block: loads=${loads()} errorPanel=${await errorShown()}`)
await sleep(9000) // past the 10 s window since the auto-reload
const before = loads()
await clickRetry()
await sleep(4000)
log.push(`A retry after window: newLoads=${loads() - before} errorPanel=${await errorShown()}`)
const beforeInWindow = loads()
await clickRetry()
await sleep(3000)
log.push(`A retry inside window: newLoads=${loads() - beforeInWindow} errorPanel=${await errorShown()}`)

// Scenario B: transient failure (stale deploy / network blip) — unblock right after the first failure.
await evaluate('sessionStorage.clear()')
const bStart = loads()
const eStart = events.length
await block(true)
await s('Page.navigate', { url: URL })
for (let i = 0; i < 200 && !events.slice(eStart).some((e) => e.method === 'Network.loadingFailed' && e.params.blockedReason); i++) await sleep(20)
await block(false)
await sleep(6000)
const booted = await evaluate("!document.body.innerText.includes('não foi possível carregar o motor') && !!document.querySelector('canvas')")
log.push(`B transient: loads=${loads() - bStart} errorPanel=${await errorShown()} canvasNoError=${booted}`)

console.log(log.join('\n'))
ws.close(); chrome.kill(); spawn('taskkill', ['/pid', String(preview.pid), '/T', '/F'], { stdio: 'ignore' })
await sleep(1000)
try { rmSync(profile, { recursive: true, force: true }) } catch {}
process.exit(0)
