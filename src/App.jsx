// MCA ↔ WAV Converter + Loop Point Editor
// Based on vgmstream src/meta/mca.c and onepiecefreak3/MCAConverter
//
// MADP Header Layout:
//   0x00  u32 BE  "MADP" magic
//   0x04  u16 LE  version (3, 4, 5)
//   0x08  u8      channel count
//   0x0A  u16 LE  interleave block size (always 0x100)
//   0x0C  u32 LE  num_samples
//   0x10  u16 LE  sample_rate
//   0x14  u32 LE  loop_start_sample
//   0x18  u32 LE  loop_end_sample (>0 = looping)
//   0x1C  u16 LE  head_size (v4/v5 only)
//   0x20  u32 LE  data_size (v3/v4)
//   0x28  u16 LE  coef_shift (v4/v5)
//   0x2C  u32 LE  data_size (v5 only — DIFFERENT offset from v4)
//
// Coefficient layout (all versions):
//   coef_spacing = 0x30 bytes per channel
//   coef_start   = head_size - coef_spacing * channels
//   coef_offset  = coef_start + coef_shift * 0x14
//
// Version notes:
//   v3: RE Mercenaries 3D, SSF4 3D          — head derived, data_size @ 0x20, coef_shift=0
//   v4: EX Troopers, Ace Attorney 5          — head_size @ 0x1C, data_size @ 0x20
//   v5: Ace Attorney 6, MH Generations / 4U — head_size @ 0x1C, data_size @ 0x2C

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
          ["Version", "v" + m.version],
          ["Channels", m.channels],
          ["Sample rate", m.sampleRate + " Hz"],
          ["Samples", m.numSamples.toLocaleString()],
          ["Loop start", m.loopStart.toLocaleString()],
          ["Loop end", m.loopEnd.toLocaleString()],
        ]);
        setStatus({ msg: `MCA v${m.version} parsed — loop points loaded`, cls: "ok" });
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
      console.error(e);
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
      console.error(e);
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
    if (!audioRef.current || loopEnd <= loopStart) return;
    const sr = 44100;
    const t = audioRef.current.currentTime * sr;
    if (t >= loopEnd) audioRef.current.currentTime = loopStart / sr;
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "2rem 1rem", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, marginBottom: 4 }}>MCA ↔ WAV Converter</h1>
      <p style={{ fontSize: 13, color: "#888", marginBottom: 24 }}>
        Capcom MADP · DSP-ADPCM · v3 / v4 / v5 support
      </p>

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

      <div style={card}>
        <div style={cardTitle}>
          Loop points <span style={{ fontWeight: 400, fontSize: 12, color: "#aaa" }}>(samples · 44100 = 1 s)</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={fieldLabel}>
            Loop start
            <input type="number" value={loopStart} min={0} onChange={(e) => setLoopStart(Number(e.target.value))} style={numInput} />
          </label>
          <label style={fieldLabel}>
            Loop end
            <input type="number" value={loopEnd} min={0} onChange={(e) => setLoopEnd(Number(e.target.value))} style={numInput} />
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 13, color: "#888" }}>
          <span>Output MCA version</span>
          <select value={version} onChange={(e) => setVersion(Number(e.target.value))} style={{ ...numInput, width: "auto" }}>
            <option value={3}>v3 — RE Mercenaries, SSF4 3D</option>
            <option value={4}>v4 — EX Troopers, AA5 (default)</option>
            <option value={5}>v5 — AA6, MH Generations / 4U</option>
          </select>
        </div>
      </div>

      <div style={card}>
        <div style={cardTitle}>Convert</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={decode} disabled={fileExt !== "mca"} style={btn}>MCA → WAV decode</button>
          <button onClick={encode} disabled={fileExt !== "wav"} style={btn}>WAV → MCA encode</button>
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
            ↓ Download {outName}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Styles ─── */
