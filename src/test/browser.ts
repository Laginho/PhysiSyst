// Drives the real Vite app inside a fresh headless Chromium profile, over CDP
// on a local socket. That avoids a browser-driver dependency and never attaches
// to the user's own browser. CHROME_BIN can point at a non-standard install;
// a missing browser fails the session rather than skipping it.
import { spawn, type ChildProcess } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import { makeTransform, pixelsPerMeterForWidth, worldToScreen } from '../render/transform'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
  top: number
  right: number
  bottom: number
  left: number
}

export interface Point {
  x: number
  y: number
}

export interface BrowserSession {
  /** Navigates to a fresh load of the app, with storage cleared and layout settled. */
  reset(): Promise<void>
  rect(): Promise<Rect>
  /** World coordinates, converted with the app's own camera. */
  select(worldX: number, worldY: number): Promise<void>
  selectedLegends(): Promise<string[]>
  drag(from: Point, to: Point): Promise<void>
  /** Reads the "caixa" body panel's x/y number inputs, in world meters. */
  readBoxPosition(): Promise<Point>
  close(): Promise<void>
}

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter((candidate): candidate is string => Boolean(candidate))

async function findChromeExecutable(): Promise<string> {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // try the next candidate
    }
  }
  throw new Error('browser harness requires Chromium: set CHROME_BIN to its executable')
}

function waitForDevtoolsEndpoint(browser: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let logs = ''
    browser.stderr?.on('data', (chunk: Buffer) => {
      logs += chunk.toString()
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(logs)
      if (match) resolve(match[1])
    })
    browser.on('error', reject)
    browser.on('exit', (code) => reject(new Error(`Chromium exited ${code}: ${logs}`)))
  })
}

interface CdpResult {
  result: { value: unknown }
  exceptionDetails?: unknown
}

class CdpConnection {
  #socket: WebSocket
  #sequence = 0
  #pending = new Map<number, { resolve: (value: never) => void; reject: (reason: unknown) => void }>()

  private constructor(socket: WebSocket) {
    this.#socket = socket
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data as string) as { id: number; result?: unknown; error?: unknown }
      const callback = this.#pending.get(message.id)
      if (!callback) return
      this.#pending.delete(message.id)
      if (message.error) callback.reject(new Error(JSON.stringify(message.error)))
      else callback.resolve(message.result as never)
    }
    socket.onclose = () => {
      for (const callback of this.#pending.values()) callback.reject(new Error('Chromium disconnected'))
      this.#pending.clear()
    }
  }

  static async connect(endpoint: string): Promise<CdpConnection> {
    const socket = new WebSocket(endpoint)
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve()
      socket.onerror = () => reject(new Error('failed to connect to Chromium DevTools'))
    })
    return new CdpConnection(socket)
  }

  send<T>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    const id = ++this.#sequence
    return new Promise<T>((resolve, reject) => {
      this.#pending.set(id, { resolve: resolve as (value: never) => void, reject })
      this.#socket.send(JSON.stringify({ id, method, params, sessionId }))
    })
  }

  close(): void {
    this.#socket.close()
  }
}

const READ_BOX_POSITION_SCRIPT = `(() => {
  const panel = [...document.querySelectorAll('fieldset')]
    .find(el => el.querySelector('legend')?.textContent.trim() === 'caixa');
  if (!panel) throw new Error('missing caixa panel');
  const read = label => Number([...panel.querySelectorAll('label')]
    .find(el => el.textContent.trim() === label).querySelector('input').value);
  return { x: read('x (m)'), y: read('y (m)') };
})()`

// Samples across animation frames so a feedback loop that never settles fails
// the check, instead of being mistaken for a stable rectangle after one tick.
const SETTLE_SCRIPT = `new Promise((resolve, reject) => {
  let previous = '', same = 0, frames = 0;
  function sample() {
    const canvas = document.querySelector('canvas');
    const value = canvas && JSON.stringify(canvas.getBoundingClientRect().toJSON());
    same = value && value === previous ? same + 1 : 0;
    previous = value;
    if (same >= 8) resolve();
    else if (++frames > 120) reject(new Error('canvas geometry did not settle'));
    else requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
})`

