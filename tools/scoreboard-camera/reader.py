"""IceBreaker scoreboard camera observer (development proof of concept).

The program NEVER submits authoritative scoring commands. The data is untrusted
and may only be used for diagnostic comparison with the IceBreaker event journal.

Usage: python reader.py --config config.example.json --source 0
       python reader.py --config config.example.json --image scoreboard.png --once
Requires: opencv-python and numpy.
"""
from __future__ import annotations
import argparse
import json
import sys
import time
from pathlib import Path
import cv2
import numpy as np

# Seven-segment bit layout (a,b,c,d,e,f,g) and normalized sampling points.
POINTS = ((.50,.13),(.80,.30),(.80,.70),(.50,.87),(.20,.70),(.20,.30),(.50,.50))
DIGITS = {
    '0': (1,1,1,1,1,1,0), '1': (0,1,1,0,0,0,0),
    '2': (1,1,0,1,1,0,1), '3': (1,1,1,1,0,0,1),
    '4': (0,1,1,0,0,1,1), '5': (1,0,1,1,0,1,1),
    '6': (1,0,1,1,1,1,1), '7': (1,1,1,0,0,0,0),
    '8': (1,1,1,1,1,1,1), '9': (1,1,1,1,0,1,1),
}


def read_digit(roi: np.ndarray, polarity: str = 'bright') -> tuple[str | None, float]:
    """Classify an aligned, tightly calibrated seven-segment digit crop.

    Returns (digit, confidence); abstains on ambiguous or unreadable crops.
    This is deliberately conservative. Real-world camera calibration and
    illumination testing are required before operational use.
    """
    if roi.size == 0 or min(roi.shape[:2]) < 12:
        return None, 0.0
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY) if roi.ndim == 3 else roi
    if polarity not in ('bright','dark'):
        raise ValueError('polarity must be bright or dark')
    _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if polarity == 'dark':
        mask = cv2.bitwise_not(mask)
    h, w = mask.shape[:2]
    occupancies = []
    for x,y in POINTS:
        cx,cy = int(x*w),int(y*h)
        radx,rady = max(1,int(w*.07)),max(1,int(h*.035))
        area=mask[max(0,cy-rady):min(h,cy+rady+1),max(0,cx-radx):min(w,cx+radx+1)]
        occupancies.append(float(np.mean(area>0)))
    bits = tuple(1 if z >= .45 else 0 for z in occupancies)
    if not any(bits):
        return None,0.0
    matches = [d for d, pattern in DIGITS.items() if pattern == bits]
    if len(matches)!=1:
        return None,0.0
    confidence = min((z if b else 1-z) for z,b in zip(occupancies,bits))
    return matches[0],round(confidence,3)


def evaluate(frame: np.ndarray, config: dict) -> dict:
    """Return spectator-safe observations. Unknown digits never become zeros."""
    fields = {}
    h,w=frame.shape[:2]
    for name,meta in config['fields'].items():
        result=[]; conf=[]
        for rect in meta['digits']:
            x,y,rw,rh=map(int,rect)
            if x<0 or y<0 or rw<=0 or rh<=0 or x+rw>w or y+rh>h:
                d,c=None,0.0
            else:
                d,c=read_digit(frame[y:y+rh,x:x+rw],meta.get('polarity','bright'))
            result.append(d);conf.append(c)
        text=''.join(d if d is not None else '?' for d in result)
        if name == 'clock' and len(text)==4:
            text=text[:2]+':'+text[2:]
        fields[name]={'value':text if '?' not in text else None,
                      'raw':text,'confidence':round(min(conf,default=0),3)}
    return {'source':'camera-observation','authority':False,'observed_at_unix_ms':int(time.time()*1000),'fields':fields}


def compare(vision: dict, official: dict) -> list[dict]:
    """Compare observations with canonical API state without altering either."""
    issues=[]
    for key, data in vision['fields'].items():
        value=data['value']
        if value is None:
            issues.append({'field':key,'status':'unreadable'});continue
        if key in official and str(official[key]) != value:
            issues.append({'field':key,'status':'mismatch','camera':value,'official':str(official[key])})
    return issues


def main():
    p=argparse.ArgumentParser();p.add_argument('--config',required=True);p.add_argument('--source',default='0')
    p.add_argument('--image');p.add_argument('--once',action='store_true');p.add_argument('--output')
    args=p.parse_args();cfg=json.loads(Path(args.config).read_text())
    cap=None
    if not args.image:
        source=int(args.source) if args.source.isdigit() else args.source
        cap=cv2.VideoCapture(source)
        if not cap.isOpened():raise SystemExit('Unable to open camera or stream')
    try:
        while True:
            if args.image:
                frame=cv2.imread(args.image);ok=frame is not None
            else:ok,frame=cap.read()
            if not ok:raise SystemExit('Unable to read frame')
            result=evaluate(frame,cfg)
            output=json.dumps(result)
            print(output,flush=True)
            if args.output:Path(args.output).write_text(output+'\n')
            if args.once or args.image:break
            time.sleep(max(.05,float(cfg.get('sample_interval_seconds',.5))))
    finally:
        if cap:cap.release()

if __name__=='__main__':main()