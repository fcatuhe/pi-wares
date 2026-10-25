import { Platform } from "react-native";
import { nearestTo, pageStep, type TreeNode } from "./page-scroll";

interface Element extends TreeNode {
  closest(selector: string): Element | null;
}

interface ChatScroller extends Element {
  clientHeight: number;
  getClientRects(): { length: number };
  scrollBy(options: { top: number }): void;
  dispatchEvent(event: unknown): boolean;
}

interface PageKeyEvent {
  key: string;
  isTrusted: boolean;
  isComposing: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target: Partial<Element> | null;
  preventDefault(): void;
}

type KeyListener = (event: PageKeyEvent) => void;

declare const window: {
  addEventListener(type: "keydown", listener: KeyListener, capture: boolean): void;
  removeEventListener(type: "keydown", listener: KeyListener, capture: boolean): void;
};
declare const document: {
  activeElement: Element | null;
  querySelectorAll(selector: string): Iterable<ChatScroller>;
};
declare const KeyboardEvent: new (type: string, init: { key: string }) => unknown;

const CHAT_SCROLLER = '[data-testid="agent-chat-scroll"]';
const OWN_PAGING_KEYS = ".xterm, .cm-editor";

export function listenForPageKeys(): () => void {
  if (Platform.OS !== "web") return () => {};

  window.addEventListener("keydown", scrollChatByPage, true);
  return () => window.removeEventListener("keydown", scrollChatByPage, true);
}

function scrollChatByPage(event: PageKeyEvent) {
  if (event.key !== "PageUp" && event.key !== "PageDown") return;
  if (!event.isTrusted || event.isComposing) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.target?.closest?.(OWN_PAGING_KEYS)) return;

  const visibleChats = [...document.querySelectorAll(CHAT_SCROLLER)].filter((chat) => chat.getClientRects().length > 0);
  const chat = nearestTo(visibleChats, document.activeElement);
  if (!chat) return;

  event.preventDefault();
  const up = event.key === "PageUp";
  // INFO: fc 25oct26 Paseo snaps the chat back to the bottom unless its own PageUp listener sees the key first
  if (up) chat.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp" }));
  chat.scrollBy({ top: (up ? -1 : 1) * pageStep(chat.clientHeight) });
}
