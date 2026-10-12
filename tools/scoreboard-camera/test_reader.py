import unittest
import numpy as np
import cv2
from reader import read_digit,evaluate,compare,POINTS,DIGITS

def synthetic(ch):
    # Draw lit segments at exactly the documented calibration sampling points.
    canvas=np.zeros((100,70),dtype=np.uint8)
    for (x,y),b in zip(POINTS,DIGITS[ch]):
        if b: cv2.circle(canvas,(int(x*70),int(y*100)),6,255,-1)
    return cv2.cvtColor(canvas,cv2.COLOR_GRAY2BGR)

class CameraTests(unittest.TestCase):
    def test_all_digits(self):
        for digit in DIGITS:
            with self.subTest(digit=digit):
                detected,certainty=read_digit(synthetic(digit))
                self.assertEqual(detected,digit)
                self.assertGreaterEqual(certainty,.5)
    def test_blank_abstains(self):
        self.assertEqual(read_digit(np.zeros((100,70,3),dtype=np.uint8))[0],None)
    def test_invalid_rectangle_abstains(self):
        output=evaluate(np.zeros((20,20,3),dtype=np.uint8),{'fields':{'home_score':{'digits':[[90,90,30,30]]}}})
        self.assertIsNone(output['fields']['home_score']['value'])
        self.assertFalse(output['authority'])
    def test_mismatch_only_alert(self):
        observation={'fields':{'home_score':{'value':'3'},'away_score':{'value':'2'}}}
        self.assertEqual(compare(observation,{'home_score':3,'away_score':1}),[{'field':'away_score','status':'mismatch','camera':'2','official':'1'}])
if __name__=='__main__':unittest.main()