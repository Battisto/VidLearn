"""
text_processor.py
~~~~~~~~~~~~~~~~~
Pure-function text processing utilities for cleaning and chunking transcripts.

No external ML libraries required — uses Python stdlib + `regex` for speed.

Pipeline:
  1. unicode_normalize()   → NFC normalization, fix encoding artifacts
  2. remove_noise()        → strip Whisper artifacts, timestamps, filler words
  3. clean_punctuation()   → fix spacing around punctuation, normalize quotes
  4. fix_sentences()       → ensure proper sentence-ending punctuation
  5. normalize_whitespace()→ collapse runs of spaces/newlines
  6. chunk_text()          → split into BART-safe chunks with overlap
"""

import re
import unicodedata
from typing import List, Tuple


# ─── Whisper noise patterns ────────────────────────────────────────────────────
# Patterns produced by Whisper that pollute the transcript

_WHISPER_NOISE = [
    # Hallucinated music / background noise tags
    r"\[.*?MUSIC.*?\]",
    r"\[.*?APPLAUSE.*?\]",
    r"\[.*?LAUGHTER.*?\]",
    r"\[.*?NOISE.*?\]",
    r"\[.*?BLANK_AUDIO.*?\]",
    r"\(.*?music.*?\)",
    r"\(.*?applause.*?\)",
    # Whisper repeated "Thank you" hallucination at end of audio
    r"(?:Thank you\.?\s*){3,}",
    # [inaudible], [crosstalk], etc.
    r"\[inaudible\]",
    r"\[crosstalk\]",
    r"\[silence\]",
    r"\[unclear\]",
    # SRT/VTT timestamp lines:  00:01:23,456 --> 00:01:25,789
    r"\d{2}:\d{2}:\d{2}[,\.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,\.]\d{3}",
    # Plain timestamp markers: (00:23) or [1:45]
    r"[\(\[]\d{1,2}:\d{2}(?::\d{2})?[\)\]]",
    # Subtitle index numbers on their own line
    r"^\d+\s*$",
    # HTML/XML tags that occasionally appear
    r"<[^>]+>",
    # Repeated dots/dashes used as filler
    r"[-_]{3,}",
    r"\.{4,}",
]

_NOISE_RE = re.compile(
    "|".join(_WHISPER_NOISE),
    flags=re.IGNORECASE | re.MULTILINE,
)

# Filler words commonly produced by Whisper or present in speech
_FILLER_WORDS = re.compile(
    r"\b(um+|uh+|er+|ah+|hmm+|hm+|mhm|uh-huh|you know|like,|so,|well,)\b",
    flags=re.IGNORECASE,
)

# Repetitions: same word/phrase repeated 3+ times in a row
_REPETITION = re.compile(r"\b(\w+)(\s+\1){3,}\b", flags=re.IGNORECASE)


# ─── Core cleaning functions ───────────────────────────────────────────────────

def unicode_normalize(text: str) -> str:
    """
    NFC Unicode normalization + remove zero-width and control characters.
    Fixes common encoding artifacts from Whisper output.
    """
    # NFC: compose canonical equivalents
    text = unicodedata.normalize("NFC", text)
    # Remove zero-width chars, BOM, soft hyphen, etc.
    text = re.sub(r"[\u200b\u200c\u200d\ufeff\u00ad]", "", text)
    # Remove other control characters except tab/newline
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
    return text


def remove_noise(text: str) -> Tuple[str, int]:
    """
    Remove Whisper artifacts, timestamps, tags, filler words, and repetitions.
    Returns (cleaned_text, noise_count).
    """
    original_len = len(text)
    # Count noise matches before removal
    noise_count = len(_NOISE_RE.findall(text))
    text = _NOISE_RE.sub(" ", text)

    # Remove filler words
    filler_count = len(_FILLER_WORDS.findall(text))
    noise_count += filler_count
    text = _FILLER_WORDS.sub("", text)

    # Collapse repetitions: "hello hello hello hello" → "hello"
    text = _REPETITION.sub(r"\1", text)

    return text, noise_count


def clean_punctuation(text: str) -> str:
    """
    Normalise punctuation:
    - Curly quotes → straight quotes
    - Em/en dashes → regular hyphen
    - Multiple punctuation → single
    - Space before punctuation → remove
    - Ensure space after punctuation
    """
    # Smart quotes
    text = text.replace("\u2018", "'").replace("\u2019", "'")
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    # Em/en dashes
    text = text.replace("\u2013", "-").replace("\u2014", " - ")
    # Ellipsis character
    text = text.replace("\u2026", "...")
    # Multiple punctuation (except ...) → single
    text = re.sub(r"([!?]){2,}", r"\1", text)
    text = re.sub(r",{2,}", ",", text)
    # Remove space before punctuation
    text = re.sub(r"\s+([,;:!?.])", r"\1", text)
    # Ensure single space after punctuation (if followed by a letter)
    text = re.sub(r"([,;:!?.])([A-Za-z])", r"\1 \2", text)
    # Remove stray commas at start of sentences
    text = re.sub(r"(?<=\.\s),\s*", "", text)
    return text


