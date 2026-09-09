/** Screen-space rect (px), same frame as Handle.sx/sy. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export const TRASH_SIZE_PX = 40
export const TRASH_MARGIN_PX = 12

/** Trash target: fixed to the canvas's bottom-right corner, independent of camera/zoom. */
export function trashRect(width: number, height: number): Rect {
  return {
    x: width - TRASH_MARGIN_PX - TRASH_SIZE_PX,
    y: height - TRASH_MARGIN_PX - TRASH_SIZE_PX,
    w: TRASH_SIZE_PX,
    h: TRASH_SIZE_PX,
  }
}

export function pointInTrash(rect: Rect, sx: number, sy: number): boolean {
  return sx >= rect.x && sx <= rect.x + rect.w && sy >= rect.y && sy <= rect.y + rect.h
}
