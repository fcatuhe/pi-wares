#!/bin/bash
set -e

MODEL_DIR="$HOME/.local/share/whisper-models"
BASE_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main"
MODEL_NAME="small"

download_model() {
  mkdir -p "$MODEL_DIR"
  echo "Downloading model $1..." >&2
  curl -L --progress-bar -o "$MODEL_DIR/ggml-${1}.bin" "$BASE_URL/ggml-${1}.bin"
}

# Handle --download
if [ "$1" = "--download" ]; then
  download_model "${2:?Usage: transcribe.sh --download <model>}"
  exit 0
fi

# Parse arguments
while [ $# -gt 0 ]; do
  case "$1" in
    -m) MODEL_NAME="$2"; shift 2 ;;
    *) AUDIO_FILE="$1"; shift ;;
  esac
done

[ -z "$AUDIO_FILE" ] && { echo "Usage: transcribe.sh <audio-file> [-m model]" >&2; exit 1; }
[ ! -f "$AUDIO_FILE" ] && { echo "Error: File not found: $AUDIO_FILE" >&2; exit 1; }

MODEL_PATH="$MODEL_DIR/ggml-${MODEL_NAME}.bin"
if [ ! -f "$MODEL_PATH" ]; then
  echo "Error: Model '$MODEL_NAME' not found. Download it first:" >&2
  echo "  $0 --download $MODEL_NAME" >&2
  exit 1
fi

whisper-cli -m "$MODEL_PATH" -l auto -np -f "$AUDIO_FILE"
