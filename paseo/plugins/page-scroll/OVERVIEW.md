Page Up and Page Down scroll the agent chat in the desktop and web app, even while the message box has focus. With split panes, the keys scroll the chat in the pane that holds the focus.

The keys keep their own meaning in terminals and code editors, and with Shift, Ctrl, Alt or Cmd held. In the message box, they no longer move the cursor. The plugin does nothing on iOS and Android.

The plugin finds the chat through Paseo's `agent-chat-scroll` test ID, which is not a public plugin API, so a Paseo update can break it.
