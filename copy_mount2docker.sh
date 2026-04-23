#!/bin/bash

set -euo pipefail

SOURCE_FILE="/myworkspace/mountspace/bahir_bole_habib.mp4"
DEST_DIR="/myworkspace/mountspace/1_input_files"

if [ ! -f "$SOURCE_FILE" ]; then
  echo "Source file does not exist: $SOURCE_FILE"
  exit 1
fi

mkdir -p "$DEST_DIR"

echo "Moving file from $SOURCE_FILE to $DEST_DIR ..."
mv "$SOURCE_FILE" "$DEST_DIR/"

echo "Done."
echo "Moved file:"
echo "  Source file: $SOURCE_FILE"
echo "  Destination: $DEST_DIR"
