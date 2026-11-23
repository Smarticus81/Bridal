"""Align a finished narration to the original screen recording and its English captions."""

import argparse
import difflib
import itertools
import json
import math
import re
import subprocess
import tempfile
from pathlib import Path

from vosk import KaldiRecognizer, Model, SetLogLevel

ROOT = Path(__file__).resolve().parents[2]
MASTER = "6c6a32ef41ab6831f9ddf530155183072496c0fd"
ASSETS = "artifacts/wedding-app/public/aislework"
GUIDES = json.loads(Path(__file__).with_name("guides.json").read_text())
FPS = 24


def original(asset):
    return subprocess.check_output(
        ["git", "show", f"{MASTER}:{ASSETS}/{asset}"], cwd=ROOT
    )


def words(line):
    return re.findall(r"[a-z0-9]+", line.lower().replace("’", "").replace("'", ""))


def clock(seconds):
    milliseconds = round(seconds * 1000)
    return f"{milliseconds // 3600000:02}:{milliseconds // 60000 % 60:02}:{milliseconds // 1000 % 60:02}.{milliseconds % 1000:03}"


def transcribe(path, model):
    SetLogLevel(-1)
    engine = KaldiRecognizer(Model(str(model)), 16000)
    engine.SetWords(True)
    pcm = subprocess.check_output(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-f",
            "s16le",
            "-ac",
            "1",
            "-ar",
            "16000",
            "pipe:1",
        ]
    )
    results = []
    for pos in range(0, len(pcm), 8000):
        if engine.AcceptWaveform(pcm[pos : pos + 8000]):
            results.extend(json.loads(engine.Result()).get("result", []))
    results.extend(json.loads(engine.FinalResult()).get("result", []))
    return len(pcm) / 32000, results


def align(transcript, recognized):
    heard = [(part, token) for token in recognized for part in words(token["word"])]
    matcher = difflib.SequenceMatcher(
        None, transcript, [word for word, _ in heard], autojunk=False
    )
    anchors = {
        a + i: heard[b + i][1]
        for a, b, length in matcher.get_matching_blocks()
        for i in range(length)
    }
    coverage = len(anchors) / len(transcript)
    positions = [-1, *sorted(anchors), len(transcript)]
    if coverage < 0.82 or max(b - a - 1 for a, b in itertools.pairwise(positions)) > 6:
        raise ValueError(
            f"Speech diverges from the guide ({coverage:.0%} aligned). Review the recording."
        )
    return anchors, coverage


def edge(anchors, begin, end, field):
    indices = range(begin, end) if field == "start" else range(end - 1, begin - 1, -1)
    for i in indices:
        if i in anchors:
            return anchors[i][field]
    raise ValueError("A complete caption has no matching speech. Review the recording.")


def main():
    parser = argparse.ArgumentParser(
        description=__doc__,
        epilog="Requires FFmpeg, a Git checkout containing the original Aislework videos, "
        "and the vosk Python package with an English recognition model. "
        "The output includes the MP4, English WebVTT captions and chapter times in seconds.",
    )
    parser.add_argument("guide", choices=GUIDES)
    parser.add_argument("audio", type=Path)
    parser.add_argument("--vosk-model", type=Path, required=True)
    parser.add_argument(
        "--output", type=Path, required=True, help="New output directory for this guide"
    )
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Use a new directory for this edition.")
    scenes = GUIDES[args.guide]
    reference = [word for scene in scenes for word in words(scene["text"])]
    duration, recognized = transcribe(args.audio, args.vosk_model)
    anchors, coverage = align(reference, recognized)
    caption_blocks = original(args.guide + ".en.vtt").decode().strip().split("\n\n")[1:]
    captions = ["\n".join(block.splitlines()[1:]) for block in caption_blocks]
    if [w for c in captions for w in words(c)] != reference:
        raise ValueError("Master captions and spoken script differ.")
    word_pos = 0
    vtt = ["WEBVTT", ""]
    for caption in captions:
        end = word_pos + len(words(caption))
        start_time = edge(anchors, word_pos, end, "start")
        end_time = edge(anchors, word_pos, end, "end")
        vtt.extend([f"{clock(start_time)} --> {clock(end_time)}", caption, ""])
        word_pos = end
    frame = 0
    starts = []
    word_pos = 0
    for scene in scenes:
        end = word_pos + len(words(scene["text"]))
        if word_pos:
            previous = edge(anchors, max(0, word_pos - 7), word_pos, "end")
            current = edge(anchors, word_pos, end, "start")
            frame = round((previous + current) / 2 * FPS)
        starts.append(frame)
        word_pos = end
    total_frames = math.ceil(duration * FPS)
    args.output.parent.mkdir(exist_ok=True, parents=True)
    with tempfile.TemporaryDirectory(dir=args.output.parent) as temp_name:
        temp = Path(temp_name)
        picture = temp / "master.mp4"
        picture.write_bytes(original(args.guide + ".mp4"))
        probe = subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=nb_frames,r_frame_rate",
                "-of",
                "json",
                str(picture),
            ]
        )
        stream = json.loads(probe)["streams"][0]
        if stream["r_frame_rate"] != "24/1":
            raise ValueError("Guide master must be 24 fps.")
        cuts = [s["frame"] for s in scenes] + [int(stream["nb_frames"])]
        targets = starts + [total_frames]
        filters = []
        for i in range(len(scenes)):
            length = targets[i + 1] - targets[i]
            source = cuts[i + 1] - cuts[i]
            if min(length, source) < FPS:
                raise ValueError(f"Implausible cut length in scene {scenes[i]['id']}.")
            filters.append(
                f"[0:v]trim=start_frame={cuts[i]}:end_frame={cuts[i + 1]},"
                f"setpts=(PTS-STARTPTS)*{length}/{source},fps={FPS},"
                f"tpad=stop_mode=clone:stop_duration=1,trim=end_frame={length},setpts=PTS-STARTPTS[v{i}]"
            )
        filters.append(
            "".join(f"[v{i}]" for i in range(len(scenes)))
            + f"concat=n={len(scenes)}:v=1:a=0[video]"
        )
        edition = temp / "edition"
        edition.mkdir()
        output = edition / (args.guide + ".mp4")
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-filter_complex_threads",
                "2",
                "-i",
                str(picture),
                "-i",
                str(args.audio),
                "-filter_complex",
                ";".join(filters),
                "-map",
                "[video]",
                "-map",
                "1:a:0",
                "-c:v",
                "libx264",
                "-r",
                str(FPS),
                "-fps_mode",
                "cfr",
                "-crf",
                "17",
                "-preset",
                "veryfast",
                "-threads",
                "2",
                "-pix_fmt",
                "yuv420p",
                "-af",
                f"loudnorm=I=-16:TP=-1.5:LRA=7,atrim=duration={duration}",
                "-ar",
                "48000",
                "-ac",
                "1",
                "-c:a",
                "aac",
                "-b:a",
                "128k",
                "-metadata:s:a:0",
                "language=eng",
                "-movflags",
                "+faststart",
                str(output),
            ],
            check=True,
        )
        (edition / (args.guide + ".en.vtt")).write_text("\n".join(vtt) + "\n")
        timings = {s["id"]: n / FPS for s, n in zip(scenes, starts)}
        (edition / "timing.json").write_text(
            json.dumps({"seconds": duration, "scenes": timings}, indent=2) + "\n"
        )
        edition.rename(args.output)
    print(
        f"{args.guide}: {duration:.1f} s, {len(scenes)} scenes, {len(captions)} captions, {coverage:.0%} words aligned."
    )


if __name__ == "__main__":
    main()
