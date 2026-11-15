import { Platform } from "react-native";
import { covers, nearestTo, pageStep, separatorOffsets } from "./page-scroll";

const CHAT_SCROLLER = '[data-testid="agent-chat-scroll"]';
const OWN_PAGING_KEYS = ".xterm, .cm-editor";
const KEYBOARD_MODE = "data-page-scroll-keyboard";
const SEPARATOR = "data-page-scroll-separator";
const HIDDEN_OVERLAY = "data-page-scroll-hidden";
const HIDE_OVERLAYS = `
  html[${KEYBOARD_MODE}] [data-testid="scroll-to-bottom-button"] { display: none; }
  [${HIDDEN_OVERLAY}] { visibility: hidden !important; }
`;
const SEPARATOR_INSET = 16;

interface Separator {
  anchor: Element;
  offset: number;
  line: HTMLElement;
}

let separators: { chat: HTMLElement; lines: Separator[]; frame: number } | null = null;

export function listenForPageKeys(): () => void {
  if (Platform.OS !== "web") return () => {};

  const style = document.createElement("style");
  style.textContent = HIDE_OVERLAYS;
  document.head.append(style);
  window.addEventListener("keydown", enterKeyboardMode, true);
  window.addEventListener("pointermove", enterMouseMode, { capture: true, passive: true });
  window.addEventListener("wheel", enterMouseMode, { capture: true, passive: true });

  return () => {
    window.removeEventListener("keydown", enterKeyboardMode, true);
    window.removeEventListener("pointermove", enterMouseMode, true);
    window.removeEventListener("wheel", enterMouseMode, true);
    document.documentElement.removeAttribute(KEYBOARD_MODE);
    showOverlays();
    style.remove();
    removeSeparators();
  };
}

function enterKeyboardMode(event: KeyboardEvent) {
  if (!event.isTrusted) return;
  document.documentElement.setAttribute(KEYBOARD_MODE, "");
  if (!scrollChatByPage(event)) removeSeparators();
}

function enterMouseMode(event: PointerEvent | WheelEvent) {
  if (event.type === "pointermove" && event.movementX === 0 && event.movementY === 0) return;
  document.documentElement.removeAttribute(KEYBOARD_MODE);
  showOverlays();
  if (event.type === "wheel") removeSeparators();
}

function scrollChatByPage(event: KeyboardEvent): boolean {
  if (event.key !== "PageUp" && event.key !== "PageDown") return false;
  if (event.isComposing) return false;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (event.target instanceof Element && event.target.closest(OWN_PAGING_KEYS)) return false;

  const visibleChats = [...document.querySelectorAll<HTMLElement>(CHAT_SCROLLER)].filter((chat) => chat.getClientRects().length > 0);
  const chat = nearestTo(visibleChats, document.activeElement);
  if (!chat) return false;

  event.preventDefault();
  const up = event.key === "PageUp";
  // INFO: fc 25oct26 Paseo snaps the chat back to the bottom unless its own PageUp listener sees the key first
  if (up) chat.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp" }));
  const scrollTopBefore = chat.scrollTop;
  chat.scrollBy({ top: (up ? -1 : 1) * pageStep(chat.clientHeight) });
  hideOverlays(chat);

  removeSeparators();
  const { clientHeight: viewportHeight, scrollTop, scrollHeight } = chat;
  const offsets = separatorOffsets({ viewportHeight, scrollTop, scrollHeight, scrolled: scrollTop - scrollTopBefore, up });
  showSeparators(chat, offsets);
  return true;
}

// INFO: fc 15nov26 Paseo draws its overlays after the chat in the DOM, so only later siblings that cover it are hidden, never backgrounds drawn before it
function hideOverlays(chat: HTMLElement) {
  const chatBox = chat.getBoundingClientRect();
  for (let node: Element = chat; node.parentElement && node.parentElement !== document.body; node = node.parentElement) {
    for (let sibling = node.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
      if (sibling.hasAttribute(SEPARATOR) || sibling.contains(document.activeElement)) continue;
      if (covers(sibling.getBoundingClientRect(), chatBox)) sibling.setAttribute(HIDDEN_OVERLAY, "");
    }
  }
}

function showOverlays() {
  for (const overlay of document.querySelectorAll(`[${HIDDEN_OVERLAY}]`)) overlay.removeAttribute(HIDDEN_OVERLAY);
}

function showSeparators(chat: HTMLElement, offsets: number[]) {
  const viewport = chat.parentElement;
  if (!viewport) return;
  const chatRect = chat.getBoundingClientRect();
  const lines = offsets.flatMap((offset) => {
    const separator = drawSeparator(chat, chatRect.left + chat.clientWidth / 2, chatRect.top + offset);
    if (separator) viewport.append(separator.line);
    return separator ? [separator] : [];
  });
  separators = { chat, lines, frame: 0 };
  followAnchors();
}

function drawSeparator(chat: HTMLElement, x: number, edgeY: number): Separator | undefined {
  const y = betweenTextLines(x, edgeY);
  const anchor = document.elementsFromPoint(x, y).find((element) => element !== chat && chat.contains(element)) ?? chat.firstElementChild;
  if (!anchor) return;

  const line = document.createElement("div");
  line.setAttribute("aria-hidden", "true");
  line.setAttribute(SEPARATOR, "");
  Object.assign(line.style, {
    position: "absolute",
    left: `${SEPARATOR_INSET}px`,
    width: `${chat.clientWidth - 2 * SEPARATOR_INSET}px`,
    borderTop: "1px dashed",
    color: getComputedStyle(anchor).color,
    opacity: "0.5",
    pointerEvents: "none",
  });
  return { anchor, offset: y - anchor.getBoundingClientRect().top, line };
}

function betweenTextLines(x: number, y: number): number {
  const textLine = document.caretPositionFromPoint(x, y)?.getClientRect();
  if (!textLine || y < textLine.top || y > textLine.bottom) return y;
  return y - textLine.top < textLine.bottom - y ? textLine.top - 1 : textLine.bottom + 1;
}

function followAnchors() {
  if (!separators) return;
  const { chat, lines } = separators;
  if (!chat.isConnected) return removeSeparators();
  if (document.documentElement.hasAttribute(KEYBOARD_MODE)) hideOverlays(chat);

  const chatTop = chat.getBoundingClientRect().top;
  for (const { anchor, offset, line } of lines) {
    const top = anchor.getBoundingClientRect().top + offset - chatTop;
    line.style.display = !anchor.isConnected || top < 0 || top > chat.clientHeight ? "none" : "";
    line.style.top = `${top}px`;
  }
  separators.frame = requestAnimationFrame(followAnchors);
}

function removeSeparators() {
  if (!separators) return;
  cancelAnimationFrame(separators.frame);
  for (const { line } of separators.lines) line.remove();
  separators = null;
}