export async function openBrowserSession(width: number): Promise<BrowserSession> {
  const executable = await findChromeExecutable()
  const profile = await mkdtemp(join(tmpdir(), 'phy-21-'))
  const server: ViteDevServer = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'silent' })

  let browser: ChildProcess | undefined
  let cdp: CdpConnection | undefined

  const cleanup = async () => {
    cdp?.close()
    if (browser && browser.exitCode === null) {
      const exited = new Promise((resolve) => browser?.once('exit', resolve))
      browser.kill()
      await exited
    }
    await server.close()
    await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  }

  let sessionId: string
  try {
    await server.listen()
    browser = spawn(
      executable,
      [
        '--headless=new',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true },
    )
    const endpoint = await waitForDevtoolsEndpoint(browser)
    cdp = await CdpConnection.connect(endpoint)
    const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' })
    ;({ sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true }))
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 1080, deviceScaleFactor: 1, mobile: false }, sessionId)
  } catch (error) {
    await cleanup()
    throw error
  }

  const connection = cdp
  const activeSessionId = sessionId

  const evaluate = async <T>(expression: string): Promise<T> => {
    const outcome = await connection.send<CdpResult>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, activeSessionId)
    if (outcome.exceptionDetails) throw new Error(JSON.stringify(outcome.exceptionDetails))
    return outcome.result.value as T
  }

  const rect = () => evaluate<Rect>("document.querySelector('canvas').getBoundingClientRect().toJSON()")

  const settle = () => evaluate<void>(SETTLE_SCRIPT)

  const worldToScreenPoint = (rectangle: Rect, worldX: number, worldY: number): Point => {
    const innerWidth = rectangle.width - 2
    const innerHeight = rectangle.height - 2
    const transform = makeTransform({ centerX: 6, centerY: 4, pixelsPerMeter: pixelsPerMeterForWidth(innerWidth) }, innerWidth, innerHeight)
    const local = worldToScreen(transform, worldX, worldY)
    return { x: rectangle.left + local.x, y: rectangle.top + local.y }
  }

  const mouse = (type: string, point: Point) =>
    connection.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }, activeSessionId)

  const reset = async () => {
    const url = server.resolvedUrls?.local[0]
    if (!url) throw new Error('Vite dev server has no resolved URL')
    await connection.send('Page.navigate', { url }, activeSessionId)
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate<boolean>("Boolean(document.querySelector('canvas'))")) break
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    await evaluate<void>('localStorage.clear()')
    await settle()
  }

  const select = async (worldX: number, worldY: number) => {
    const position = worldToScreenPoint(await rect(), worldX, worldY)
    await mouse('mousePressed', position)
    await mouse('mouseReleased', position)
    await settle()
  }

  const selectedLegends = () => evaluate<string[]>("[...document.querySelectorAll('legend')].map(el => el.textContent.trim())")

  const drag = async (from: Point, to: Point) => {
    const rectangle = await rect()
    const start = worldToScreenPoint(rectangle, from.x, from.y)
    const target = worldToScreenPoint(rectangle, to.x, to.y)
    await mouse('mousePressed', start)
    await settle()
    await mouse('mouseMoved', target)
    await mouse('mouseMoved', target)
    await mouse('mouseReleased', target)
  }

  const readBoxPosition = () => evaluate<Point>(READ_BOX_POSITION_SCRIPT)

  return { reset, rect, select, selectedLegends, drag, readBoxPosition, close: cleanup }
}

/**
 * Opens a session, runs `scenario`, and guarantees Chromium, the Vite server
 * and the temp profile are torn down even if `scenario` exceeds `timeoutMs` —
 * the timeout only stops waiting, it does not abandon the session's own cleanup.
 */
export async function withBrowserSession<T>(width: number, timeoutMs: number, scenario: (session: BrowserSession) => Promise<T>): Promise<T> {
  const session = await openBrowserSession(width)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      scenario(session),
      new Promise<never>((_resolve, reject) => {
        // Cleared in the finally: a live timer would hold the event loop open
        // for the rest of timeoutMs after a scenario that finished early.
        timer = setTimeout(() => reject(new Error('browser scenario timed out')), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
    await session.close()
  }
}
