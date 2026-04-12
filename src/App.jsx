// MCA ↔ WAV Converter + LOOP POINT EDITOR (vgmstream-style)

import React, { useState, useRef } from "react";

export default function App() {
  const [file, setFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [status, setStatus] = useState("Idle");
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);
  const audioRef = useRef(null);

  const handleFile = async (e) => {
    const f = e.target.files[0];
    setFile(f);

    const buffer = new Uint8Array(await f.arrayBuffer());

    // If MCA, auto-read loop points
    if (f.name.endsWith(".mca")) {
      try {
        const meta = parseMCA(buffer);
        setLoopStart(meta.loopStart || 0);
        setLoopEnd(meta.loopEnd || 0);
      } catch {}
    }

    setAudioUrl(URL.createObjectURL(f));
  };

  const convert = async (mode) => {
    if (!file) return;

    setStatus("Processing...");
    const buffer = new Uint8Array(await file.arrayBuffer());

    let result;

    if (mode === "mca2wav") {
      result = mcaToWav(buffer);
    } else {
      result = wavToMca(buffer, loopStart, loopEnd);
    }

    const blob = new Blob([result], {
      type: mode === "mca2wav" ? "audio/wav" : "application/octet-stream",
    });

    const url = URL.createObjectURL(blob);
    setAudioUrl(url);
    setStatus("Done");
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;

    const t = audioRef.current.currentTime * 44100;

    if (loopEnd > loopStart && t >= loopEnd) {
      audioRef.current.currentTime = loopStart / 44100;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-6">
      <h1 className="text-3xl font-bold mb-4">MCA Converter + Loop Editor</h1>

      <input type="file" onChange={handleFile} className="mb-4" />

      <div className="flex gap-4 mb-4">
        <button className="bg-blue-500 px-4 py-2 rounded" onClick={() => convert("mca2wav")}>
          MCA → WAV
        </button>

        <button className="bg-green-500 px-4 py-2 rounded" onClick={() => convert("wav2mca")}>
          WAV → MCA (with loop)
        </button>
      </div>

      {/* LOOP EDITOR */}
      <div className="bg-gray-800 p-4 rounded mb-4 w-full max-w-md">
        <h2 className="text-lg mb-2">Loop Points (samples)</h2>

        <div className="flex flex-col gap-2">
          <input
            type="number"
            placeholder="Loop Start"
            value={loopStart}
            onChange={(e) => setLoopStart(Number(e.target.value))}
            className="p-2 text-black"
          />

          <input
            type="number"
            placeholder="Loop End"
            value={loopEnd}
            onChange={(e) => setLoopEnd(Number(e.target.value))}
            className="p-2 text-black"
          />
        </div>

        <p className="text-sm mt-2 opacity-70">
          Tip: 44100 samples = 1 second
        </p>
      </div>

      <p className="mb-4">Status: {status}</p>

      {audioUrl && (
        <audio
          ref={audioRef}
          controls
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
        />
      )}
    </div>
  );
}

/* ======================================================
   MCA PARSER (WITH LOOP SUPPORT)
====================================================== */

function parseMCA(buffer) {
  const view = new DataView(buffer.buffer);

  const channels = view.getUint8(0x08);
  const sampleRate = view.getUint32(0x0C, true);
  const dataOffset = view.getUint32(0x20, true);
  const dataSize = view.getUint32(0x24, true);

  const loopStart = view.getUint32(0x28, true);
  const loopEnd = view.getUint32(0x2C, true);

  let coefs = [];
  let coefOffset = 0x40;

  for (let ch = 0; ch < channels; ch++) {
    const chCoefs = new Int16Array(32);
    for (let i = 0; i < 32; i++) {
      chCoefs[i] = view.getInt16(coefOffset + i * 2, true);
    }
    coefs.push(chCoefs);
    coefOffset += 0x40;
  }

  const audioData = buffer.slice(dataOffset, dataOffset + dataSize);

  return { channels, sampleRate, coefs, audioData, loopStart, loopEnd };
}

/* ======================================================
   WAV → MCA (WITH LOOP WRITE)
====================================================== */

function wavToMca(buffer, loopStart = 0, loopEnd = 0) {
  const { channels, sampleRate, pcm } = parseWav(buffer);

  const dsp = encodeDSP(pcm, channels);

  const out = new ArrayBuffer(0x40 + dsp.length);
  const view = new DataView(out);

  writeStr(view, 0, "MADP");
  view.setUint8(0x08, channels);
  view.setUint32(0x0C, sampleRate, true);
  view.setUint32(0x20, 0x40, true);
  view.setUint32(0x24, dsp.length, true);

  // LOOP POINTS
  view.setUint32(0x28, loopStart, true);
  view.setUint32(0x2C, loopEnd, true);

  new Uint8Array(out).set(dsp, 0x40);

  return new Uint8Array(out);
}

/* ======================================================
   (rest unchanged: DSP decode, WAV builder, etc.)
====================================================== */
