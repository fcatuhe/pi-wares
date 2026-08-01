// INFO: fc 01aug26 main executable of Herdr.app. Ghostty takes the command to
// run from argv only, and a Finder launch passes none, so this seeds the flags
// and re-execs the ghostty symlink beside it. Compiled rather than a script:
// launchd refuses an interpreted main executable under the hardened runtime.
#include <limits.h>
#include <mach-o/dyld.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

// INFO: fc 01aug26 build.sh bakes these in with -D so one source builds many
// apps: a plain Herdr, a --session one, a --remote one
#ifndef APP_TITLE
#define APP_TITLE "Herdr"
#endif
#ifndef HERDR_ARGS
#define HERDR_ARGS ""
#endif

int main(void) {
  // INFO: fc 01aug26 open(1) forwards the caller's environment, and herdr
  // refuses to run nested inside one of its own panes
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

  // INFO: fc 01aug26 the login shell restores the PATH launchd withholds from a
  // Finder launch, the OSC 0 replaces the ghost emoji Ghostty titles a window
  // with until herdr sends its own title
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
