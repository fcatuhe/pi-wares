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

export function pageStep(viewportHeight: number): number {
  return Math.max(viewportHeight * 0.875, viewportHeight - 40);
}
