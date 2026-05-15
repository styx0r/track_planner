#!/bin/bash
set -e

echo "==> [post-start] Setting up Claude Code auth..."
echo "    HOME=$HOME"
echo "    USER=$(id -un)"

if [ -z "$_ANTHROPIC_API_KEY" ]; then
  echo "    !! _ANTHROPIC_API_KEY is empty in container."
  echo "    !! On host: export ANTHROPIC_API_KEY=... before launching VS Code, then rebuild/restart container."
  exit 0
fi

echo "    _ANTHROPIC_API_KEY is set (length=${#_ANTHROPIC_API_KEY})."

mkdir -p "$HOME/.claude"

# Claude Code calls this helper instead of reading the env var directly.
cat > "$HOME/.claude/anthropic_key_helper.sh" <<'SCRIPT'
#!/bin/sh
echo "${_ANTHROPIC_API_KEY}"
SCRIPT
chmod +x "$HOME/.claude/anthropic_key_helper.sh"

cat > "$HOME/.claude/settings.json" <<EOF
{
  "apiKeyHelper": "$HOME/.claude/anthropic_key_helper.sh",
  "model": "claude-sonnet-4-6"
}
EOF

# Pre-approve the key and skip onboarding (uses last 20 chars of key).
LAST20=$(echo -n "$_ANTHROPIC_API_KEY" | tail -c 20)
cat > "$HOME/.claude.json" <<EOF
{
  "customApiKeyResponses": {
    "approved": ["${LAST20}"],
    "rejected": []
  },
  "hasCompletedOnboarding": true,
  "shiftEnterKeyBindingInstalled": true
}
EOF

echo "==> [post-start] Claude Code configured at $HOME/.claude/. DONE."
