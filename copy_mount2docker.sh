#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/dockerspace/project.conf"

SOURCE_FILE="$SCRIPT_DIR/mountspace/$INPUT_FILE"
DEST_DIR="$SCRIPT_DIR/mountspace/1_input_files"

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
