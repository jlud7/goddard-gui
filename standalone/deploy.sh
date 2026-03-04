#!/bin/bash
# Deploy Goddard Dashboard to OpenClaw static dir
# Run after OpenClaw updates to restore the custom dashboard
DEST_DIR="/opt/homebrew/lib/node_modules/openclaw/dist/control-ui"
cp ~/clawd/dashboard/index.html "$DEST_DIR/goddard.html"
cp ~/clawd/dashboard/goddard.js "$DEST_DIR/assets/goddard.js"
echo "✅ Dashboard deployed to $DEST_DIR"
echo "   Access: http://127.0.0.1:18789/ui/goddard.html"
