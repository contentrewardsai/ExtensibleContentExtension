#!/bin/bash
# Download Xenova/LaMini-Flan-T5-783M to models/ for local use.
# Run from project root: ./scripts/download-lamini-model.sh
# The extension also downloads these files into your project folder after you set it in the side panel.
# Uses quantized encoder+decoder (~820MB total).

set -e
BASE="https://huggingface.co/Xenova/LaMini-Flan-T5-783M/resolve/main"
OUT="models/Xenova/LaMini-Flan-T5-783M"

echo "Downloading Xenova/LaMini-Flan-T5-783M (quantized, ~820MB)"
echo "Output: $OUT"
echo ""

mkdir -p "$OUT"
mkdir -p "$OUT/onnx"

download() {
  local f="$1"
  local dest="$OUT/$f"
  if [ -f "$dest" ]; then
    local size; size=$(wc -c < "$dest" 2>/dev/null || echo 0)
    if [ "$size" -gt 10000 ]; then
      echo "  skip $f (exists)"
      return
    fi
  fi
  echo "  fetch $f..."
  curl -L -f -o "$dest" -C - "$BASE/$f" || curl -L -f -o "$dest" "$BASE/$f"
}

download "config.json"
download "tokenizer.json"
download "tokenizer_config.json"
download "special_tokens_map.json"
download "spiece.model"
download "generation_config.json"
download "quantize_config.json"
download "onnx/encoder_model_quantized.onnx"
download "onnx/decoder_model_quantized.onnx"

echo ""
echo "Done. Model files in $OUT"
echo "Reload the extension and use the Local AI Chat."
