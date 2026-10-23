#!/usr/bin/env bash
set -euo pipefail

# The Azure Ubuntu mirror can spend the entire job budget downloading WebKit
# dependencies. Use Ubuntu's archive while retaining apt's signature checks.
if [[ "${RUNNER_OS:-}" == "Linux" ]]; then
  # Hosted images also use mirror+file URIs. Updating only .sources leaves
  # that indirection free to select Azure again.
  if [[ -f /etc/apt/apt-mirrors.txt ]]; then
    printf '%s\n' 'https://archive.ubuntu.com/ubuntu/' |
      sudo tee /etc/apt/apt-mirrors.txt >/dev/null
  fi
  for sources in /etc/apt/sources.list /etc/apt/sources.list.d/*.list /etc/apt/sources.list.d/*.sources; do
    if [[ -f "$sources" ]]; then
      sudo sed -i \
        's|http://azure.archive.ubuntu.com/ubuntu|https://archive.ubuntu.com/ubuntu|g; s|https://azure.archive.ubuntu.com/ubuntu|https://archive.ubuntu.com/ubuntu|g' \
        "$sources"
    fi
  done
fi

npx playwright install --with-deps "$@"
