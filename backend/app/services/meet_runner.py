import base64
import logging
import os
import tempfile
import threading
import time
from pathlib import Path
from typing import Dict, Optional

from app.config import settings
from app.database import SessionLocal
from app.models import GoogleMeetBotSession
from app.services.audio import get_ffmpeg_binary, transcribe_pcm_array
from app.services.meeting_bot import ingest_speech_chunk

logger = logging.getLogger("decisionlens.meet_runner")

# JavaScript injected before Google Meet loads to capture incoming WebRTC remote audio
WEBRTC_AUDIO_HOOK_JS = """
(() => {
  if (window.__dlAudioHookInstalled) return;
  window.__dlAudioHookInstalled = true;

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let dest = null;
  let recorder = null;
  const attachedTrackIds = new Set();
  const speakerCounts = {};

  function detectActiveMeetSpeaker() {
    try {
      // Google Meet renders participant tiles with data-participant-id and active-speaker / audio-level indicators
      const tiles = document.querySelectorAll('[data-participant-id], [data-requested-participant-id]');
      const unmutedNames = [];
      for (const tile of tiles) {
        const nameEl =
          tile.querySelector('[data-self-name]') ||
          tile.querySelector('.zWGUib, .XEazBc, .cS7aqe, span[dir="auto"]');
        let name = (nameEl && nameEl.textContent || '').trim();
        if (name.length >= 2 && name.length % 2 === 0) {
          const half = name.slice(0, name.length / 2);
          if (half === name.slice(name.length / 2)) name = half;
        }
        const isSelfOrBot = !name || name.length >= 60 || /\\(you\\)|^you$|decisionlens/i.test(name);
        // Check for unmuted / active speaking indicator inside the tile
        const speakingEl = tile.querySelector('[aria-label*="speaking" i], [data-is-speaking="true"], .IisKdb');
        const hasAudioBars = tile.querySelector('[jscontroller][aria-hidden="true"] div[style*="height"]');
        if ((speakingEl || hasAudioBars) && !isSelfOrBot) {
          return name;
        }
        const isMuted = Boolean(tile.querySelector('[aria-label*="muted" i], [data-is-muted="true"]'));
        if (!isMuted && !isSelfOrBot) {
          unmutedNames.push(name);
        }
      }
      if (unmutedNames.length === 1) {
        return unmutedNames[0];
      }
      // Fallback: check Google Meet live caption speaker label if captions happen to be visible
      const capSpeakers = document.querySelectorAll('.NWpY1d, .zs7s8d');
      if (capSpeakers.length > 0) {
        const last = (capSpeakers[capSpeakers.length - 1].textContent || '').trim();
        if (last && last.length < 60) return last;
      }
    } catch (_) {}
    return '';
  }

  setInterval(() => {
    const spk = detectActiveMeetSpeaker();
    if (spk) {
      speakerCounts[spk] = (speakerCounts[spk] || 0) + 1;
    }
  }, 600);

  function consumeTopSpeaker() {
    let best = '';
    let bestCount = 0;
    for (const [name, cnt] of Object.entries(speakerCounts)) {
      if (cnt > bestCount) {
        best = name;
        bestCount = cnt;
      }
      delete speakerCounts[name];
    }
    return best || 'Meeting Audio';
  }
  window.__dlConsumeTopSpeaker = consumeTopSpeaker;

  let mixerGain = null;
  let pcmProcessor = null;
  let silentGain = null;
  let pcmBuffers = [];
  let accumulatedSamples = 0;

  function encodeBytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  let lastSampleRate = 48000;

  const trackedObjects = [];
  window.__dlDiag = { pcCount: 0, trackCount: 0, liveTracks: 0, mutedTracks: 0, framesRead: 0, pcmChunks: 0, lastRms: 0, lastError: '' };

  setInterval(() => {
    let live = 0;
    let muted = 0;
    for (const t of trackedObjects) {
      if (t.readyState === 'live') {
        if (t.muted) muted += 1;
        else live += 1;
      }
    }
    window.__dlDiag.liveTracks = live;
    window.__dlDiag.mutedTracks = muted;
  }, 1000);

  function flushPcmChunk(force = false) {
    if (accumulatedSamples === 0) return;
    const srcRate = (ctx && ctx.sampleRate) || lastSampleRate || 48000;
    const targetMinSamples = srcRate * 5; // 5-second live chunks
    if (!force && accumulatedSamples < targetMinSamples) return;

    const totalLen = accumulatedSamples;
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const buf of pcmBuffers) {
      merged.set(buf, offset);
      offset += buf.length;
    }
    pcmBuffers = [];
    accumulatedSamples = 0;

    // Downsample from srcRate (e.g. 48000) to 16000 Hz Int16 PCM
    const dstRate = 16000;
    const ratio = srcRate / dstRate;
    const outLen = Math.floor(merged.length / ratio);
    if (outLen < 1600) return;

    const int16 = new Int16Array(outLen);
    let sumSq = 0;
    for (let i = 0; i < outLen; i++) {
      const sample = Math.max(-1, Math.min(1, merged[Math.floor(i * ratio)]));
      sumSq += sample * sample;
      int16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    const rms = Math.sqrt(sumSq / outLen);
    const speaker = consumeTopSpeaker();
    window.__dlDiag.pcmChunks += 1;
    window.__dlDiag.lastRms = Number(rms.toFixed(5));

    console.log('[DecisionLens Bot] PCM chunk samples=' + outLen + ' rms=' + rms.toFixed(5) + ' rate=' + srcRate + ' speaker=' + speaker);
    if (rms < 0.0005) {
      if (typeof window.__dl_onBotProgress === 'function') {
        window.__dl_onBotProgress('Audio connected (' + attachedTrackIds.size + ' track(s), silence RMS ' + rms.toFixed(4) + ') — waiting for audible speech...', false);
      }
      return; // Skip pure digital silence
    }

    if (typeof window.__dl_onBotProgress === 'function') {
      window.__dl_onBotProgress('Audio detected (RMS ' + rms.toFixed(3) + ') · Transcribing via faster-whisper...', true);
    }
    if (typeof window.__dl_onPcmChunk === 'function') {
      window.__dl_onPcmChunk(encodeBytesToBase64(new Uint8Array(int16.buffer)), speaker);
    }
  }

  function pushPcmSamples(float32Samples, sampleRate) {
    if (!float32Samples || float32Samples.length === 0) return;
    lastSampleRate = sampleRate || 48000;
    pcmBuffers.push(float32Samples);
    accumulatedSamples += float32Samples.length;
    flushPcmChunk(false);
  }

  function ensureRecorder() {
    if (!ctx) {
      ctx = new AudioCtx();
      mixerGain = ctx.createGain();
      mixerGain.gain.value = 1.0;

      pcmProcessor = ctx.createScriptProcessor(4096, 1, 1);
      pcmProcessor.onaudioprocess = (evt) => {
        const input = evt.inputBuffer.getChannelData(0);
        if (!input || input.length === 0) return;
        pushPcmSamples(new Float32Array(input), ctx.sampleRate);
      };

      silentGain = ctx.createGain();
      silentGain.gain.value = 0.0001;

      mixerGain.connect(pcmProcessor);
      pcmProcessor.connect(silentGain);
      silentGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  function extractWebmHeader(u8) {
    // Matroska Cluster tag: 0x1F 0x43 0xB6 0x75
    for (let i = 0; i + 3 < u8.length; i++) {
      if (u8[i] === 0x1f && u8[i + 1] === 0x43 && u8[i + 2] === 0xb6 && u8[i + 3] === 0x75) {
        return i > 0 ? u8.slice(0, i) : null;
      }
    }
    return null;
  }

  function uint8ToB64(u8) {
    let binary = '';
    const step = 0x8000;
    for (let i = 0; i < u8.length; i += step) {
      binary += String.fromCharCode.apply(null, u8.subarray(i, i + step));
    }
    return btoa(binary);
  }

  function attachTrack(track) {
    if (!track || track.kind !== 'audio' || attachedTrackIds.has(track.id)) return;
    attachedTrackIds.add(track.id);
    trackedObjects.push(track);
    window.__dlDiag.trackCount = attachedTrackIds.size;

    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
      const stream = new MediaStream([track]);

      // Chromium requires an active audio sink (volume > 0) for MediaRecorder to pull WebRTC track frames
      const sinkAudio = document.createElement('audio');
      sinkAudio.srcObject = stream;
      sinkAudio.volume = 0.0001;
      sinkAudio.autoplay = true;
      sinkAudio.style.display = 'none';
      if (document.documentElement) {
        document.documentElement.appendChild(sinkAudio);
      }
      sinkAudio.play().catch(() => {});

      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      let trackWebmHeader = null;

      rec.onerror = (e) => {
        window.__dlDiag.lastError = String((e && e.error) || e || 'MediaRecorder error');
      };

      rec.ondataavailable = async (ev) => {
        try {
          if (!ev.data || ev.data.size === 0) return;
          const buf = new Uint8Array(await ev.data.arrayBuffer());
          if (!trackWebmHeader) {
            const hdr = extractWebmHeader(buf);
            if (hdr) {
              trackWebmHeader = hdr;
            }
          }
          if (buf.length < 200) return;
          let payload = buf;
          const hasEbmlHeader =
            buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
          if (trackWebmHeader && !hasEbmlHeader) {
            payload = new Uint8Array(trackWebmHeader.length + buf.length);
            payload.set(trackWebmHeader, 0);
            payload.set(buf, trackWebmHeader.length);
          }
          window.__dlDiag.framesRead += 1;
          window.__dlDiag.pcmChunks += 1;
          const b64 = uint8ToB64(payload);
          const speaker = detectActiveMeetSpeaker();
          if (typeof window.__dl_onWebmChunk === 'function') {
            window.__dl_onWebmChunk(b64, speaker);
          }
        } catch (err) {
          window.__dlDiag.lastError = String(err);
          console.warn('[DecisionLens Bot] MediaRecorder chunk error:', err);
        }
      };

      rec.start(5000);
      window.__dlActiveRecorders = window.__dlActiveRecorders || [];
      window.__dlActiveRecorders.push(rec);

      track.addEventListener('ended', () => {
        try {
          if (rec.state !== 'inactive') rec.stop();
          sinkAudio.srcObject = null;
          sinkAudio.remove();
        } catch (_) {}
      });

      console.log('[DecisionLens Bot] Attached remote audio track via MediaRecorder:', track.id, mimeType || 'default');
      if (typeof window.__dl_onBotProgress === 'function') {
        window.__dl_onBotProgress('Audio connected (' + attachedTrackIds.size + ' track(s)) — recording speech...', false);
      }
    } catch (err) {
      window.__dlDiag.lastError = String(err);
      console.warn('[DecisionLens Bot] Failed to attach MediaRecorder to track:', err);
    }
  }

  const OrigRTCPC = window.RTCPeerConnection;
  window.__dlPeerConnections = window.__dlPeerConnections || [];
  if (OrigRTCPC) {
    window.RTCPeerConnection = function (...args) {
      window.__dlDiag.pcCount += 1;
      const pc = new OrigRTCPC(...args);
      window.__dlPeerConnections.push(pc);
      pc.addEventListener('track', (event) => {
        if (event.track && event.track.kind === 'audio') {
          attachTrack(event.track);
        }
      });
      return pc;
    };
    window.RTCPeerConnection.prototype = OrigRTCPC.prototype;
    Object.setPrototypeOf(window.RTCPeerConnection, OrigRTCPC);
  }

  // Fallback: also capture audio tracks from HTMLMediaElement.srcObject (play + periodic DOM scan)
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    try {
      if (this.srcObject && typeof this.srcObject.getAudioTracks === 'function') {
        for (const t of this.srcObject.getAudioTracks()) {
          attachTrack(t);
        }
      }
    } catch (_) {}
    return origPlay.apply(this, args);
  };

  setInterval(async () => {
    try {
      const mediaEls = document.querySelectorAll('audio, video');
      let playingAud = 0;
      let totalAud = 0;
      for (const el of mediaEls) {
        if (el.tagName === 'AUDIO') {
          totalAud += 1;
          if (!el.paused && !el.muted && el.volume > 0) playingAud += 1;
        }
        if (el.srcObject && typeof el.srcObject.getAudioTracks === 'function') {
          for (const t of el.srcObject.getAudioTracks()) {
            attachTrack(t);
          }
        }
      }
      window.__dlDiag.audTotal = totalAud;
      window.__dlDiag.audPlaying = playingAud;
      let totalPackets = 0;
      let totalEnergy = 0;
      for (const pc of (window.__dlPeerConnections || [])) {
        if (typeof pc.getReceivers === 'function') {
          for (const r of pc.getReceivers()) {
            if (r.track && r.track.kind === 'audio') {
              attachTrack(r.track);
            }
          }
        }
        if (typeof pc.getStats === 'function') {
          const stats = await pc.getStats();
          stats.forEach((report) => {
            if (report.type === 'inbound-rtp' && (report.kind === 'audio' || report.mediaType === 'audio')) {
              totalPackets += report.packetsReceived || 0;
              totalEnergy += report.totalAudioEnergy || 0;
            }
          });
        }
      }
      window.__dlDiag.rtpPackets = totalPackets;
      window.__dlDiag.rtpEnergy = totalEnergy;
    } catch (_) {}
  }, 2000);

  window.__dlResumeAudio = () => {
    try {
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch (_) {}
  };

  window.__dlFlushAudio = () => {
    try {
      const recs = window.__dlActiveRecorders || [];
      for (const r of recs) {
        if (r && r.state === 'recording' && typeof r.requestData === 'function') {
          r.requestData();
        }
      }
    } catch (_) {}
  };
})();
"""


