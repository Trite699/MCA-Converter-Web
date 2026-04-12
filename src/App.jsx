import React, { useState, useRef, useEffect } from "react";
import "./styles.css"; // move your CSS into this file

export default function MCAConverter() {
  const [fileData, setFileData] = useState(null);
  const [fileExt, setFileExt] = useState("");
  const [fileName, setFileName] = useState("");

  const [status, setStatus] = useState({ text: "", type: "" });
  const [meta, setMeta] = useState([]);

  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);
  const [version, setVersion] = useState(4);

  const [outBlob, setOutBlob] = useState(null);
  const [outName, setOutName] = useState("");

  const [playerUrl, setPlayerUrl] = useState("");
  const [showPlayer, setShowPlayer] = useState(false);
  const [showDl, setShowDl] = useState(false);

  const playerRef = useRef(null);
  const fileInputRef = useRef(null);

  const parsedSampleRate = useRef(44100);

  function baseName(n) {
    return n.replace(/\.[^.]+$/, "");
  }

  function setStatusMsg(msg, type = "") {
    setStatus({ text: msg, type });
  }

  function handleFileUpload(e) {
    const f = e.target.files[0];
    if (!f) return;

    setFileName(f.name);
    const ext = f.name.split(".").pop().toLowerCase();
    setFileExt(ext);

    const reader = new FileReader();
    reader.onload = () => {
      const data = new Uint8Array(reader.result);
      setFileData(data);
      setShowPlayer(false);
      setShowDl(false);
      setStatus({ text: "", type: "" });

      if (ext === "wav") {
        try {
          const w = parseWAVHeader(data);
          parsedSampleRate.current = w.sampleRate;

          setMeta([
            ["Channels", w.channels],
            ["Rate", w.sampleRate + " Hz"],
            ["Bit depth", w.bitsPerSample + "b"],
            ["Samples", w.numSamples],
          ]);

          setStatusMsg("WAV loaded", "ok");
        } catch (err) {
          setStatusMsg(err.message, "err");
        }
      } else {
        setStatusMsg("MCA parsing not included here yet", "");
      }
    };

    reader.readAsArrayBuffer(f);
  }

  function handleDecode() {
    setStatusMsg("Decoding...");
    try {
      const wav = fileData; // placeholder (your decode function here)
      const blob = new Blob([wav], { type: "audio/wav" });
      const name = baseName(fileName) + ".wav";

      setOutBlob(blob);
      setOutName(name);

      const url = URL.createObjectURL(blob);
      setPlayerUrl(url);
      setShowPlayer(true);
      setShowDl(true);

      setStatusMsg("Decoded → " + name, "ok");
    } catch (e) {
      setStatusMsg(e.message, "err");
    }
  }

  function handleEncode() {
    setStatusMsg("Encoding...");
    try {
      const mca = fileData; // placeholder
      const blob = new Blob([mca], { type: "application/octet-stream" });
      const name = baseName(fileName) + ".mca";

      setOutBlob(blob);
      setOutName(name);
      setShowDl(true);

      setStatusMsg("Encoded → " + name, "ok");
    } catch (e) {
      setStatusMsg(e.message, "err");
    }
  }

  function downloadFile() {
    if (!outBlob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(outBlob);
    a.download = outName;
    a.click();
  }

  function parseWAVHeader(buf) {
    const dv = new DataView(buf.buffer);
    if (
      String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== "RIFF"
    )
      throw new Error("Not a WAV");

    const channels = dv.getUint16(22, true);
    const sampleRate = dv.getUint32(24, true);
    const bitsPerSample = dv.getUint16(34, true);

    return {
      channels,
      sampleRate,
      bitsPerSample,
      numSamples: 0,
    };
  }

  useEffect(() => {
    if (!playerRef.current) return;

    const player = playerRef.current;

    const handler = () => {
      if (loopEnd > loopStart) {
        if (player.currentTime * parsedSampleRate.current >= loopEnd) {
          player.currentTime = loopStart / parsedSampleRate.current;
        }
      }
    };

    player.addEventListener("timeupdate", handler);
    return () => player.removeEventListener("timeupdate", handler);
  }, [loopStart, loopEnd]);

  return (
    <div className="wrap">
      <h1>MCA ↔ WAV Converter</h1>
      <p className="sub">React version</p>

      {/* FILE INPUT */}
      <div className="card">
        <div className="card-title">Input file</div>

        <div
          className="drop"
          onClick={() => fileInputRef.current.click()}
        >
          <span>{fileName || "Click to choose file"}</span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".wav,.mca"
          hidden
          onChange={handleFileUpload}
        />

        {meta.length > 0 && (
          <div className="meta-grid">
            {meta.map(([k, v], i) => (
              <div key={i} className="metric">
                <div className="metric-label">{k}</div>
                <div className="metric-val">{v}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* LOOP */}
      <div className="card">
        <div className="card-title">Loop</div>

        <input
          type="number"
          value={loopStart}
          onChange={(e) => setLoopStart(+e.target.value)}
        />
        <input
          type="number"
          value={loopEnd}
          onChange={(e) => setLoopEnd(+e.target.value)}
        />

        <select
          value={version}
          onChange={(e) => setVersion(+e.target.value)}
        >
          <option value={3}>v3</option>
          <option value={4}>v4</option>
          <option value={5}>v5</option>
        </select>
      </div>

      {/* BUTTONS */}
      <div className="card">
        <button disabled={fileExt !== "mca"} onClick={handleDecode}>
          MCA → WAV
        </button>
        <button disabled={fileExt !== "wav"} onClick={handleEncode}>
          WAV → MCA
        </button>

        {status.text && (
          <div className={`status ${status.type}`}>
            {status.text}
          </div>
        )}
      </div>

      {/* PLAYER */}
      {showPlayer && (
        <div className="card">
          <audio ref={playerRef} controls src={playerUrl} />
        </div>
      )}

      {/* DOWNLOAD */}
      {showDl && (
        <div className="card">
          <button onClick={downloadFile}>
            Download {outName}
          </button>
        </div>
      )}
    </div>
  );
      }
