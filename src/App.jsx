// MCA ↔ WAV Converter
// Based on vgmstream mca.c and onepiecefreak3/MCAConverter
// Correct MADP header layout:
//   0x00  "MADP"  magic (BE)
//   0x04  u8      version (3 or 4)
//   0x08  u8      channel count
//   0x0A  u16 LE  interleave block size (typically 0x100)
//   0x0C  u32 LE  num_samples
//   0x10  u16 LE  sample_rate
//   0x14  u32 LE  loop_start_sample
//   0x18  u32 LE  loop_end_sample (>0 = looping)
//   0x1C  u32 LE  header size / data offset
//   0x20+         per-channel coefficient blocks (0x30 bytes each)
//   headSize+     DSP-ADPCM audio data

import React, { useState, useRef } from "react";

export default function App() {
  const [file, setFile] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [fileExt, setFileExt] = useState("");
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);
  const [version, setVersion] = useState(4);
  const [status, setStatus] = useState({ msg: "Idle", cls: "" });
  const [meta, setMeta] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [outBlob, setOutBlob] = useState(null);
  const [outName, setOutName] = useState("");
  const audioRef = useRef(null);

  const handleFile = async (f) => {
    const ext = f.name.split(".").pop().toLowerCase();
    const buf = new Uint8Array(await f.arrayBuffer());
    setFile(f);
    setFileData(buf);
    setFileExt(ext);
    setAudioUrl(null);
    setOutBlob(null);

    if (ext === "mca") {
      try {
        const m = parseMCAHeader(buf);
        setLoopStart(m.loopStart);
        setLoopEnd(m.loopEnd);
        setMeta([
          ["Channels", m.channels],
          ["Sample rate", m.sampleRate + " Hz"],
          ["Samples", m.numSamples.toLocaleString()],
          ["Loop start", m.loopStart.toLocaleString()],
          ["Loop end", m.loopEnd.toLocaleString()],
          ["Version", m.version],
        ]);
        setStatus({ msg: "MCA parsed — loop points loaded", cls: "ok" });
      } catch (e) {
        setStatus({ msg: "MCA parse error: " + e.message, cls: "err" });
      }
    } else if (ext === "wav") {
      try {
        const w = parseWAVHeader(buf);
        setMeta([
          ["Channels", w.channels],
          ["Sample rate", w.sampleRate + " Hz"],
          ["Bit depth", w.bitsPerSample],
          ["Samples", w.numSamples.toLocaleString()],
        ]);
        setStatus({ msg: "WAV loaded", cls: "ok" });
      } catch (e) {
        setStatus({ msg: "WAV parse error: " + e.message, cls: "err" });
      }
    }
  };

  const decode = async () => {
    setStatus({ msg: "Decoding…", cls: "" });
    await tick();
    try {
      const wav = mcaToWav(fileData);
      const blob = new Blob([wav], { type: "audio/wav" });
      const name = baseName(file.name) + ".wav";
      setOutBlob(blob);
      setOutName(name);
      setAudioUrl(URL.createObjectURL(blob));
      setStatus({ msg: "Decoded → " + name, cls: "ok" });
    } catch (e) {
      setStatus({ msg: "Decode error: " + e.message, cls: "err" });
    }
  };

  const encode = async () => {
    setStatus({ msg: "Encoding…", cls: "" });
    await tick();
    try {
      const mca = wavToMca(fileData, loopStart, loopEnd, version);
      const blob = new Blob([mca], { type: "application/octet-stream" });
      const name = baseName(file.name) + ".mca";
      setOutBlob(blob);
      setOutName(name);
      setAudioUrl(null);
      setStatus({ msg: "Encoded → " + name, cls: "ok" });
    } catch (e) {
      setStatus({ msg: "Encode error: " + e.message, cls: "err" });
    }
  };

  const download = () => {
    if (!outBlob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(outBlob);
    a.download = outName;
    a.click();
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const sampleRate = 44100;
    const t = audioRef.current.currentTime * sampleRate;
    if (loopEnd > loopStart && t >= loopEnd) {
      audioRef.current.currentTime = loopStart / sampleRate;
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "2rem 1rem", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, marginBottom: 4 }}>MCA ↔ WAV Converter</h1>
      <p style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>
        Capcom MADP format · DSP-ADPCM · vgmstream-accurate header
      </p>

      {/* File input */}
      <div style={card}>
        <div style={cardTitle}>Input file</div>
        <label style={dropZone}>
          <span style={{ fontSize: 14, color: "#888" }}>
            {file ? file.name : "Click to choose a .mca or .wav file"}
          </span>
          <input
            type="file"
            accept=".mca,.wav"
            style={{ display: "none" }}
            onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])}
          />
        </label>
        {meta && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 10 }}>
            {meta.map(([l, v]) => (
              <div key={l} style={metricCard}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 2 }}>{l}</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Loop points */}
      <div style={card}>
        <div style={cardTitle}>Loop points (samples · 44100 = 1 s)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={fieldLabel}>
            Loop start
            <input
              type="number"
              value={loopStart}
              min={0}
              onChange={(e) => setLoopStart(Number(e.target.value))}
              style={numInput}
            />
          </label>
          <label style={fieldLabel}>
            Loop end
            <input
              type="number"
              value={loopEnd}
              min={0}
              onChange={(e) => setLoopEnd(Number(e.target.value))}
              style={numInput}
            />
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 13, color: "#888" }}>
          <span>MCA version</span>
          <select value={version} onChange={(e) => setVersion(Number(e.target.value))} style={numInput}>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
          <span style={{ fontSize: 12, color: "#aaa" }}>(default 4)</span>
        </div>
      </div>

      {/* Convert */}
      <div style={card}>
        <div style={cardTitle}>Convert</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={decode} disabled={fileExt !== "mca"} style={btn}>
            MCA → WAV decode
          </button>
          <button onClick={encode} disabled={fileExt !== "wav"} style={btn}>
            WAV → MCA encode
          </button>
        </div>
        {status.msg !== "Idle" && (
          <div style={{ ...statusBar, ...(status.cls === "ok" ? statusOk : status.cls === "err" ? statusErr : {}) }}>
            {status.msg}
          </div>
        )}
        {audioUrl && (
          <audio
            ref={audioRef}
            controls
            src={audioUrl}
            onTimeUpdate={handleTimeUpdate}
            style={{ width: "100%", marginTop: 10 }}
          />
        )}
        {outBlob && (
          <button onClick={download} style={{ ...btn, marginTop: 10 }}>
            Download {outName}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Styles ─── */
const card = { background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 12 };
const cardTitle = { fontSize: 11, fontWeight: 500, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 };
const dropZone = { display: "block", border: "1.5px dashed #ccc", borderRadius: 8, padding: "1.5rem 1rem", textAlign: "center", cursor: "pointer" };
const metricCard = { background: "#f5f5f5", borderRadius: 8, padding: "8px 10px" };
const fieldLabel = { display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "#888" };
const numInput = { fontFamily: "monospace", fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "0.5px solid #ccc", background: "#f5f5f5" };
const btn = { fontFamily: "sans-serif", fontSize: 13, fontWeight: 500, padding: "7px 16px", borderRadius: 8, border: "0.5px solid #ccc", background: "transparent", cursor: "pointer" };
const statusBar = { fontSize: 13, padding: "6px 10px", borderRadius: 8, marginTop: 10, background: "#f5f5f5" };
const statusOk = { background: "#e6f9ee", color: "#1a7a3f" };
const statusErr = { background: "#fdecea", color: "#b71c1c" };

/* ─── Utilities ─── */
function tick() { return new Promise((r) => setTimeout(r, 20)); }
function baseName(name) { return name.replace(/\.[^.]+$/, ""); }

/* ══════════════════════════════════════════════════════
   MCA HEADER PARSER  (vgmstream-accurate)
══════════════════════════════════════════════════════ */
function parseMCAHeader(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset);
  const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (magic !== "MADP") throw new Error("Not a MADP/MCA file (magic: " + magic + ")");
  const version    = v.getUint8(0x04);
  const channels   = v.getUint8(0x08);
  const interleave = v.getUint16(0x0A, true);
  const numSamples = v.getUint32(0x0C, true);
  const sampleRate = v.getUint16(0x10, true);
  const loopStart  = v.getUint32(0x14, true);
  const loopEnd    = v.getUint32(0x18, true);
  const headSize   = v.getUint32(0x1C, true) || 0x20;
  return { version, channels, interleave, numSamples, sampleRate, loopStart, loopEnd, headSize };
}

/* ══════════════════════════════════════════════════════
   MCA → WAV  (DSP-ADPCM decode)
══════════════════════════════════════════════════════ */
function mcaToWav(buf) {
  const meta = parseMCAHeader(buf);
  const { channels, sampleRate, numSamples, headSize } = meta;
  const v = new DataView(buf.buffer, buf.byteOffset);

  const COEF_BLOCK = 0x30; // 48 bytes per channel coefficient block
  const coefs = [];
  let coefOff = 0x20;
  for (let ch = 0; ch < channels; ch++) {
    const c = new Int16Array(16);
    for (let i = 0; i < 16; i++) c[i] = v.getInt16(coefOff + i * 2, true);
    coefs.push(c);
    coefOff += COEF_BLOCK;
  }

  const audioData = buf.slice(headSize);
  const pcm = decodeDSP(audioData, channels, numSamples, coefs, meta.interleave || 0x100);
  return buildWAV(pcm, channels, sampleRate);
}

/* ══════════════════════════════════════════════════════
   DSP-ADPCM DECODER
   8 bytes/frame, 14 samples/frame, interleaved by channel
   Header byte: high nibble = coef index, low nibble = scale
══════════════════════════════════════════════════════ */
function decodeDSP(src, channels, totalSamples, coefs, interleave) {
  const SPB = 14, BPB = 8;
  const out = new Int16Array(totalSamples * channels);
  const hist1 = new Int32Array(channels);
  const hist2 = new Int32Array(channels);
  const decoded = new Int32Array(channels);
  const fpI = Math.floor(interleave / BPB); // frames per interleave block
  let srcOff = 0;

  while (decoded[0] < totalSamples) {
    for (let ch = 0; ch < channels; ch++) {
      const chOff = srcOff + ch * interleave;
      const framesLeft = Math.ceil((totalSamples - decoded[ch]) / SPB);
      const framesDo = Math.min(fpI, framesLeft);
      for (let f = 0; f < framesDo; f++) {
        const bOff = chOff + f * BPB;
        if (bOff >= src.length) break;
        const header = src[bOff];
        const scale = 1 << (header & 0xF);
        const ci = (header >> 4) & 0x7;
        const c1 = coefs[ch][ci * 2], c2 = coefs[ch][ci * 2 + 1];
        for (let s = 0; s < SPB && decoded[ch] < totalSamples; s++) {
          const byteIdx = bOff + 1 + (s >> 1);
          if (byteIdx >= src.length) break;
          const raw = s % 2 === 0 ? (src[byteIdx] >> 4) & 0xF : src[byteIdx] & 0xF;
          const nibble = raw >= 8 ? raw - 16 : raw;
          let sample = (((nibble * scale) << 11) + 1024 + (c1 * hist1[ch] + c2 * hist2[ch])) >> 11;
          sample = Math.max(-32768, Math.min(32767, sample));
          hist2[ch] = hist1[ch];
          hist1[ch] = sample;
          out[decoded[ch] * channels + ch] = sample;
          decoded[ch]++;
        }
      }
    }
    srcOff += channels * interleave;
    if (srcOff >= src.length) break;
  }
  return out;
}

/* ══════════════════════════════════════════════════════
   WAV BUILDER  (16-bit PCM RIFF)
══════════════════════════════════════════════════════ */
function buildWAV(pcm, channels, sampleRate) {
  const dataBytes = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const ws = (off, str) => { for (let i = 0; i < str.length; i++) v.setUint8(off + i, str.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, 36 + dataBytes, true); ws(8, "WAVE");
  ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, channels, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true); v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true); ws(36, "data"); v.setUint32(40, dataBytes, true);
  new Int16Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}

