import json
from pathlib import Path
import unittest
p = Path(__file__).resolve().parents[1] / 'config' / 'league-policy.example.json'
class PolicyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.policy = json.loads(p.read_text())
    def test_policy_has_version(self): self.assertGreater(self.policy['version'],0)
    def test_approval_required(self): self.assertGreaterEqual(sum(a['count'] for a in self.policy['gameCertification']['requiredApprovals']),1)
    def test_official_event_sync_required(self): self.assertTrue(self.policy['gameCertification']['requireAllEventsSynchronized'])
    def test_endgame_email_after_certification(self): self.assertEqual(self.policy['gameCertification']['sendReportOn'],'certified')
    def test_full_score_public(self): self.assertTrue(self.policy['parentPortal']['showFullOfficialLiveScore'])
    def test_minors_require_consent(self): self.assertTrue(self.policy['parentPortal']['guardianConsentRequiredForMinorProfile'])
if __name__=='__main__': unittest.main()
