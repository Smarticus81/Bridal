"""Record the Aislework scripts through Google's Gemini speech API into a working directory."""

import argparse
import base64
import io
import json
import os
import sys
import urllib.error
import urllib.request
import wave
from pathlib import Path

MODEL = "gemini-3.8-flash-tts"
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions"
GUIDES = json.loads(Path(__file__).with_name("guides.json").read_text())
STYLE = {
    "shop-walkthrough": (
        "An experienced boutique owner guides another stylist through a live screen demo. "
        "Conversational American English, clear and matter-of-fact, with the energy of showing a colleague "
        "something that saves time. Give button names space. Faye sounds like Fay, Vale like veil, Maya like MY-uh."
    ),
    "bride": (
        "An experienced bridal stylist speaks to one bride sitting beside her. Natural conversational "
        "American English. Let sentences land. Reassure her during the photo instructions. Give her a "
        "moment at the consent step. Make trying another dress sound like a genuine invitation. "
        "Say button names distinctly. Use a relaxed conversational register throughout."
    ),
}


def record(key, voice, style, transcript):
    payload = {
        "model": MODEL,
        "input": [
            {
                "type": "user_input",
                "content": [
                    {
                        "type": "text",
                        "text": transcript,
                        "annotations": [{"type": "speech_metadata", "style": style}],
                    }
                ],
            }
        ],
        "response_format": {
            "type": "audio",
            "mime_type": "audio/wav",
            "sample_rate": 24000,
        },
        "generation_config": {"speech_config": [{"voice": voice}]},
        "store": False,
    }
    request = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": key,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            data = json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(
            f"Google declined the speech request (HTTP {error.code})."
        ) from None
    parts = [
        part
        for step in data.get("steps", [])
        if step.get("type") == "model_output"
        for part in step.get("content", [])
        if part.get("type") == "audio"
    ]
    if len(parts) != 1:
        raise ValueError("Expected a single complete audio recording from Google.")
    wav = base64.b64decode(parts[0]["data"], validate=True)
    with wave.open(io.BytesIO(wav)) as track:
        if (track.getnchannels(), track.getsampwidth(), track.getframerate()) != (
            1,
            2,
            24000,
        ):
            raise ValueError("Expected mono 24 kHz PCM from Google.")
        if (
            track.getnframes() < 24000
            or len(track.readframes(track.getnframes())) != track.getnframes() * 2
        ):
            raise ValueError("Google returned an incomplete WAV.")
    return wav


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("guide", choices=[*GUIDES, "audition"])
    parser.add_argument(
        "--voice", required=True, help="Google stock voice, e.g. Sulafat or Achernar"
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="New WAV file outside the public site",
    )
    args = parser.parse_args()
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_AI_API_KEY")
    if not key:
        sys.exit(
            "A Google Gemini project credential must be supplied in the recording environment."
        )
    if args.output.exists():
        sys.exit("Choose a new output file to preserve the previous take.")
    if args.guide == "audition":
        transcript = (
            "Open the link from your stylist. Tap a gown you love. "
            "You can come back and try another dress while your invitation is open."
        )
    else:
        transcript = "\n\n".join(line["text"] for line in GUIDES[args.guide])
    style = STYLE.get(args.guide, STYLE["bride"])
    audio = record(key, args.voice, style, transcript)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("xb") as output:
        output.write(audio)
    print(f"Recorded {args.guide} with {MODEL}, voice {args.voice}: {args.output}")


if __name__ == "__main__":
    main()
