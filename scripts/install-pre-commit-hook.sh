#!/bin/bash
# Pre-commit hook installer for docs verification
# Run: bash scripts/install-pre-commit-hook.sh

HOOK_FILE=".git/hooks/pre-commit"

mkdir -p "$(dirname "$HOOK_FILE")"

cat > "$HOOK_FILE" << 'EOF'
#!/bin/bash
# Pre-commit hook: verify docs integrity

STAGED_DESIGN=$(git diff --cached --name-only | grep -E "^docs/design/|^README\.md|^scripts/verify-docs\.py" || true)

if [ -n "$STAGED_DESIGN" ]; then
    echo "[pre-commit] Design docs changed. Running verify-docs.py..."
    if ! python3 scripts/verify-docs.py; then
        echo "[pre-commit] FAILED: docs verification failed."
        echo "[pre-commit] Fix the issues above before committing."
        exit 1
    fi
    echo "[pre-commit] Docs verification passed."
fi

exit 0
EOF

chmod +x "$HOOK_FILE"
echo "Pre-commit hook installed at $HOOK_FILE"
echo "It will run verify-docs.py when docs/design/, README.md, or verify-docs.py are staged."