const card       = { background: "#fff", border: "0.5px solid #e0e0e0", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 12 };
const cardTitle  = { fontSize: 11, fontWeight: 500, color: "#888", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 };
const dropZone   = { display: "block", border: "1.5px dashed #ccc", borderRadius: 8, padding: "1.5rem 1rem", textAlign: "center", cursor: "pointer" };
const metricCard = { background: "#f5f5f5", borderRadius: 8, padding: "8px 10px" };
const fieldLabel = { display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "#888" };
const numInput   = { fontFamily: "monospace", fontSize: 13, padding: "6px 10px", borderRadius: 8, border: "0.5px solid #ccc", background: "#f5f5f5" };
const btn        = { fontFamily: "sans-serif", fontSize: 13, fontWeight: 500, padding: "7px 16px", borderRadius: 8, border: "0.5px solid #ccc", background: "transparent", cursor: "pointer" };
const statusBar  = { fontSize: 13, padding: "6px 10px", borderRadius: 8, marginTop: 10, background: "#f5f5f5" };
const statusOk   = { background: "#e6f9ee", color: "#1a7a3f" };
const statusErr  = { background: "#fdecea", color: "#b71c1c" };

/* ─── Utilities ─── */
function tick() { return new Promise((r) => setTimeout(r, 20)); }
function baseName(name) { return name.replace(/\.[^.]+$/, ""); }

/* ══════════════════════════════════════════════════════
   MCA HEADER PARSER — all three versions (vgmstream-accurate)

   The key v3/v4/v5 differences are WHERE data_size lives:
     v3:  data_size @ 0x20,  head_size = fileSize - data_size, coef_shift = 0
     v4:  data_size @ 0x20,  head_size @ 0x1C,  coef_shift @ 0x28
     v5:  data_size @ 0x2C,  head_size @ 0x1C,  coef_shift @ 0x28  ← only change from v4

   Coefficient offset formula (same for all versions):
     coef_start  = head_size - 0x30 * channels
     coef_offset = coef_start + coef_shift * 0x14
══════════════════════════════════════════════════════ */
function parseMCAHeader(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset);
  const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3]);
  if (magic !== "MADP") throw new Error("Not a MADP/MCA file (magic: " + magic + ")");

  const version    = dv.getUint16(0x04, true);
  const channels   = dv.getUint8(0x08);
  if (channels < 1) throw new Error("Invalid channel count: " + channels);
  const interleave = dv.getUint16(0x0A, true) || 0x100;
  const numSamples = dv.getUint32(0x0C, true);
  const sampleRate = dv.getUint16(0x10, true);
  const loopStart  = dv.getUint32(0x14, true);
  const loopEnd    = dv.getUint32(0x18, true);
  const fileSize   = buf.length;
  const COEF_SPACING = 0x30;

  let headSize, dataSize, coefShift;

  if (version <= 3) {
    dataSize  = dv.getUint32(0x20, true);
    headSize  = fileSize - dataSize;           // derived: everything before the audio
    coefShift = 0;
  } else if (version === 4) {
    headSize  = dv.getUint16(0x1C, true);
    dataSize  = dv.getUint32(0x20, true);      // data_size at 0x20
    coefShift = dv.getUint16(0x28, true);
  } else {
    // v5+: ONLY difference from v4 is data_size moves to 0x2C
    headSize  = dv.getUint16(0x1C, true);
    dataSize  = dv.getUint32(0x2C, true);      // data_size at 0x2C  ← the v5 fix
    coefShift = dv.getUint16(0x28, true);
  }

  const startOffset = version <= 3 ? headSize : fileSize - dataSize;
  const coefStart   = headSize - COEF_SPACING * channels;
  const coefOffset  = coefStart + coefShift * 0x14;

  if (coefOffset < 0 || coefOffset + channels * COEF_SPACING > headSize) {
    throw new Error(`Coef offset out of range: 0x${coefOffset.toString(16)}`);
  }
  if (startOffset < 0 || startOffset > fileSize) {
    throw new Error(`Audio start offset out of range: 0x${startOffset.toString(16)}`);
  }

  // Read coefficients — 16 LE s16 values per channel, spaced 0x30 bytes apart
  const coefs = [];
  for (let ch = 0; ch < channels; ch++) {
    const c    = new Int16Array(16);
    const base = coefOffset + ch * COEF_SPACING;
    for (let i = 0; i < 16; i++) c[i] = dv.getInt16(base + i * 2, true);
    coefs.push(c);
  }

  return { version, channels, interleave, numSamples, sampleRate, loopStart, loopEnd, headSize, dataSize, startOffset, coefOffset, coefs };
}

