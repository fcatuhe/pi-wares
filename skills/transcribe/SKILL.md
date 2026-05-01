---
name: transcribe
description: Speech-to-text transcription using local whisper.cpp. Supports flac, mp3, ogg, wav. No API key required.
---

# Transcribe

Local speech-to-text using whisper.cpp. No API key or network required. Automatically detects language.

## Requirements

- `whisper-cpp` package installed

## Setup

Download a model before first use:
```bash
{baseDir}/transcribe.sh --download small
```

## Usage

```bash
{baseDir}/transcribe.sh <audio-file>             # Default (small model)
{baseDir}/transcribe.sh <audio-file> -m medium   # Better quality, slower
```

### Options

- `-m <model>` — Model to use (default: `small`). Available: `small`, `medium`, `large-v3-turbo`

Models are downloaded on first use to `~/.local/share/whisper-models/`.

To pre-download a model:
```bash
{baseDir}/transcribe.sh --download <model>
```

## Supported Formats

- flac, mp3, ogg, wav

## Output

Returns plain text transcription to stdout.