/* ══════════════════════════════════════════════════════
   WAV HEADER PARSER
══════════════════════════════════════════════════════ */
function parseWAVHeader(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset);
  if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== "RIFF") throw new Error("Not a RIFF WAV");
  const channels = v.getUint16(22, true);
  const sampleRate = v.getUint32(24, true);
  const bitsPerSample = v.getUint16(34, true);
  if (bitsPerSample !== 16) throw new Error("Only 16-bit PCM WAV supported");
  let off = 12;
  while (off < buf.length - 8) {
    const id = String.fromCharCode(buf[off], buf[off+1], buf[off+2], buf[off+3]);
    const sz = v.getUint32(off + 4, true);
    if (id === "data") {
      return { channels, sampleRate, bitsPerSample, numSamples: sz / (channels * 2), dataOffset: off + 8, dataSize: sz };
    }
    off += 8 + sz + (sz % 2);
  }
  throw new Error("No data chunk found in WAV");
}

/* ══════════════════════════════════════════════════════
   WAV → MCA  (DSP-ADPCM encode)
   version: MCA version byte (3 or 4, default 4)
══════════════════════════════════════════════════════ */
function wavToMca(buf, loopStart = 0, loopEnd = 0, version = 4) {
  const { channels, sampleRate, numSamples, dataOffset, dataSize } = parseWAVHeader(buf);
  const pcm = new Int16Array(buf.buffer, buf.byteOffset + dataOffset, dataSize / 2);

  const { encoded, coefs } = encodeDSP(pcm, channels, numSamples);

  const COEF_BLOCK = 0x30;
  const headSize = 0x20 + channels * COEF_BLOCK;
  const out = new ArrayBuffer(headSize + encoded.length);
  const v = new DataView(out);
  const ob = new Uint8Array(out);

  // Magic "MADP" big-endian
  ob[0] = 0x4D; ob[1] = 0x41; ob[2] = 0x44; ob[3] = 0x50;
  v.setUint8(0x04, version & 0xFF);
  v.setUint8(0x08, channels);
  v.setUint16(0x0A, 0x100, true);       // interleave = 256
  v.setUint32(0x0C, numSamples, true);
  v.setUint16(0x10, sampleRate, true);
  v.setUint32(0x14, loopStart, true);
  v.setUint32(0x18, loopEnd, true);
  v.setUint32(0x1C, headSize, true);

  let cOff = 0x20;
  for (let ch = 0; ch < channels; ch++) {
    for (let i = 0; i < 16; i++) v.setInt16(cOff + i * 2, coefs[ch][i], true);
    cOff += COEF_BLOCK;
  }

  ob.set(encoded, headSize);
  return new Uint8Array(out);
}

