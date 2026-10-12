# Camera scoreboard observer — proof of concept

**Never authoritative:** Reads calibrated scoreboard LED digits from a USB/IP camera or image. Emits JSON with `authority:false` and confidence per field. No HTTP scoring writes exist in the code.

Run `python -m pip install opencv-python numpy`, adjust pixel rectangles in `config.example.json` to your real scoreboard camera image, then use:

```sh
python reader.py --config config.example.json --image captured-frame.png --once
python reader.py --config config.example.json --source 0 --output last-observation.json
python -m unittest -v test_reader.py
```

### Engineering limitations and next iteration

This v0 pipeline assumes a **fixed camera, aligned numeric digit rectangles, high-contrast seven-segment numerals**, and controlled exposure. Each digit has its own pixel rectangle. Automatic region discovery, skew correction, flashing LED multiplex handling, color segmentation, period/clock colon recognition, camera dropout recovery, and OCR for matrix-style boards remain open. Calibrate while scoreboard displays all eight segments (`8`) and validate against a large recorded dataset across lighting conditions. The capture tool does not save or stream video by default, minimizing bystander imagery retention. Deploy on a rink gateway, not directly on a parent phone. Use camera observations for hardware health/clock agreement only and never to replace official journal data.