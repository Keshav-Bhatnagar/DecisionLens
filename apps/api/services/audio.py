import os
import json
import shutil
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional


class AudioService:
    def __init__(self, ffmpeg_bin: str = "ffmpeg", ffprobe_bin: str = "ffprobe"):
        self.ffmpeg_bin = shutil.which(ffmpeg_bin) or ffmpeg_bin
        self.ffprobe_bin = shutil.which(ffprobe_bin) or ffprobe_bin

    def is_ffmpeg_available(self) -> bool:
        """Check if ffmpeg is executable."""
        try:
            res = subprocess.run([self.ffmpeg_bin, "-version"], capture_output=True, text=True)
            return res.returncode == 0
        except Exception:
            return False

    def probe_audio(self, file_path: str) -> Dict[str, Any]:
        """Use ffprobe to inspect audio duration, codec, bitrate, sample rate, channels."""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Media file not found: {file_path}")

        try:
            cmd = [
                self.ffprobe_bin,
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                file_path,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            info = json.loads(result.stdout)
            
            format_info = info.get("format", {})
            duration = float(format_info.get("duration", 0.0))
            bit_rate = int(format_info.get("bit_rate", 0)) if format_info.get("bit_rate") else None
            
            # Find audio stream
            audio_streams = [s for s in info.get("streams", []) if s.get("codec_type") == "audio"]
            stream_info = audio_streams[0] if audio_streams else {}
            
            return {
                "duration_seconds": duration,
                "bit_rate": bit_rate,
                "format_name": format_info.get("format_name"),
                "codec_name": stream_info.get("codec_name"),
                "sample_rate": stream_info.get("sample_rate"),
                "channels": stream_info.get("channels"),
            }
        except subprocess.SubprocessError as e:
            # Fallback estimation if ffprobe encounters an issue
            size = os.path.getsize(file_path)
            return {
                "duration_seconds": max(1.0, size / 16000.0),
                "error": str(e),
                "fallback": True,
            }

    def convert_to_wav(self, input_path: str, output_path: str, sample_rate: int = 16000) -> str:
        """Convert any audio file to 16kHz mono WAV for optimal Speech-To-Text."""
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        cmd = [
            self.ffmpeg_bin,
            "-y",  # overwrite
            "-i", input_path,
            "-vn",  # disable video
            "-ar", str(sample_rate),
            "-ac", "1",  # mono
            "-c:a", "pcm_s16le",
            output_path,
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return output_path

    def generate_synthetic_audio(self, output_path: str, duration_sec: int = 5, frequency: int = 440) -> str:
        """Generate a valid WAV audio tone for testing without external recordings."""
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        cmd = [
            self.ffmpeg_bin,
            "-y",
            "-f", "lavfi",
            "-i", f"sine=frequency={frequency}:duration={duration_sec}",
            "-ar", "16000",
            "-ac", "1",
            output_path,
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return output_path


audio_service = AudioService()