class MeetBotRunner:
    """Manages a persistent Playwright Chromium session that joins Google Meet and captures raw WebRTC audio."""

    def __init__(
        self,
        session_id: int,
        meet_url: str,
        bot_name: str = "DecisionLens Bot",
        language: str = "en",
        headless: bool = False,
    ):
        self.session_id = session_id
        self.meet_url = meet_url
        self.bot_name = bot_name
        self.language = language if language in ("en", "hi") else "en"
        self.headless = headless
        self.stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._tx_lock = threading.Lock()
        self._last_rms = 0.0
        self._max_rms = 0.0
        self._last_err = ""
        self._last_bytes = 0
        self._max_bytes = 0
        self._last_webrtc_audio_at = 0.0
        self._loopback_chunks = 0
        self._active_speaker = ""
        self._active_speaker_at = 0.0

    def start(self) -> None:
        self._thread = threading.Thread(
            target=self._run_loop,
            name=f"meet-bot-{self.session_id}",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self.stop_event.set()

    def _update_status(self, new_status: str, note: Optional[str] = None) -> None:
        db = SessionLocal()
        try:
            sess = db.get(GoogleMeetBotSession, self.session_id)
            if sess:
                sess.status = new_status
                if note:
                    meta = dict(sess.metadata_json or {})
                    meta["runner_note"] = note
                    sess.metadata_json = meta
                db.commit()
        except Exception as exc:
            logger.warning("Failed to update session %s status: %s", self.session_id, exc)
        finally:
            db.close()

    def _record_progress(self, note: str, increment_chunk: bool = False) -> None:
        db = SessionLocal()
        try:
            sess = db.get(GoogleMeetBotSession, self.session_id)
            if sess and sess.status not in ("completed", "failed"):
                meta = dict(sess.metadata_json or {})
                meta["runner_note"] = note
                if increment_chunk:
                    meta["audio_chunks_received"] = int(meta.get("audio_chunks_received") or 0) + 1
                sess.metadata_json = meta
                db.commit()
        except Exception as exc:
            logger.debug("Progress update failed for session=%s: %s", self.session_id, exc)
        finally:
            db.close()

    def _ingest_pcm_audio(
        self,
        audio_float32,
        speaker: str = "Meeting Audio",
        source_label: str = "WebRTC",
    ) -> None:
        """Compute RMS, transcribe non-silent 16kHz float32 PCM via faster-whisper, and persist speech."""
        import numpy as np

        if len(audio_float32) < 1600:
            return
        rms = float(np.sqrt(np.mean(np.square(audio_float32))))
        self._last_rms = rms if rms >= 0.0005 else max(self._last_rms * 0.5, rms)
        if rms > self._max_rms:
            self._max_rms = rms

        if rms < 0.0005:
            return

        self._record_progress(
            f"{source_label} audio detected (RMS {rms:.4f}) · Transcribing...",
            increment_chunk=True,
        )

        with self._tx_lock:
            transcript = transcribe_pcm_array(
                audio_float32=audio_float32,
                language=self.language,
            )
        clean = (transcript or "").strip()
        print(
            f"[MeetBot] session={self.session_id} src={source_label} rms={rms:.5f} speaker={speaker!r} -> {clean[:120]!r}",
            flush=True,
        )
        noise_markers = {"[no audible speech]", "(no audible speech)", "[silence]", "(silence)"}
        if clean and clean.lower() not in noise_markers:
            db = SessionLocal()
            try:
                sess = db.get(GoogleMeetBotSession, self.session_id)
                if sess and sess.status not in ("completed", "failed"):
                    ingest_speech_chunk(
                        db=db,
                        session=sess,
                        text=clean,
                        speaker=(speaker or "Meeting Audio").strip(),
                    )
                    self._record_progress(f"Transcribed live speech ({len(clean)} chars)...")
            finally:
                db.close()

    def _loopback_capture_loop(self) -> None:
        """Fallback Windows WASAPI speaker loopback capture when WebRTC tracks carry zero audio energy."""
        if os.name != "nt":
            return
        com_inited = False
        try:
            import ctypes

            ctypes.windll.ole32.CoInitialize(None)
            com_inited = True
        except Exception:
            pass

        try:
            import queue
            import numpy as np
            import soundcard as sc

            spk = sc.default_speaker()
            if not spk:
                return
            mic = sc.get_microphone(id=str(spk.name), include_loopback=True)
            if not mic:
                return
            print(f"[MeetBot] session={self.session_id} WASAPI loopback active on {spk.name!r}", flush=True)

            audio_q: "queue.Queue[Optional[np.ndarray]]" = queue.Queue(maxsize=30)

            def _worker() -> None:
                buf = []
                while True:
                    item = audio_q.get()
                    if item is None:
                        break
                    buf.append(item)
                    if len(buf) < 3:
                        continue
                    chunk = np.concatenate(buf)
                    buf = []
                    self._loopback_chunks += 1
                    if time.monotonic() - self._last_webrtc_audio_at < 10.0:
                        continue
                    spk_name = (
                        self._active_speaker
                        if (self._active_speaker and time.monotonic() - self._active_speaker_at < 10.0)
                        else "Meeting Audio"
                    )
                    self._ingest_pcm_audio(chunk, speaker=spk_name, source_label="Loopback")
                if buf and not self.stop_event.is_set():
                    chunk = np.concatenate(buf)
                    spk_name = (
                        self._active_speaker
                        if (self._active_speaker and time.monotonic() - self._active_speaker_at < 10.0)
                        else "Meeting Audio"
                    )
                    self._ingest_pcm_audio(chunk, speaker=spk_name, source_label="Loopback")

            worker_t = threading.Thread(
                target=_worker,
                name=f"meet-loopback-worker-{self.session_id}",
                daemon=True,
            )
            worker_t.start()

            with mic.recorder(samplerate=16000, channels=1) as rec:
                while not self.stop_event.is_set():
                    # Continuous 1s frames so Whisper latency never drops audio between 5s chunks
                    data = rec.record(numframes=16000)
                    if self.stop_event.is_set():
                        break
                    frame = np.asarray(data, dtype=np.float32).flatten()
                    try:
                        audio_q.put_nowait(frame)
                    except queue.Full:
                        try:
                            audio_q.get_nowait()
                        except queue.Empty:
                            pass
                        audio_q.put_nowait(frame)

            try:
                audio_q.put_nowait(None)
            except queue.Full:
                pass
        except Exception as exc:
            logger.debug("Loopback capture unavailable for session=%s: %s", self.session_id, exc)
        finally:
            if com_inited:
                try:
                    import ctypes

                    ctypes.windll.ole32.CoUninitialize()
                except Exception:
                    pass

    def _transcribe_chunk(self, b64_webm: str, speaker: str = "Meeting Audio") -> None:
        if not b64_webm:
            return
        tmp_path: Optional[Path] = None
        try:
            import subprocess
            import numpy as np

            raw_bytes = base64.b64decode(b64_webm)
            self._last_bytes = len(raw_bytes)
            if len(raw_bytes) > self._max_bytes:
                self._max_bytes = len(raw_bytes)
            if len(raw_bytes) < 200:
                return
            with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
                tmp.write(raw_bytes)
                tmp_path = Path(tmp.name)

            ffmpeg_bin = get_ffmpeg_binary()
            if not ffmpeg_bin:
                self._last_err = "ffmpeg not found"
                return
            proc = subprocess.run(
                [
                    ffmpeg_bin,
                    "-nostdin",
                    "-threads", "0",
                    "-i", str(tmp_path),
                    "-f", "s16le",
                    "-ac", "1",
                    "-acodec", "pcm_s16le",
                    "-ar", "16000",
                    "-",
                ],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=15,
            )
            if proc.returncode != 0 or not proc.stdout:
                err_msg = proc.stderr.decode("utf-8", errors="ignore")[-160:].strip()
                self._last_err = f"ffmpeg rc={proc.returncode}: {err_msg[:80]}"
                print(
                    f"[MeetBot] FFmpeg decode failed session={self.session_id} rc={proc.returncode}: {err_msg}",
                    flush=True,
                )
                return

            audio_float32 = np.frombuffer(proc.stdout, dtype=np.int16).astype(np.float32) / 32768.0
            if len(audio_float32) < 1600:
                self._last_err = f"short pcm ({len(audio_float32)})"
                return
            self._last_err = ""
            rms = float(np.sqrt(np.mean(np.square(audio_float32))))
            if rms >= 0.0005:
                self._last_webrtc_audio_at = time.monotonic()
            self._ingest_pcm_audio(audio_float32, speaker=speaker, source_label="WebRTC")
        except Exception as exc:
            print(f"[MeetBot] WebM transcription error session={self.session_id}: {exc}", flush=True)
        finally:
            if tmp_path is not None:
                try:
                    tmp_path.unlink(missing_ok=True)
                except OSError:
                    pass

    def _run_loop(self) -> None:
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            logger.error("Playwright is not installed in this Python environment.")
            self._update_status("failed", "Playwright not installed on backend.")
            return

        profile_dir = settings.storage_path / "meet_bot_profile"
        profile_dir.mkdir(parents=True, exist_ok=True)

        self._update_status("connecting", "Launching browser to join Google Meet...")

        try:
            with sync_playwright() as p:
                launch_args = [
                    "--use-fake-ui-for-media-stream",
                    "--use-fake-device-for-media-stream",
                    "--autoplay-policy=no-user-gesture-required",
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                ]
                context = p.chromium.launch_persistent_context(
                    user_data_dir=str(profile_dir),
                    headless=self.headless,
                    args=launch_args,
                    permissions=["microphone", "camera"],
                )
                try:
                    page = context.pages[0] if context.pages else context.new_page()
                    page.on(
                        "console",
                        lambda msg: print(f"[MeetBot Browser] {msg.text}", flush=True)
                        if "[DecisionLens Bot]" in msg.text
                        else None,
                    )
                    page.add_init_script(WEBRTC_AUDIO_HOOK_JS)
                    page.expose_function(
                        "__dl_onBotProgress",
                        lambda note, inc=False: threading.Thread(
                            target=self._record_progress,
                            args=(note, bool(inc)),
                            daemon=True,
                        ).start(),
                    )
                    page.expose_function(
                        "__dl_onWebmChunk",
                        lambda b64, speaker="Meeting Audio": threading.Thread(
                            target=self._transcribe_chunk,
                            args=(b64, speaker),
                            daemon=True,
                        ).start(),
                    )

                    page.goto(self.meet_url, wait_until="domcontentloaded", timeout=45000)
                    time.sleep(3)

                    # Dismiss "Continue without microphone and camera" if shown
                    for label in ["Continue without microphone and camera", "Got it", "Dismiss"]:
                        btn = page.locator(f"button:has-text('{label}')").first
                        if btn.count() > 0 and btn.is_visible():
                            btn.click()
                            time.sleep(1)

                    # Mute mic & camera before joining
                    for media_label in ["Turn off microphone", "Turn off camera"]:
                        media_btn = page.locator(f"[aria-label*='{media_label}' i]").first
                        if media_btn.count() > 0 and media_btn.is_visible():
                            media_btn.click()
                            time.sleep(0.4)

                    # Fill guest name if prompted
                    name_input = page.locator("input[aria-label*='Your name' i], input[placeholder*='name' i]").first
                    if name_input.count() > 0 and name_input.is_visible():
                        name_input.fill(self.bot_name)
                        time.sleep(0.5)

                    # Click "Ask to join" or "Join now"
                    joined_clicked = False
                    for join_label in ["Ask to join", "Join now", "Join"]:
                        join_btn = page.locator(f"button:has-text('{join_label}')").first
                        if join_btn.count() > 0 and join_btn.is_visible():
                            join_btn.click()
                            joined_clicked = True
                            try:
                                page.evaluate("window.__dlResumeAudio && window.__dlResumeAudio()")
                            except Exception:
                                pass
                            self._update_status(
                                "active",
                                f"Clicked '{join_label}' — waiting for host admission or capturing audio.",
                            )
                            break

                    if not joined_clicked:
                        blocked_loc = page.locator(
                            "text=/You can't join|You cannot join|aren't allowed to join|Sign in/i"
                        ).first
                        if blocked_loc.count() > 0 and blocked_loc.is_visible():
                            self._update_status(
                                "connecting",
                                "Guest access blocked by Meet — sign in with a Bot/Domain Google account in the opened window (or set Meet Host Controls to Open).",
                            )
                        else:
                            self._update_status(
                                "connecting",
                                "Please sign in once in the opened browser window if Google requires login.",
                            )

                    # Start Windows WASAPI speaker loopback fallback thread alongside WebRTC capture
                    threading.Thread(
                        target=self._loopback_capture_loop,
                        name=f"meet-loopback-{self.session_id}",
                        daemon=True,
                    ).start()

                    # Stay in the meeting until stopped or call ends
                    loop_ticks = 0
                    while not self.stop_event.is_set():
                        page.wait_for_timeout(2000)
                        loop_ticks += 1
                        try:
                            top_spk = page.evaluate(
                                "window.__dlConsumeTopSpeaker ? window.__dlConsumeTopSpeaker() : ''"
                            )
                            if isinstance(top_spk, str) and top_spk.strip() and top_spk != "Meeting Audio":
                                self._active_speaker = top_spk.strip()
                                self._active_speaker_at = time.monotonic()
                        except Exception:
                            pass
                        if loop_ticks % 2 == 0:
                            try:
                                diag = page.evaluate("window.__dlDiag || null")
                                if isinstance(diag, dict) and (diag.get("trackCount", 0) > 0 or diag.get("lastError") or self._last_err):
                                    combined_err = self._last_err or diag.get("lastError") or ""
                                    err_part = f" · Err: {combined_err}" if combined_err else ""
                                    rms_val = max(float(diag.get("lastRms", 0) or 0), float(self._last_rms or 0))
                                    bytes_part = f" · {self._last_bytes}B (max {self._max_bytes}B)" if self._last_bytes else ""
                                    lb_part = f" · LB={self._loopback_chunks}" if self._loopback_chunks else ""
                                    rtp_part = f" · RTP {diag.get('rtpPackets', 0)}p/E={float(diag.get('rtpEnergy', 0) or 0):.2f} · pc={diag.get('pcCount', 0)} aud={diag.get('audPlaying', 0)}/{diag.get('audTotal', 0)}{lb_part}"
                                    self._record_progress(
                                        f"Tracks: {diag.get('trackCount')} (live: {diag.get('liveTracks', 0)}, muted: {diag.get('mutedTracks', 0)}) · Frames: {diag.get('framesRead', 0)} · Chunks: {diag.get('pcmChunks')}{bytes_part} · RMS: {rms_val:.4f} (max {self._max_rms:.4f}){rtp_part}{err_part}"
                                    )
                            except Exception:
                                pass
                        # Detect if Google Meet call has ended in the browser DOM
                        try:
                            blocked_loc = page.locator("text=/You can't join|You cannot join|aren't allowed to join/i").first
                            if blocked_loc.count() > 0 and blocked_loc.is_visible():
                                self._update_status(
                                    "failed",
                                    "Google Meet blocked guest access — sign in once with a dedicated Bot/Domain Google account in the bot browser.",
                                )
                                break
                            ended_loc = page.locator(
                                "text=/You left the meeting|The meeting has ended|Return to home screen|You've been removed/i"
                            ).first
                            if ended_loc.count() > 0 and ended_loc.is_visible():
                                logger.info("Google Meet ended in browser for session=%s", self.session_id)
                                self._update_status("completed", "Google Meet call ended.")
                                break
                        except Exception:
                            pass

                        # Check if user ended session in DB
                        db = SessionLocal()
                        try:
                            sess = db.get(GoogleMeetBotSession, self.session_id)
                            if not sess or sess.status in ("completed", "failed"):
                                break
                        finally:
                            db.close()

                    # Flush final audio chunk before closing
                    try:
                        page.evaluate("window.__dlFlushAudio && window.__dlFlushAudio()")
                        page.wait_for_timeout(1500)
                    except Exception:
                        pass
                finally:
                    try:
                        context.close()
                    except Exception:
                        pass
        except Exception as exc:
            msg = str(exc)
            if "has been closed" in msg:
                logger.info("Bot browser closed for session=%s", self.session_id)
                self._update_status("completed", "Bot browser window closed.")
            else:
                logger.exception("MeetBotRunner error for session=%s: %s", self.session_id, exc)
                self._update_status("failed", f"Bot runner error: {exc}")
        finally:
            _ACTIVE_RUNNERS.pop(self.session_id, None)


_ACTIVE_RUNNERS: Dict[int, MeetBotRunner] = {}
_RUNNER_LOCK = threading.Lock()


def start_meet_bot_background(
    session_id: int,
    meet_url: str,
    bot_name: str = "DecisionLens Bot",
    language: str = "en",
) -> None:
    """Spawn a background Playwright MeetBotRunner unless running inside pytest."""
    if os.environ.get("PYTEST_CURRENT_TEST"):
        logger.debug("Skipping live Playwright launch during pytest (session=%s).", session_id)
        return

    with _RUNNER_LOCK:
        if session_id in _ACTIVE_RUNNERS:
            return
        headless = os.environ.get("MEET_BOT_HEADLESS", "false").lower() == "true"
        runner = MeetBotRunner(
            session_id=session_id,
            meet_url=meet_url,
            bot_name=bot_name,
            language=language,
            headless=headless,
        )
        _ACTIVE_RUNNERS[session_id] = runner
        runner.start()


def stop_meet_bot(session_id: int) -> None:
    """Signal an active MeetBotRunner to flush audio and leave the meeting."""
    with _RUNNER_LOCK:
        runner = _ACTIVE_RUNNERS.get(session_id)
        if runner:
            runner.stop()

