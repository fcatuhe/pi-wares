Page Up and Page Down scroll the agent chat in the desktop and web app, even while the message box has focus. With split panes, the keys scroll the chat in the pane that holds the focus.

Each page shares about two lines with the one before. After a page key, a dashed line near the top and one near the bottom sit in the middle of those shared lines: they show where Page Up and Page Down would bring you, and the one you came from marks where the last page ended. When a page stops short at the start or end of the chat, the edge you left keeps its own line. The lines scroll with the chat until another key or the mouse wheel. While you use the keyboard, the round jump-to-bottom button stays hidden. It comes back when you move the mouse.

The keys keep their own meaning in terminals and code editors, and with Shift, Ctrl, Alt or Cmd held. In the message box, they no longer move the cursor. The plugin does nothing on iOS and Android.

The plugin finds the chat and the jump-to-bottom button through Paseo's `agent-chat-scroll` and `scroll-to-bottom-button` test IDs, which are not a public plugin API, so a Paseo update can break it.