/* ══════════════════════════════════════════════════════
   MCA → WAV
══════════════════════════════════════════════════════ */
function mcaToWav(buf) {
  const { channels, sampleRate, numSamples, startOffset, coefs, interleave } = parseMCAHeader(buf);
  const audioData = buf.slice(startOffset);
  const pcm = decodeDSP(audioData, channels, numSamples, coefs, interleave);
  return buildWAV(pcm, channels, sampleRate);
}

/* ══════════════════════════════════════════════════════
   DSP-ADPCM DECODER

   Frame = 8 bytes:
     byte 0      header: high nibble = coef index (0-7), low nibble = scale exp
     bytes 1-7   14 nibbles = 14 samples, high nibble first (even=high, odd=low)

   Interleave: data is laid out as repeating groups of (channels × interleave bytes).
   Each channel occupies one interleave-sized block before the next channel starts.
   
   History state (hist1, hist2) is per-channel and MUST NOT be shared between channels.
   
   Decode:
     scale  = 1 << (header & 0xF)
     ci     = (header >> 4) & 0x7
     nibble = sign_extend_4bit(raw)
     sample = clamp16( (nibble*scale<<11 + 1024 + c1*hist1 + c2*hist2) >> 11 )
══════════════════════════════════════════════════════ */
function decodeDSP(src, channels, totalSamples, coefs, interleave) {
  const SPB = 14; // samples per frame
  const BPB = 8;  // bytes per frame
  const fpI = Math.floor(interleave / BPB); // frames per interleave block

  const out    = new Int16Array(totalSamples * channels);
  const hist1  = new Int32Array(channels); // separate per channel — CRITICAL for clean audio
  const hist2  = new Int32Array(channels);
  const decoded = new Int32Array(channels);

  let blockBase = 0; // start of current interleave block group in src

  while (decoded[0] < totalSamples) {
    for (let ch = 0; ch < channels; ch++) {
      const chBase     = blockBase + ch * interleave;
      const samplesLeft = totalSamples - decoded[ch];
      const framesDo   = Math.min(fpI, Math.ceil(samplesLeft / SPB));

      for (let f = 0; f < framesDo; f++) {
        const fBase = chBase + f * BPB;
        if (fBase >= src.length) break;

        const header = src[fBase];
        const scale  = 1 << (header & 0xF);
        const ci     = (header >> 4) & 0x7;
        const c1     = coefs[ch][ci * 2];
        const c2     = coefs[ch][ci * 2 + 1];

        for (let s = 0; s < SPB && decoded[ch] < totalSamples; s++) {
          const bIdx = fBase + 1 + (s >> 1);
          if (bIdx >= src.length) break;

          const raw    = (s & 1) === 0 ? (src[bIdx] >> 4) & 0xF : src[bIdx] & 0xF;
          const nibble = raw >= 8 ? raw - 16 : raw; // sign-extend from 4 bits

          let sample = (((nibble * scale) << 11) + 1024 + c1 * hist1[ch] + c2 * hist2[ch]) >> 11;
          if (sample >  32767) sample =  32767;
          if (sample < -32768) sample = -32768;

          hist2[ch] = hist1[ch];
          hist1[ch] = sample;

          out[decoded[ch] * channels + ch] = sample;
          decoded[ch]++;
        }
      }
    }

    blockBase += channels * interleave;
    if (blockBase >= src.length) break;
  }

  return out;
}

/* ══════════════════════════════════════════════════════
   WAV BUILDER — 16-bit PCM RIFF
══════════════════════════════════════════════════════ */
function buildWAV(pcm, channels, sampleRate) {
  const dataBytes = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const dv  = new DataView(buf);
  const ws  = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); dv.setUint32(4, 36 + dataBytes, true); ws(8, "WAVE");
  ws(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true);
  dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * channels * 2, true);
  dv.setUint16(32, channels * 2, true);
  dv.setUint16(34, 16, true);
  ws(36, "data"); dv.setUint32(40, dataBytes, true);
  new Int16Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}

/* ══════════════════════════════════════════════════════
   WAV HEADER PARSER
══════════════════════════════════════════════════════ */
function parseWAVHeader(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset);
  if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== "RIFF") throw new Error("Not a RIFF WAV");
  const channels      = dv.getUint16(22, true);
  const sampleRate    = dv.getUint32(24, true);
  const bitsPerSample = dv.getUint16(34, true);
  if (bitsPerSample !== 16) throw new Error("Only 16-bit PCM WAV is supported");
  let off = 12;
  while (off < buf.length - 8) {
    const id = String.fromCharCode(buf[off], buf[off+1], buf[off+2], buf[off+3]);
    const sz = dv.getUint32(off + 4, true);
    if (id === "data") {
      return { channels, sampleRate, bitsPerSample, numSamples: Math.floor(sz / (channels * 2)), dataOffset: off + 8, dataSize: sz };
    }
    off += 8 + sz + (sz % 2);
  }
  throw new Error("No data chunk found");
}

