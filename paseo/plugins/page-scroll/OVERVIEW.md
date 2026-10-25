Page Up and Page Down scroll the agent chat in the desktop and web app, even while the message box has focus. With split panes, the keys scroll the chat in the pane that holds the focus.

Each page shares about two lines with the one before. A dashed line in the middle of those shared lines marks where the last page ended, and it scrolls with the chat until the next page key or mouse wheel. While you use the keyboard, the round jump-to-bottom button stays hidden. It comes back when you move the mouse.

The keys keep their own meaning in terminals and code editors, and with Shift, Ctrl, Alt or Cmd held. In the message box, they no longer move the cursor. The plugin does nothing on iOS and Android.

The plugin finds the chat and the jump-to-bottom button through Paseo's `agent-chat-scroll` and `scroll-to-bottom-button` test IDs, which are not a public plugin API, so a Paseo update can break it.
