export interface TreeNode {
  parentNode: TreeNode | null;
}

export function nearestTo<T extends TreeNode>(candidates: T[], focus: TreeNode | null): T | undefined {
  const distanceFromFocus = new Map<TreeNode, number>();
  for (let node = focus, distance = 0; node; node = node.parentNode, distance++) {
    distanceFromFocus.set(node, distance);
  }

  let nearest: T | undefined;
  let nearestDistance = Infinity;
  for (const candidate of candidates) {
    let node: TreeNode | null = candidate;
    while (node && !distanceFromFocus.has(node)) node = node.parentNode;
    const distance = node ? distanceFromFocus.get(node)! : Infinity;
    if (!nearest || distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export interface Box {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function covers(overlay: Box, chat: Box): boolean {
  const width = Math.min(overlay.right, chat.right) - Math.max(overlay.left, chat.left);
  const height = Math.min(overlay.bottom, chat.bottom) - Math.max(overlay.top, chat.top);
  return width > 1 && height > 1;
}

export function pageStep(viewportHeight: number): number {
  return Math.max(viewportHeight * 0.875, viewportHeight - 40);
}

export function separatorOffset(viewportHeight: number, up: boolean): number {
  const overlap = viewportHeight - pageStep(viewportHeight);
  return up ? overlap / 2 : viewportHeight - overlap / 2;
}

export interface PageTurn {
  viewportHeight: number;
  scrollTop: number;
  scrollHeight: number;
  scrolled: number;
  up: boolean;
}

export function separatorOffsets({ viewportHeight, scrollTop, scrollHeight, scrolled, up }: PageTurn): number[] {
  const offsets: number[] = [];
  if (scrolled !== 0) offsets.push(separatorOffset(viewportHeight, up) - scrolled);
  if (scrollTop > 0) offsets.push(separatorOffset(viewportHeight, true));
  if (scrollTop + viewportHeight < scrollHeight - 1) offsets.push(separatorOffset(viewportHeight, false));
  return offsets.filter((offset, index) => offsets.findIndex((other) => Math.abs(other - offset) < 2) === index);
}