/* ══════════════════════════════════════════════════════
   WAV → MCA ENCODER
   
   Header layout written per version:
   
   v3:  "MADP" | ver=3 | ch | interleave | numSamples | sampleRate |
        loopStart | loopEnd | [gap] | data_size@0x20 |
        [coef blocks] | [audio data]
   
   v4:  same + head_size@0x1C, data_size@0x20, coef_shift@0x28
   
   v5:  same as v4 but data_size@0x2C instead of 0x20
   
   coef_shift=0 means coefs are placed directly:
     coef_start = head_size - 0x30 * channels
     (coef_offset = coef_start + 0 * 0x14 = coef_start)
══════════════════════════════════════════════════════ */
function wavToMca(buf, loopStart = 0, loopEnd = 0, version = 4) {
  const { channels, sampleRate, numSamples, dataOffset, dataSize } = parseWAVHeader(buf);
  const pcm = new Int16Array(buf.buffer, buf.byteOffset + dataOffset, dataSize / 2);

  const { encoded, coefs } = encodeDSP(pcm, channels, numSamples);

  const COEF_SPACING = 0x30;
  const headSize = 0x2C + channels * COEF_SPACING; // coef_shift=0, so coefs are at end of header
  const totalSize = headSize + encoded.length;

  const out = new ArrayBuffer(totalSize);
  const dv  = new DataView(out);
  const ob  = new Uint8Array(out);

  // Magic "MADP" big-endian
  ob[0] = 0x4D; ob[1] = 0x41; ob[2] = 0x44; ob[3] = 0x50;
  dv.setUint16(0x04, version, true);
  dv.setUint8(0x08, channels);
  dv.setUint16(0x0A, 0x100, true);       // interleave = 0x100
  dv.setUint32(0x0C, numSamples, true);
  dv.setUint16(0x10, sampleRate, true);
  dv.setUint32(0x14, loopStart, true);
  dv.setUint32(0x18, loopEnd, true);

  if (version <= 3) {
    dv.setUint32(0x20, encoded.length, true); // data_size @ 0x20
  } else if (version === 4) {
    dv.setUint16(0x1C, headSize, true);       // head_size @ 0x1C
    dv.setUint32(0x20, encoded.length, true); // data_size @ 0x20
    dv.setUint16(0x28, 0, true);              // coef_shift = 0
  } else {
    // v5
    dv.setUint16(0x1C, headSize, true);       // head_size @ 0x1C
    dv.setUint16(0x28, 0, true);              // coef_shift = 0
    dv.setUint32(0x2C, encoded.length, true); // data_size @ 0x2C  ← v5 difference
  }

  // Write coefficient blocks (coef_shift=0 so coefStart = headSize - COEF_SPACING*ch)
  const coefStart = headSize - COEF_SPACING * channels;
  for (let ch = 0; ch < channels; ch++) {
    const base = coefStart + ch * COEF_SPACING;
    for (let i = 0; i < 16; i++) dv.setInt16(base + i * 2, coefs[ch][i], true);
  }

  ob.set(encoded, headSize);
  return new Uint8Array(out);
}

