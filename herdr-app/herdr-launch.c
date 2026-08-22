// INFO: fc 01aug26 main executable of Herdr.app: seeds the flags Ghostty only takes from argv, then re-execs the symlink beside it
#include <limits.h>
#include <mach-o/dyld.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

// INFO: fc 01aug26 build.sh bakes these in with -D, so one source builds every variant app
#ifndef APP_TITLE
#define APP_TITLE "Herdr"
#endif
#ifndef HERDR_ARGS
#define HERDR_ARGS ""
#endif

int main(void) {
  // INFO: fc 01aug26 open(1) forwards the caller's environment, and herdr refuses to run nested in its own pane
  const char *nested[] = {"HERDR_ENV", "HERDR_TAB_ID", "HERDR_SOCKET_PATH",
                          "HERDR_WORKSPACE_ID", "HERDR_PANE_ID"};
  for (size_t i = 0; i < sizeof(nested) / sizeof(*nested); i++) unsetenv(nested[i]);

  char ghostty[PATH_MAX];
  uint32_t size = sizeof(ghostty);
  if (_NSGetExecutablePath(ghostty, &size) != 0) return 1;
  char *name = strrchr(ghostty, '/');
  if (name == NULL) return 1;
  strcpy(name + 1, "ghostty");

  const char *home = getenv("HOME");
  if (home == NULL) return 1;

  // INFO: fc 01aug26 the login shell restores the PATH launchd withholds, and OSC 0 replaces Ghostty's ghost emoji
  char command[PATH_MAX];
  if (snprintf(command, sizeof(command),
               "--command=/bin/zsh -lc 'printf \"\\033]0;%s\\a\"; exec %s/.local/bin/herdr%s'",
               APP_TITLE, home, HERDR_ARGS) >= (int)sizeof(command))
    return 1;

  char *const args[] = {ghostty,
                        "--window-save-state=never",
                        "--quit-after-last-window-closed=true",
                        "--auto-update=off",
                        command,
                        NULL};
  execv(ghostty, args);
  return 1;
}
