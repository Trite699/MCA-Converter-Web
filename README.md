# MCA ↔ WAV Converter (Web)

A lightweight **browser-based converter** for Capcom `.mca` (MADP) audio files and standard `.wav` files.

Supports:
- MCA → WAV (decode)
- WAV → MCA (encode)
- Loop points editing
- Multiple MCA versions (v3 / v4 / v5)
- In-browser playback

No installation required — runs entirely in your browser.

---

##  Features

-  Convert **MCA → WAV**
-  Convert **WAV → MCA**
-  Edit loop start/end points
-  Supports Capcom MADP formats:
  - v3 (RE Mercs, SSF4)
  - v4 (EX Troopers, AA5)
  - v5 (AA6, MH4U)
  -  Built-in audio preview player
  
  

---

##  How to Use

### 1. Open the Tool
- Open `index.html` in your browser  
  **OR**
- Deploy it on a static host (Render, GitHub Pages, etc.)

---

### 2. Load a File
- Click the upload box
- Select:
  - `.mca` file → enables **MCA → WAV**
  - `.wav` file → enables **WAV → MCA**

---

### 3. (Optional) Set Loop Points
- Adjust:
  - **Loop Start** (in samples)
  - **Loop End** (in samples)

  
If you loaded an MCA file, loop points auto-fill automatically.

---

### 4. Choose MCA Version (for encoding)
- v3 / v4 / v5 depending on your target game

---

### 5. Convert
- Click:
  - **MCA → WAV** to decode
  - **WAV → MCA** to encode

---

### 6. Preview & Download
- Preview audio in the built-in player
- Click **Download** to save the file

---

##  Issues
- Only supports 16-bit PCM WAV
Large files may use more memory (runs in browser)
No drag-and-drop (click upload only)
- Encoded audio may have a few issues when playing in the game (The Encoding needs to be fixed)