/* ══════════════════════════════════════════════════════
   DSP-ADPCM ENCODER
   
   1. Encode each channel independently into a flat buffer
   2. Re-interleave into 0x100-byte blocks for the output
══════════════════════════════════════════════════════ */
function encodeDSP(pcm, channels, numSamples) {
  const INTERLEAVE  = 0x100;
  const BPB = 8, SPB = 14;
  const framesPerCh    = Math.ceil(numSamples / SPB);
  const framesPerBlock = INTERLEAVE / BPB; // 32 frames per 0x100-byte block
  const totalBlocks    = Math.ceil(framesPerCh / framesPerBlock);

  const coefs   = [];
  const chFlat  = [];

  for (let ch = 0; ch < channels; ch++) {
    const mono = new Int16Array(numSamples);
    for (let s = 0; s < numSamples; s++) mono[s] = pcm[s * channels + ch];
    const c = getStandardCoefs();
    coefs.push(c);
    chFlat.push(encodeMonoFlat(mono, c));
  }

  // Interleave channel data into final buffer
  const encoded = new Uint8Array(totalBlocks * channels * INTERLEAVE);
  for (let block = 0; block < totalBlocks; block++) {
    for (let ch = 0; ch < channels; ch++) {
      const srcOff = block * INTERLEAVE;
      const dstOff = (block * channels + ch) * INTERLEAVE;
      const len    = Math.min(INTERLEAVE, chFlat[ch].length - srcOff);
      if (len > 0) encoded.set(chFlat[ch].subarray(srcOff, srcOff + len), dstOff);
    }
  }

  return { encoded, coefs };
}

// Standard Nintendo DSP-ADPCM coefficient table (8 pairs = 16 s16 values)
function getStandardCoefs() {
  return new Int16Array([
    0x0000, 0x0000,  // pair 0: silence predictor
    0x0800, 0x0000,  // pair 1: 1st order, coef=1.0
    0x0000, 0x0800,  // pair 2: pure delay
    0x0400, 0x0400,  // pair 3: average
    0x1000, 0xF800,  // pair 4: 2.0 / -1.0
    0x0E00, 0xFA00,  // pair 5: 1.75 / -0.75
    0x0C00, 0xFC00,  // pair 6: 1.5 / -0.5
    0x1800, 0xF000,  // pair 7: 3.0 / -2.0
  ]);
}

// Encode one mono channel to a flat (non-interleaved) DSP frame buffer
function encodeMonoFlat(pcm, coefs) {
  const SPB = 14, BPB = 8;
  const frames = Math.ceil(pcm.length / SPB);
  const out    = new Uint8Array(frames * BPB);
  let hist1 = 0, hist2 = 0;

  for (let f = 0; f < frames; f++) {
    // Find best (coef index, scale exponent) pair for this 14-sample frame
    let bestCI = 0, bestScale = 0, bestErr = Infinity;

    for (let ci = 0; ci < 8; ci++) {
      const c1 = coefs[ci * 2], c2 = coefs[ci * 2 + 1];
      for (let sc = 0; sc < 16; sc++) {
        const scale = 1 << sc;
        let err = 0, h1 = hist1, h2 = hist2;
        for (let s = 0; s < SPB; s++) {
          const si = f * SPB + s;
          if (si >= pcm.length) break;
          const pred = ((c1 * h1 + c2 * h2) + 1024) >> 11;
          const enc  = Math.max(-8, Math.min(7, Math.round((pcm[si] - pred) / scale)));
          const dec  = Math.max(-32768, Math.min(32767, pred + enc * scale));
          const e    = pcm[si] - dec;
          err += e * e; // mean squared error
          h2 = h1; h1 = dec;
        }
        if (err < bestErr) { bestErr = err; bestCI = ci; bestScale = sc; }
      }
    }

    // Write frame header byte
    out[f * BPB] = (bestCI << 4) | bestScale;

    // Encode and write the 14 sample nibbles using chosen parameters
    const c1    = coefs[bestCI * 2], c2 = coefs[bestCI * 2 + 1];
    const scale = 1 << bestScale;

    for (let s = 0; s < SPB; s += 2) {
      const si = f * SPB + s;
      let hi = 0, lo = 0;

      if (si < pcm.length) {
        const pred = ((c1 * hist1 + c2 * hist2) + 1024) >> 11;
        const enc  = Math.max(-8, Math.min(7, Math.round((pcm[si] - pred) / scale)));
        hist2 = hist1;
        hist1 = Math.max(-32768, Math.min(32767, pred + enc * scale));
        hi = (enc & 0xF) << 4;
      }
      if (si + 1 < pcm.length) {
        const pred = ((c1 * hist1 + c2 * hist2) + 1024) >> 11;
        const enc  = Math.max(-8, Math.min(7, Math.round((pcm[si + 1] - pred) / scale)));
        hist2 = hist1;
        hist1 = Math.max(-32768, Math.min(32767, pred + enc * scale));
        lo = enc & 0xF;
      }
      out[f * BPB + 1 + (s >> 1)] = hi | lo;
    }
  }

  return out;
    }