/* ══════════════════════════════════════════════════════
   DSP-ADPCM ENCODER
   Uses 8 fixed coefficient pairs (standard Nintendo set).
   Brute-forces best scale + coef pair per 14-sample frame.
══════════════════════════════════════════════════════ */
function encodeDSP(pcm, channels, numSamples) {
  const bytesPerCh = Math.ceil(numSamples / 14) * 8;
  const encoded = new Uint8Array(channels * bytesPerCh);
  const coefs = [];

  for (let ch = 0; ch < channels; ch++) {
    const mono = new Int16Array(numSamples);
    for (let s = 0; s < numSamples; s++) mono[s] = pcm[s * channels + ch];
    const chCoefs = getCoefs();
    coefs.push(chCoefs);
    encodeMono(mono, chCoefs, encoded, ch * bytesPerCh);
  }
  return { encoded, coefs };
}

// Standard Nintendo DSP-ADPCM coefficient set (8 pairs)
function getCoefs() {
  return new Int16Array([
    0x0000, 0x0000,
    0x0800, 0x0000,
    0x0000, 0x0800,
    0x0400, 0x0400,
    0x1000, 0xF800,
    0x0E00, 0xFA00,
    0x0C00, 0xFC00,
    0x1800, 0xF000,
  ]);
}

