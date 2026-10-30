Shows your account quotas in the sidebar footer, like Paseo's own Usage row, and adds a pace marker taken from CodexBar. Each bar gets a thin tick at the share of the window that has elapsed. A green tick ahead of the fill means you are using less than an even pace. A red tick inside the fill means you are using more. The percent turns red when, at the current rate, the limit runs out before it resets.

Press the row for a card per account. Each window shows the share used, when it resets, and a pace line such as `Pace: 6% in reserve · Lasts until reset` or `Pace: 9% in deficit · Runs out in 1h 20m`. The card also lists balances and details, and has a Refresh button that bypasses the five-minute cache.

The plugin reads the same reports as Paseo's Usage, through `paseo usage --json` on the daemon host, so it needs no login of its own. The row shows the windows each source marks as its summary, not the windows you pinned in Paseo's Usage. Pace needs the window's length, which the plugin reads from the window ID: five-hour, daily, weekly, monthly and windows that state their length in seconds. Other windows show no pace. Pace stays hidden in the first 3% of a window, and is on pace within 2 points.

Hide Paseo's own Usage row in Settings, Sidebar, so the footer shows one usage line.
