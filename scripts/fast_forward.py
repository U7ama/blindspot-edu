#!/usr/bin/env python3
"""
Fast-forward a section of a video using ffmpeg.
Supports MP4, WebM, MKV, with or without audio tracks.

Usage:
    python3 scripts/fast_forward.py input.mp4 output.mp4 --start 00:45 --end 02:15 --speed 8
"""
import sys
import os
import argparse
import subprocess
import json
import math

def parse_time(t_str):
    parts = t_str.split(':')
    if len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    elif len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    return float(t_str)

def has_audio_stream(input_file):
    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "a",
            "-show_entries", "stream=codec_type",
            "-of", "csv=p=0", input_file
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return "audio" in res.stdout
    except Exception:
        return True

def main():
    parser = argparse.ArgumentParser(description="Fast-forward a section of a video.")
    parser.add_argument("input", help="Path to input video file (e.g. input.mp4 or input.webm)")
    parser.add_argument("output", help="Path to output video file (e.g. output.mp4)")
    parser.add_argument("--start", required=True, help="Start time of segment to speed up (e.g. 00:45 or 45)")
    parser.add_argument("--end", required=True, help="End time of segment to speed up (e.g. 02:15 or 135)")
    parser.add_argument("--speed", type=float, default=8.0, help="Speed multiplier (default: 8.0 for 8x speed)")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(f"Error: input file '{args.input}' not found.", file=sys.stderr)
        sys.exit(1)

    t_start = parse_time(args.start)
    t_end = parse_time(args.end)
    speed = args.speed
    if not math.isfinite(speed) or speed <= 1 or not math.isfinite(t_start) or not math.isfinite(t_end) or t_start < 0:
        parser.error('Use a finite speed greater than 1 and nonnegative finite timestamps')
    if os.path.realpath(args.input) == os.path.realpath(args.output):
        parser.error('Input and output must be different files')
    inv_speed = 1.0 / speed
    tempos = []
    remaining = speed
    while remaining > 2:
        tempos.append('atempo=2')
        remaining /= 2
    tempos.append(f'atempo={remaining}')
    tempo_filter = ','.join(tempos)

    if t_end <= t_start:
        print("Error: --end must be greater than --start", file=sys.stderr)
        sys.exit(1)

    has_audio = has_audio_stream(args.input)
    print(f"Input file: {args.input} (Audio detected: {has_audio})")
    print(f"Output file: {args.output}")
    print(f"Normal speed: 0.0s -> {t_start:.1f}s")
    print(f"Fast-forward ({speed}x): {t_start:.1f}s -> {t_end:.1f}s")
    print(f"Normal speed: {t_end:.1f}s -> End")

    if has_audio:
        filter_complex = (
            f"[0:v]trim=0:{t_start},setpts=PTS-STARTPTS[v1]; "
            f"[0:a]atrim=0:{t_start},asetpts=PTS-STARTPTS[a1]; "
            f"[0:v]trim={t_start}:{t_end},setpts={inv_speed}*(PTS-STARTPTS)[v2]; "
            f"[0:a]atrim={t_start}:{t_end},asetpts=PTS-STARTPTS,{tempo_filter}[a2_raw]; "
            f"[a2_raw]volume=0.2[a2]; "
            f"[0:v]trim={t_end},setpts=PTS-STARTPTS[v3]; "
            f"[0:a]atrim={t_end},asetpts=PTS-STARTPTS[a3]; "
            f"[v1][a1][v2][a2][v3][a3]concat=n=3:v=1:a=1[outv][outa]"
        )
        cmd = [
            "ffmpeg", "-y", "-i", args.input,
            "-filter_complex", filter_complex,
            "-map", "[outv]", "-map", "[outa]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "22",
            "-c:a", "aac", "-b:a", "192k",
            args.output
        ]
    else:
        filter_complex = (
            f"[0:v]trim=0:{t_start},setpts=PTS-STARTPTS[v1]; "
            f"[0:v]trim={t_start}:{t_end},setpts={inv_speed}*(PTS-STARTPTS)[v2]; "
            f"[0:v]trim={t_end},setpts=PTS-STARTPTS[v3]; "
            f"[v1][v2][v3]concat=n=3:v=1[outv]"
        )
        cmd = [
            "ffmpeg", "-y", "-i", args.input,
            "-filter_complex", filter_complex,
            "-map", "[outv]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "22",
            args.output
        ]

    print("Running ffmpeg...")
    res = subprocess.run(cmd)
    if res.returncode == 0:
        print(f"\nSuccess! Fast-forwarded video created at:\n  {os.path.abspath(args.output)}")
    else:
        print(f"\nffmpeg exited with code {res.returncode}", file=sys.stderr)
        sys.exit(res.returncode)

if __name__ == "__main__":
    main()
