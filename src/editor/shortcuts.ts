export type ShortcutAction =
  | 'undo'
  | 'redo'
  | 'delete'
  | 'togglePlay'
  | 'stepOnce'
  | 'reset'
  | 'deselectOrClose'
  | 'toggleHelp'

export interface KeyInput {
  key: string
  ctrlKey: boolean
  /** Cmd on macOS — treated identically to ctrlKey; the menu only ever shows "Ctrl". */
  metaKey: boolean
  shiftKey: boolean
  inTextField: boolean
  /** The focused element (e.g. a <button>) already activates on Space/Enter itself. */
  targetHandlesKeyNatively: boolean
}

const NATIVE_ACTIVATION_KEYS = new Set([' ', 'enter'])

/** Pure keydown -> action mapping. Null means "not a shortcut, let the browser/field handle it". */
export function actionForKey(input: KeyInput): ShortcutAction | null {
  if (input.inTextField) return null
  const key = input.key.toLowerCase()
  if (input.targetHandlesKeyNatively && NATIVE_ACTIVATION_KEYS.has(key)) return null
  const ctrl = input.ctrlKey || input.metaKey

  if (ctrl && key === 'z') return input.shiftKey ? 'redo' : 'undo'
  if (ctrl && key === 'y') return 'redo'
  if (ctrl) return null

  switch (key) {
    case 'delete':
    case 'backspace':
      return 'delete'
    case ' ':
      return 'togglePlay'
    case 'arrowright':
      return 'stepOnce'
    case 'r':
      return 'reset'
    case 'escape':
      return 'deselectOrClose'
    case '?':
      return 'toggleHelp'
    default:
      return null
  }
}
