export const DISPLAY_WIDTH = 576
export const DISPLAY_HEIGHT = 288

export const HEADER_HEIGHT = 30
export const FOOTER_HEIGHT = 34
export const BODY_TOP = HEADER_HEIGHT + 4
export const BODY_HEIGHT = DISPLAY_HEIGHT - HEADER_HEIGHT - FOOTER_HEIGHT - 8

export const MAP_WIDTH = 200
export const MAP_TILE_HEIGHT = 108
export const MAP_HEIGHT = MAP_TILE_HEIGHT * 2
export const MAP_TOP = BODY_TOP + Math.round((BODY_HEIGHT - MAP_HEIGHT) / 2)
export const TEXT_WIDTH = DISPLAY_WIDTH - MAP_WIDTH - 8
