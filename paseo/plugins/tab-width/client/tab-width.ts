export const MIN_TAB_WIDTH = 64;

const SUBPIXEL_SLACK = 1;

export function tabWidths(natural: number[], budget: number, min = MIN_TAB_WIDTH): number[] | null {
  const wants = natural.map((width) => Math.max(min, Math.ceil(width)));
  if (budget < min * wants.length) return null;
  if (wants.reduce((total, width) => total + width, 0) <= budget) return wants;

  const widths = new Array<number>(wants.length);
  const narrowestFirst = wants.map((_, index) => index).sort((a, b) => wants[a] - wants[b]);
  let remaining = budget;
  let left = wants.length;
  for (const index of narrowestFirst) {
    const share = Math.floor(remaining / left);
    widths[index] = Math.min(wants[index], share);
    remaining -= widths[index];
    left -= 1;
  }
  return widths;
}

export interface TabMeasure {
  chipWidth: number;
  handleWidth: number;
  handleContentWidth: number;
  labelWidth: number;
  labelFullWidth: number;
}

export function naturalWidth(tab: TabMeasure): number {
  const handleSlack = Math.max(0, tab.handleWidth - tab.handleContentWidth);
  return tab.chipWidth - handleSlack - tab.labelWidth + tab.labelFullWidth + SUBPIXEL_SLACK;
}
