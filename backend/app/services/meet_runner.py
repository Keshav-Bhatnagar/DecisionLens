import base64
import logging
import os
import queue
import tempfile
import threading
import time
from pathlib import Path
from typing import Dict, Optional

from app.config import settings
from app.database import SessionLocal
from app.models import GoogleMeetBotSession
from app.services.audio import AzureStreamingTranscriber, get_ffmpeg_binary, transcribe_pcm_array
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
          window.__dlDiag.framesRead += 1;
          window.__dlDiag.pcmChunks += 1;
          const b64 = uint8ToB64(buf);
          const speaker = detectActiveMeetSpeaker();
          if (typeof window.__dl_onWebmChunk === 'function') {
            window.__dl_onWebmChunk(b64, speaker, track.id || 'default');
          }
        } catch (err) {
          window.__dlDiag.lastError = String(err);
          console.warn('[DecisionLens Bot] MediaRecorder chunk error:', err);
        }
      };

      rec.start(2500);
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
        self._consent_announced = False
        self._webrtc_q: queue.Queue = queue.Queue(maxsize=240)
        self._webrtc_worker_started = False
        self._thread: Optional[threading.Thread] = None
        self._track_webm_buffers: Dict[str, bytearray] = {}
        self._track_decoded_sec: Dict[str, float] = {}
        self._track_pending_bytes: Dict[str, int] = {}
        self._track_last_decode_at: Dict[str, float] = {}
        self._track_last_speaker: Dict[str, str] = {}
        self._last_prompt: str = ""
        self._last_transcript_tail: str = ""
        self._is_transcribing: bool = False
        self._azure_stream: Optional[AzureStreamingTranscriber] = None
        self._azure_failed: bool = False
        self._azure_lock = threading.Lock()

    def start(self) -> None:
        self._thread = threading.Thread(
            target=self._run_loop,
            name=f"meet-bot-{self.session_id}",
            daemon=True,
        )
        self._thread.start()

    def stop(self) -> None:
        self.stop_event.set()

    def _announce_consent_in_chat(self, page) -> None:
        """Post a one-time DPDP/privacy consent notice in Google Meet chat after admission."""
        if self._consent_announced:
            return
        try:
            leave_btn = page.locator("[aria-label*='Leave call' i]").first
            if leave_btn.count() == 0 or not leave_btn.is_visible():
                return

            chat_input = page.locator(
                "textarea[aria-label*='Send a message' i], textarea[placeholder*='message' i]"
            ).first
            if chat_input.count() == 0 or not chat_input.is_visible():
                chat_btn = page.locator(
                    "button[aria-label*='Chat with everyone' i], button[aria-label*='chat' i]"
                ).first
                if chat_btn.count() > 0 and chat_btn.is_visible():
                    chat_btn.click()
                    page.wait_for_timeout(400)

            chat_input = page.locator(
                "textarea[aria-label*='Send a message' i], textarea[placeholder*='message' i]"
            ).first
            if chat_input.count() > 0 and chat_input.is_visible():
                notice = (
                    f"{self.bot_name} has joined to audit meeting takeaways and surface missing gaps. "
                    "Audio transcription is active (DPDP PII redaction enabled)."
                )
                chat_input.fill(notice)
                chat_input.press("Enter")
                self._consent_announced = True
                logger.info("Posted Meet consent announcement for session=%s", self.session_id)
        except Exception as exc:
            logger.debug("Meet consent chat announcement skipped (session=%s): %s", self.session_id, exc)

    def _announce_leaving_in_chat(self, page) -> None:
        """Post a polite goodbye notice in Google Meet chat before the bot disconnects."""
        try:
            leave_btn = page.locator("[aria-label*='Leave call' i]").first
            if leave_btn.count() == 0 or not leave_btn.is_visible():
                return

            chat_input = page.locator(
                "textarea[aria-label*='Send a message' i], textarea[placeholder*='message' i]"
            ).first
            if chat_input.count() == 0 or not chat_input.is_visible():
                chat_btn = page.locator(
                    "button[aria-label*='Chat with everyone' i], button[aria-label*='chat' i]"
                ).first
                if chat_btn.count() > 0 and chat_btn.is_visible():
                    chat_btn.click()
                    page.wait_for_timeout(300)

            chat_input = page.locator(
                "textarea[aria-label*='Send a message' i], textarea[placeholder*='message' i]"
            ).first
            if chat_input.count() > 0 and chat_input.is_visible():
                notice = (
                    f"{self.bot_name} is leaving the meeting. "
                    "Captured audio has been transcribed and saved to DecisionLens."
                )
                chat_input.fill(notice)
                chat_input.press("Enter")
                page.wait_for_timeout(300)
                logger.info("Posted Meet leaving announcement for session=%s", self.session_id)
        except Exception as exc:
            logger.debug("Meet leaving chat announcement skipped (session=%s): %s", self.session_id, exc)

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

    @staticmethod
    def _trim_overlap(prev_tail: str, new_text: str) -> str:
        """Remove repeated boundary words caused by overlapping audio windows."""
        if not prev_tail or not new_text:
            return new_text
        import re

        def _norm(w: str) -> str:
            return re.sub(r"[^\w']", "", w.lower())

        prev_words = prev_tail.split()
        new_words = new_text.split()
        if not prev_words or not new_words:
            return new_text

        max_k = min(14, len(prev_words), len(new_words))
        for k in range(max_k, 1, -1):
            if [_norm(w) for w in prev_words[-k:]] == [_norm(w) for w in new_words[:k]]:
                return " ".join(new_words[k:]).strip()
        if len(new_words[0]) >= 5 and _norm(prev_words[-1]) == _norm(new_words[0]):
            return " ".join(new_words[1:]).strip()
        return new_text

    def _on_azure_recognized(self, text: str, allow_completed: bool = True) -> None:
        """Persist finalized Azure AI Speech sentence immediately with active speaker attribution."""
        clean = (text or "").strip()
        if not clean:
            return
        spk_name = (
            self._active_speaker
            if (self._active_speaker and time.monotonic() - self._active_speaker_at < 12.0)
            else "Meeting Audio"
        )
        print(
            f"[MeetBot] session={self.session_id} src=AzureSTT speaker={spk_name!r} -> {clean[:120]!r}",
            flush=True,
        )
        db = SessionLocal()
        try:
            sess = db.get(GoogleMeetBotSession, self.session_id)
            if sess and (allow_completed or sess.status not in ("completed", "failed")):
                ingest_speech_chunk(
                    db=db,
                    session=sess,
                    text=clean,
                    speaker=spk_name,
                )
                self._record_progress(f"Azure STT: {clean[:60]}...", increment_chunk=True)
        finally:
            db.close()

    def _get_azure_stream(self) -> Optional[AzureStreamingTranscriber]:
        """Lazily initialize Azure AI Speech continuous stream when configured."""
        if self._azure_failed or not settings.azure_speech_key or not settings.azure_speech_region:
            return None
        with self._azure_lock:
            if self._azure_stream is not None and self._azure_stream.is_alive:
                return self._azure_stream
            if self._azure_failed:
                return None
            try:
                self._azure_stream = AzureStreamingTranscriber(
                    language=self.language,
                    on_text=self._on_azure_recognized,
                    on_error=lambda msg: setattr(self, "_last_err", msg[:80]),
                )
                logger.info(
                    "Azure AI Speech continuous streaming active for session=%s (region=%s)",
                    self.session_id,
                    settings.azure_speech_region,
                )
                return self._azure_stream
            except Exception as exc:
                self._azure_failed = True
                logger.warning("Azure AI Speech unavailable, falling back to Whisper: %s", exc)
                return None

    def _ingest_pcm_audio(
        self,
        audio_float32,
        speaker: str = "Meeting Audio",
        source_label: str = "WebRTC",
        allow_completed: bool = False,
    ) -> None:
        """Compute RMS, stream to Azure AI Speech (if configured) or transcribe via faster-whisper."""
        import numpy as np

        if len(audio_float32) < 1600:
            return
        rms = float(np.sqrt(np.mean(np.square(audio_float32))))
        self._last_rms = rms if rms >= 0.0005 else max(self._last_rms * 0.5, rms)
        if rms > self._max_rms:
            self._max_rms = rms

        azure_stream = self._get_azure_stream()
        if azure_stream is not None and azure_stream.is_alive:
            if rms >= 0.0005:
                self._record_progress(f"{source_label} → Azure STT streaming (RMS {rms:.4f})...")
            azure_stream.push_pcm(audio_float32)
            return

        if rms < 0.0005:
            return

        self._record_progress(
            f"{source_label} audio detected (RMS {rms:.4f}) · Transcribing...",
            increment_chunk=True,
        )

        with self._tx_lock:
            self._is_transcribing = True
            try:
                transcript = transcribe_pcm_array(
                    audio_float32=audio_float32,
                    language=self.language,
                    initial_prompt=self._last_prompt or None,
                )
            finally:
                self._is_transcribing = False
            clean = (transcript or "").strip()
            clean = self._trim_overlap(self._last_transcript_tail, clean)
            if clean:
                self._last_prompt = (self._last_prompt + " " + clean).strip()[-400:]
                self._last_transcript_tail = clean
        print(
            f"[MeetBot] session={self.session_id} src={source_label} rms={rms:.5f} speaker={speaker!r} -> {clean[:120]!r}",
            flush=True,
        )
        noise_markers = {"[no audible speech]", "(no audible speech)", "[silence]", "(silence)"}
        if clean and clean.lower() not in noise_markers:
            db = SessionLocal()
            try:
                sess = db.get(GoogleMeetBotSession, self.session_id)
                if sess and (allow_completed or sess.status not in ("completed", "failed")):
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

    def _enqueue_webrtc_chunk(
        self,
        b64_webm: str,
        speaker: str = "Meeting Audio",
        track_id: str = "default",
    ) -> None:
        if not self._webrtc_worker_started:
            self._webrtc_worker_started = True
            threading.Thread(target=self._webrtc_worker_loop, daemon=True).start()
        try:
            self._webrtc_q.put_nowait((b64_webm, speaker, track_id))
        except queue.Full:
            logger.warning("[MeetBot %s] WebRTC audio queue full; dropping oldest chunk", self.session_id)
            try:
                self._webrtc_q.get_nowait()
                self._webrtc_q.put_nowait((b64_webm, speaker, track_id))
            except Exception:
                pass

    def _webrtc_worker_loop(self) -> None:
        while not self.stop_event.is_set():
            try:
                b64_webm, speaker, track_id = self._webrtc_q.get(timeout=0.5)
            except queue.Empty:
                continue
            try:
                self._transcribe_chunk(b64_webm, speaker, track_id=track_id)
            except Exception as exc:
                logger.warning("[MeetBot %s] WebRTC worker error: %s", self.session_id, exc)
            finally:
                self._webrtc_q.task_done()

    def _flush_all_tracks(self, allow_completed: bool = False) -> None:
        """Force-transcribe any remaining buffered WebRTC audio across all tracks."""
        for tid in list(self._track_webm_buffers.keys()):
            if self._track_pending_bytes.get(tid, 0) > 0:
                spk = self._track_last_speaker.get(tid) or "Meeting Audio"
                self._transcribe_chunk(
                    "",
                    speaker=spk,
                    track_id=tid,
                    force_flush=True,
                    allow_completed=allow_completed,
                )

    def _transcribe_chunk(
        self,
        b64_webm: str,
        speaker: str = "Meeting Audio",
        track_id: str = "default",
        force_flush: bool = False,
        allow_completed: bool = False,
    ) -> None:
        if not b64_webm and not force_flush:
            return
        tmp_path: Optional[Path] = None
        try:
            import subprocess
            import numpy as np

            if b64_webm:
                raw_bytes = base64.b64decode(b64_webm)
                self._last_bytes = len(raw_bytes)
                if len(raw_bytes) > self._max_bytes:
                    self._max_bytes = len(raw_bytes)
                buf = self._track_webm_buffers.setdefault(track_id, bytearray())
                buf.extend(raw_bytes)
                self._track_pending_bytes[track_id] = self._track_pending_bytes.get(track_id, 0) + len(raw_bytes)
            else:
                buf = self._track_webm_buffers.get(track_id)
                if not buf:
                    return

            now = time.monotonic()
            last_at = self._track_last_decode_at.setdefault(track_id, now)
            pending_bytes = self._track_pending_bytes.get(track_id, 0)
            decoded_sec = self._track_decoded_sec.get(track_id, 0.0)
            elapsed = now - last_at

            prev_speaker = self._track_last_speaker.get(track_id, "")
            norm_speaker = (speaker or "Meeting Audio").strip()
            speaker_changed = (
                bool(prev_speaker)
                and prev_speaker != "Meeting Audio"
                and norm_speaker != "Meeting Audio"
                and norm_speaker != prev_speaker
            )
            if norm_speaker != "Meeting Audio" or not prev_speaker:
                self._track_last_speaker[track_id] = norm_speaker

            azure_active = bool(
                not self._azure_failed
                and settings.azure_speech_key
                and settings.azure_speech_region
            )
            # With Azure continuous streaming, push PCM every ~3s with zero overlap;
            # with local Whisper, batch into 120s windows (or 20s speaker turns).
            if not force_flush:
                if azure_active:
                    if elapsed < 3.0 and pending_bytes < 8000:
                        return
                else:
                    ready_2min = elapsed >= 120.0 or pending_bytes >= 360000
                    ready_speaker_turn = speaker_changed and elapsed >= 20.0
                    if not (ready_2min or ready_speaker_turn):
                        return
                    if ready_speaker_turn and prev_speaker:
                        speaker = prev_speaker
                if len(buf) < 4000:
                    return

            with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
                tmp.write(buf)
                tmp_path = Path(tmp.name)

            ffmpeg_bin = get_ffmpeg_binary()
            if not ffmpeg_bin:
                self._last_err = "ffmpeg not found"
                return

            overlap_sec = 0.0 if azure_active else 2.0
            seek_sec = max(0.0, decoded_sec - overlap_sec)
            cmd = [ffmpeg_bin, "-nostdin", "-threads", "0", "-i", str(tmp_path)]
            if seek_sec > 0.05:
                cmd.extend(["-ss", f"{seek_sec:.3f}"])
            cmd.extend(["-f", "s16le", "-ac", "1", "-acodec", "pcm_s16le", "-ar", "16000", "-"])

            proc = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=45,
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
            new_dur = len(audio_float32) / 16000.0
            if not force_flush and new_dur < 2.0:
                return
            if len(audio_float32) < 1600:
                self._last_err = f"short pcm ({len(audio_float32)})"
                return

            self._track_decoded_sec[track_id] = seek_sec + new_dur
            self._track_pending_bytes[track_id] = 0
            self._track_last_decode_at[track_id] = now

            self._last_err = ""
            rms = float(np.sqrt(np.mean(np.square(audio_float32))))
            if rms >= 0.0005:
                self._last_webrtc_audio_at = time.monotonic()
            self._ingest_pcm_audio(
                audio_float32,
                speaker=speaker,
                source_label="WebRTC",
                allow_completed=allow_completed,
            )
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
                        lambda b64, speaker="Meeting Audio", track_id="default": self._enqueue_webrtc_chunk(
                            b64, speaker, track_id
                        ),
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
                    meet_code = self.meet_url.rstrip("/").split("/")[-1].split("?")[0]
                    was_in_call = False
                    rejoin_attempts = 0
                    zero_pc_ticks = 0
                    loop_ticks = 0
                    while not self.stop_event.is_set():
                        if page.is_closed():
                            self._update_status("completed", "Bot browser tab closed.")
                            break
                        page.wait_for_timeout(2000)
                        loop_ticks += 1
                        if not self._consent_announced:
                            self._announce_consent_in_chat(page)
                        try:
                            leave_btn = page.locator("[aria-label*='Leave call' i]").first
                            if leave_btn.count() > 0 and leave_btn.is_visible():
                                was_in_call = True
                                zero_pc_ticks = 0
                        except Exception:
                            pass
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
                                if isinstance(diag, dict):
                                    if was_in_call and int(diag.get("pcCount", 0) or 0) == 0:
                                        zero_pc_ticks += 1
                                        if zero_pc_ticks >= 5:
                                            self._record_progress("WebRTC audio stream interrupted — monitoring for reconnect...")
                                    else:
                                        zero_pc_ticks = 0
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
                        # Detect if Google Meet call has ended or glitched in the browser DOM
                        try:
                            blocked_loc = page.locator("text=/You can't join|You cannot join|aren't allowed to join/i").first
                            if blocked_loc.count() > 0 and blocked_loc.is_visible():
                                self._update_status(
                                    "failed",
                                    "Google Meet blocked guest access — sign in once with a dedicated Bot/Domain Google account in the bot browser.",
                                )
                                break
                            ended_loc = page.locator(
                                "text=/You left the meeting|You've left the call|The meeting has ended|The call ended|Your meeting has ended|Return to home screen|Returning to home screen|You've been removed|No one responded to your request|Meeting ended/i"
                            ).first
                            if ended_loc.count() > 0 and ended_loc.is_visible():
                                logger.info("Google Meet ended in browser for session=%s", self.session_id)
                                self._update_status("completed", "Google Meet call ended.")
                                break
                            if meet_code and loop_ticks > 3 and meet_code not in (page.url or ""):
                                logger.info("Google Meet redirected away from %s for session=%s", meet_code, self.session_id)
                                self._update_status("completed", "Google Meet call ended (returned to home screen).")
                                break
                            glitch_loc = page.locator(
                                "text=/Trying to reconnect|You lost your network connection|Check your network connection|Reconnecting|Audio may be degraded/i"
                            ).first
                            if glitch_loc.count() > 0 and glitch_loc.is_visible():
                                self._record_progress("Meet network glitch detected — flushing buffered audio & waiting for reconnect...")
                                self._flush_all_tracks(allow_completed=False)
                            rejoin_btn = page.locator("button:has-text('Rejoin')").first
                            if was_in_call and rejoin_btn.count() > 0 and rejoin_btn.is_visible():
                                self._flush_all_tracks(allow_completed=False)
                                if rejoin_attempts < 3:
                                    rejoin_attempts += 1
                                    self._record_progress(f"Meet glitch/drop detected — auto-rejoining (attempt {rejoin_attempts}/3)...")
                                    rejoin_btn.click()
                                    page.wait_for_timeout(2000)
                                else:
                                    self._update_status("failed", "Repeated Meet disconnects — could not rejoin call.")
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

                    # Announce leaving in Meet chat if still in call, then flush final audio
                    if was_in_call and not page.is_closed():
                        self._announce_leaving_in_chat(page)
                    try:
                        page.evaluate("window.__dlFlushAudio && window.__dlFlushAudio()")
                        page.wait_for_timeout(800)
                    except Exception:
                        pass
                    self._flush_all_tracks(allow_completed=True)
                    if self._azure_stream is not None:
                        self._azure_stream.close(timeout=5.0)
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
            self.stop_event.set()
            _ACTIVE_RUNNERS.pop(self.session_id, None)

    def get_pending_stats(self) -> tuple[int, int]:
        """Return (pending_chunks, buffered_seconds) currently awaiting transcription."""
        q_size = self._webrtc_q.qsize()
        pending_tracks = sum(1 for b in self._track_pending_bytes.values() if b > 0)
        pending_chunks = q_size + pending_tracks + (1 if self._is_transcribing else 0)
        now = time.monotonic()
        buffered_sec = 0
        for tid, b in list(self._track_pending_bytes.items()):
            if b > 0:
                last_at = self._track_last_decode_at.get(tid, now)
                buffered_sec = max(buffered_sec, int(max(0.0, now - last_at)))
        return pending_chunks, min(buffered_sec, 120)


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

    stale_runners = []
    with _RUNNER_LOCK:
        for active_id, active_runner in list(_ACTIVE_RUNNERS.items()):
            if active_id != session_id:
                active_runner.stop()
                stale_runners.append(active_runner)

    # Wait briefly for any previous Playwright context to release meet_bot_profile
    for stale in stale_runners:
        if stale._thread and stale._thread.is_alive():
            stale._thread.join(timeout=5.0)

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


def get_runner_pending_stats(session_id: int) -> tuple[int, int]:
    """Return live (pending_chunks, buffered_seconds) for an active runner, or (0, 0)."""
    runner = _ACTIVE_RUNNERS.get(session_id)
    if not runner:
        return 0, 0
    return runner.get_pending_stats()


def stop_meet_bot(session_id: int, wait_timeout: float = 0.0) -> None:
    """Signal an active MeetBotRunner to flush audio and leave the meeting."""
    runner: Optional[MeetBotRunner] = None
    with _RUNNER_LOCK:
        runner = _ACTIVE_RUNNERS.get(session_id)
        if runner:
            runner.stop()
    if runner and wait_timeout > 0 and runner._thread and runner._thread.is_alive():
        runner._thread.join(timeout=wait_timeout)