def fix_sentences(text: str) -> str:
    """
    Ensure each sentence:
    - Ends with a proper punctuation mark
    - Starts with a capital letter
    """
    # Add period at end if last char is a letter
    text = text.strip()
    if text and text[-1].isalpha():
        text += "."

    # Capitalise first word of each sentence (after . ! ?)
    def _cap(m):
        return m.group(0)[0] + m.group(0)[1].upper() + m.group(0)[2:]

    text = re.sub(r"([.!?]\s+)([a-z])", _cap, text)
    # Capitalise very first character
    if text:
        text = text[0].upper() + text[1:]

    return text


def normalize_whitespace(text: str) -> str:
    """Collapse multiple spaces/newlines to single space."""
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" \n", "\n", text)
    return text.strip()


def full_clean(text: str) -> Tuple[str, int]:
    """
    Run the full cleaning pipeline.
    Returns (cleaned_text, noise_removed_count).
    """
    text = unicode_normalize(text)
    text, noise_count = remove_noise(text)
    text = clean_punctuation(text)
    text = fix_sentences(text)
    text = normalize_whitespace(text)
    return text, noise_count


# ─── Token estimation ──────────────────────────────────────────────────────────

def estimate_tokens(text: str) -> int:
    """
    Fast approximation: 1 token ≈ 0.75 words (standard rule of thumb).
    Avoids importing a tokeniser at this stage.
    """
    word_count = len(text.split())
    return int(word_count / 0.75)


# ─── Chunking ─────────────────────────────────────────────────────────────────

def chunk_text(
    text: str,
    max_tokens: int = 800,
    overlap_tokens: int = 100,
) -> List[dict]:
    """
    Split text into overlapping chunks of at most `max_tokens` tokens.

    Strategy:
      - Split on sentence boundaries (. ! ?) to avoid cutting mid-sentence
      - Each chunk ≤ max_tokens estimated tokens
      - Consecutive chunks share `overlap_tokens` worth of context

    Returns a list of TextChunk-compatible dicts.

    Why 800 tokens (not 1024)?
      BART-large-cnn has a 1024-token limit. Leaving 224 tokens of headroom
      accommodates the model's special tokens + any prompt prefix used in Phase 6.
    """
    # Split into sentences
    sentences = re.split(r"(?<=[.!?])\s+", text)
    sentences = [s.strip() for s in sentences if s.strip()]

    chunks: List[dict] = []
    current_sentences: List[str] = []
    current_tokens = 0
    word_offset = 0
    chunk_index = 0

    # Pre-compute sentence token counts
    def sent_tokens(s: str) -> int:
        return max(1, estimate_tokens(s))

    i = 0
    while i < len(sentences):
        sent = sentences[i]
        t = sent_tokens(sent)

        if current_tokens + t <= max_tokens:
            current_sentences.append(sent)
            current_tokens += t
            i += 1
        else:
            # Flush current chunk
            if current_sentences:
                chunk_text_str = " ".join(current_sentences)
                words = chunk_text_str.split()
                chunks.append({
                    "index":      chunk_index,
                    "text":       chunk_text_str,
                    "word_count": len(words),
                    "char_count": len(chunk_text_str),
                    "start_word": word_offset,
                    "end_word":   word_offset + len(words),
                })
                word_offset += len(words)
                chunk_index += 1

                # Overlap: backtrack by `overlap_tokens` worth of sentences
                overlap_budget = overlap_tokens
                overlap_sents: List[str] = []
                for prev_sent in reversed(current_sentences):
                    pt = sent_tokens(prev_sent)
                    if overlap_budget - pt >= 0:
                        overlap_sents.insert(0, prev_sent)
                        overlap_budget -= pt
                    else:
                        break

                current_sentences = overlap_sents
                current_tokens = sum(sent_tokens(s) for s in current_sentences)
            else:
                # Single sentence exceeds max — add it as its own chunk
                words = sent.split()
                chunks.append({
                    "index":      chunk_index,
                    "text":       sent,
                    "word_count": len(words),
                    "char_count": len(sent),
                    "start_word": word_offset,
                    "end_word":   word_offset + len(words),
                })
                word_offset += len(words)
                chunk_index += 1
                i += 1

    # Flush remaining sentences
    if current_sentences:
        chunk_text_str = " ".join(current_sentences)
        words = chunk_text_str.split()
        chunks.append({
            "index":      chunk_index,
            "text":       chunk_text_str,
            "word_count": len(words),
            "char_count": len(chunk_text_str),
            "start_word": word_offset,
            "end_word":   word_offset + len(words),
        })

    return chunks