function encodeMono(pcm, coefs, out, outOff) {
  const SPB = 14, BPB = 8;
  const frames = Math.ceil(pcm.length / SPB);
  let hist1 = 0, hist2 = 0;

  for (let f = 0; f < frames; f++) {
    // Find best (coef index, scale) pair for this frame
    let bestScale = 0, bestCI = 0, bestErr = Infinity;
    for (let ci = 0; ci < 8; ci++) {
      const c1 = coefs[ci * 2], c2 = coefs[ci * 2 + 1];
      for (let sc = 0; sc < 16; sc++) {
        let err = 0, h1 = hist1, h2 = hist2;
        const scale = 1 << sc;
        for (let s = 0; s < SPB && f * SPB + s < pcm.length; s++) {
          const pred = ((c1 * h1 + c2 * h2) + 1024) >> 11;
          const enc = Math.max(-8, Math.min(7, Math.round((pcm[f * SPB + s] - pred) / scale)));
          const dec = Math.max(-32768, Math.min(32767, pred + enc * scale));
          err += Math.abs(pcm[f * SPB + s] - dec);
          h2 = h1; h1 = dec;
        }
        if (err < bestErr) { bestErr = err; bestScale = sc; bestCI = ci; }
      }
    }

    // Write frame with best parameters
    out[outOff + f * BPB] = (bestCI << 4) | bestScale;
    const c1 = coefs[bestCI * 2], c2 = coefs[bestCI * 2 + 1];
    const scale = 1 << bestScale;

    for (let s = 0; s < SPB; s += 2) {
      const si = f * SPB + s;
      let hi = 0, lo = 0;
      if (si < pcm.length) {
        const pred = ((c1 * hist1 + c2 * hist2) + 1024) >> 11;
        const enc = Math.max(-8, Math.min(7, Math.round((pcm[si] - pred) / scale)));
        hist2 = hist1;
        hist1 = Math.max(-32768, Math.min(32767, pred + enc * scale));
        hi = (enc & 0xF) << 4;
      }
      if (si + 1 < pcm.length) {
        const pred = ((c1 * hist1 + c2 * hist2) + 1024) >> 11;
        const enc = Math.max(-8, Math.min(7, Math.round((pcm[si + 1] - pred) / scale)));
        hist2 = hist1;
        hist1 = Math.max(-32768, Math.min(32767, pred + enc * scale));
        lo = enc & 0xF;
      }
      out[outOff + f * BPB + 1 + (s >> 1)] = hi | lo;
    }
  }
}
