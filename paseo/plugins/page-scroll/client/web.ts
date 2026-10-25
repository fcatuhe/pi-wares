import { Platform } from "react-native";
import { nearestTo, pageStep, separatorOffset } from "./page-scroll";

const CHAT_SCROLLER = '[data-testid="agent-chat-scroll"]';
const OWN_PAGING_KEYS = ".xterm, .cm-editor";
const KEYBOARD_MODE = "data-page-scroll-keyboard";
const HIDE_JUMP_TO_BOTTOM = `html[${KEYBOARD_MODE}] [data-testid="scroll-to-bottom-button"] { display: none; }`;
const SEPARATOR_INSET = 16;

interface Separator {
  chat: HTMLElement;
  anchor: Element;
  offset: number;
  line: HTMLElement;
  frame: number;
}

let separator: Separator | null = null;

export function listenForPageKeys(): () => void {
  if (Platform.OS !== "web") return () => {};

  const style = document.createElement("style");
  style.textContent = HIDE_JUMP_TO_BOTTOM;
  document.head.append(style);
  window.addEventListener("keydown", enterKeyboardMode, true);
  window.addEventListener("pointermove", enterMouseMode, { capture: true, passive: true });
  window.addEventListener("wheel", enterMouseMode, { capture: true, passive: true });

  return () => {
    window.removeEventListener("keydown", enterKeyboardMode, true);
    window.removeEventListener("pointermove", enterMouseMode, true);
    window.removeEventListener("wheel", enterMouseMode, true);
    document.documentElement.removeAttribute(KEYBOARD_MODE);
    style.remove();
    removeSeparator();
  };
}

function enterKeyboardMode(event: KeyboardEvent) {
  if (!event.isTrusted) return;
  document.documentElement.setAttribute(KEYBOARD_MODE, "");
  scrollChatByPage(event);
}

function enterMouseMode(event: PointerEvent | WheelEvent) {
  if (event.type === "pointermove" && event.movementX === 0 && event.movementY === 0) return;
  document.documentElement.removeAttribute(KEYBOARD_MODE);
  if (event.type === "wheel") removeSeparator();
}

function scrollChatByPage(event: KeyboardEvent) {
  if (event.key !== "PageUp" && event.key !== "PageDown") return;
  if (event.isComposing) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.target instanceof Element && event.target.closest(OWN_PAGING_KEYS)) return;

  const visibleChats = [...document.querySelectorAll<HTMLElement>(CHAT_SCROLLER)].filter((chat) => chat.getClientRects().length > 0);
  const chat = nearestTo(visibleChats, document.activeElement);
  if (!chat) return;

  event.preventDefault();
  const up = event.key === "PageUp";
  // INFO: fc 25oct26 Paseo snaps the chat back to the bottom unless its own PageUp listener sees the key first
  if (up) chat.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp" }));
  const scrollTopBefore = chat.scrollTop;
  chat.scrollBy({ top: (up ? -1 : 1) * pageStep(chat.clientHeight) });
  const scrolled = chat.scrollTop - scrollTopBefore;

  removeSeparator();
  if (scrolled === 0) return;
  const lastPageEdge = chat.getBoundingClientRect().top + separatorOffset(chat.clientHeight, up) - scrolled;
  showSeparator(chat, lastPageEdge);
}

function showSeparator(chat: HTMLElement, edgeY: number) {
  const viewport = chat.parentElement;
  const centerX = chat.getBoundingClientRect().left + chat.clientWidth / 2;
  const clientY = betweenTextLines(centerX, edgeY);
  const anchor =
    document.elementsFromPoint(centerX, clientY).find((element) => element !== chat && chat.contains(element)) ?? chat.firstElementChild;
  if (!viewport || !anchor) return;

  const line = document.createElement("div");
  line.setAttribute("aria-hidden", "true");
  Object.assign(line.style, {
    position: "absolute",
    left: `${SEPARATOR_INSET}px`,
    width: `${chat.clientWidth - 2 * SEPARATOR_INSET}px`,
    borderTop: "1px dashed",
    color: getComputedStyle(anchor).color,
    opacity: "0.5",
    pointerEvents: "none",
  });
  viewport.append(line);
  separator = { chat, anchor, offset: clientY - anchor.getBoundingClientRect().top, line, frame: 0 };
  followAnchor();
}

function betweenTextLines(x: number, y: number): number {
  const textLine = document.caretPositionFromPoint(x, y)?.getClientRect();
  if (!textLine || y < textLine.top || y > textLine.bottom) return y;
  return y - textLine.top < textLine.bottom - y ? textLine.top - 1 : textLine.bottom + 1;
}

function followAnchor() {
  if (!separator) return;
  const { chat, anchor, offset, line } = separator;
  if (!chat.isConnected || !anchor.isConnected) return removeSeparator();

  const chatTop = chat.getBoundingClientRect().top;
  const top = anchor.getBoundingClientRect().top + offset - chatTop;
  line.style.display = top < 0 || top > chat.clientHeight ? "none" : "";
  line.style.top = `${top}px`;
  separator.frame = requestAnimationFrame(followAnchor);
}

function removeSeparator() {
  if (!separator) return;
  cancelAnimationFrame(separator.frame);
  separator.line.remove();
  separator = null;
}
