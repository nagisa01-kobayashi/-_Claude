#!/bin/bash
# SessionStart hook: install the packages needed to work with Office files
# (.pptx/.docx/.xlsx) and PDFs in this workspace — in particular, to be able
# to render slides/documents to images for visual QA before sharing them.
#
# Background: the base image ships only `libreoffice-core`, which can start
# LibreOffice but cannot actually load a .pptx/.docx (the document-type
# filter libraries such as libsdlo.so live in `libreoffice-impress` etc.,
# which are separate packages). Without them, `soffice --convert-to pdf`
# fails with "source file could not be loaded" even for trivial files.
set -euo pipefail

# This workspace has no package.json/requirements.txt of its own — the only
# recurring need is Office/PDF tooling for the pptx/docx/xlsx/pdf skills.
# Only bother in Claude Code on the web; local sessions manage their own env.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update -qq

# libreoffice-impress/writer/calc: the document-type filters actually needed
# to load .pptx/.docx/.xlsx (libreoffice-core alone cannot).
# poppler-utils: pdftoppm/pdftotext, used to rasterize PDFs for visual QA
# and to read PDF files page-by-page.
apt-get install -y -qq \
  libreoffice-impress \
  libreoffice-writer \
  libreoffice-calc \
  poppler-utils

# Python packages the pptx/docx/xlsx skill scripts rely on
# (schema validation, thumbnailing, content dumps, safe XML parsing).
pip install -q --no-input \
  defusedxml \
  lxml \
  Pillow \
  "markitdown[pptx]"
