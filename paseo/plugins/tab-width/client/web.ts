import { Platform } from "react-native";
import { naturalWidth, tabWidths } from "./tab-width";

const TABS_SCROLL = '[data-testid="workspace-tabs-scroll"]';
const TAB_CHIP = '[data-testid^="workspace-tab-"][aria-selected]';
const TAB_HANDLE = "[data-status-bucket]";
const TAB_LABEL = ':scope > [dir="auto"]';

export function widenTabs(): () => void {
  if (Platform.OS !== "web") return () => {};

  const style = document.createElement("style");
  document.head.append(style);
  let frame = 0;
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(apply);
  };
  const resizes = new ResizeObserver(schedule);
  const mutations = new MutationObserver(schedule);
  mutations.observe(document.body, { childList: true, subtree: true, characterData: true });
  schedule();

  function apply() {
    frame = 0;
    resizes.disconnect();
    const rules: string[] = [];
    for (const scroll of document.querySelectorAll<HTMLElement>(TABS_SCROLL)) {
      resizes.observe(scroll);
      rules.push(...rowRules(scroll));
    }
    const text = rules.join("\n");
    if (style.textContent !== text) style.textContent = text;
  }

  return () => {
    cancelAnimationFrame(frame);
    mutations.disconnect();
    resizes.disconnect();
    style.remove();
  };
}

function rowRules(scroll: HTMLElement): string[] {
  const chips = [...scroll.querySelectorAll<HTMLElement>(TAB_CHIP)];
  const content = chips[0] && childOf(scroll, chips[0]);
  if (!content) return [];

  const chipWidths = chips.map((chip) => chip.getBoundingClientRect().width);
  const freeWidth = scroll.clientWidth - content.getBoundingClientRect().width;
  const budget = Math.floor(chipWidths.reduce((total, width) => total + width, 0) + freeWidth);
  const widths = tabWidths(
    chips.map((chip, index) => measureNatural(chip) ?? chipWidths[index]),
    budget,
  );
  if (!widths) return [];

  return chips.map((chip, index) => {
    const selector = `[data-testid="${CSS.escape(chip.dataset.testid ?? "")}"]`;
    const width = `${widths[index]}px !important`;
    return `${selector} { width: ${width}; min-width: ${width}; max-width: ${width}; }`;
  });
}

function measureNatural(chip: HTMLElement): number | undefined {
  const handle = chip.querySelector<HTMLElement>(TAB_HANDLE);
  const label = handle?.querySelector<HTMLElement>(TAB_LABEL);
  if (!handle || !label) return undefined;

  const parts = [...handle.children].map((part) => part.getBoundingClientRect().width);
  const gap = Number.parseFloat(getComputedStyle(handle).columnGap) || 0;
  return naturalWidth({
    chipWidth: chip.getBoundingClientRect().width,
    handleWidth: handle.getBoundingClientRect().width,
    handleContentWidth: parts.reduce((total, width) => total + width, 0) + gap * Math.max(parts.length - 1, 0),
    labelWidth: label.getBoundingClientRect().width,
    labelFullWidth: label.scrollWidth,
  });
}

function childOf(ancestor: HTMLElement, descendant: HTMLElement): HTMLElement | undefined {
  let node: HTMLElement | null = descendant;
  while (node && node.parentElement !== ancestor) node = node.parentElement;
  return node ?? undefined;
}
