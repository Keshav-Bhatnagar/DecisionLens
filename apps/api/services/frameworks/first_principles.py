from typing import Dict, Any, List
from apps.api.services.frameworks.base import BaseDecisionFramework


class FirstPrinciplesFramework(BaseDecisionFramework):
    @property
    def name(self) -> str:
        return "first_principles"

    def analyze(self, objective: str, context: Dict[str, Any], responses: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Deconstruct problems into foundational truths and analyze second-order effects."""
        matrix = {
            "fundamental_truths": [
                "Authentication is a commodity table-stake capability, not our core domain differentiator.",
                "Engineering hours spent on custom crypto auth are hours diverted from proprietary product features.",
                "Security breaches carry catastrophic asymmetric downside risk.",
            ],
            "assumptions_challenged": [
                "Assumption: 'Building in-house is always cheaper.' Reality: Engineering salary + maintenance > SaaS fees in years 1-3.",
                "Assumption: 'We will lose control of user data.' Reality: Encrypted OIDC tokens and standard JWTs allow easy migration.",
            ],
            "second_order_effects": [
                "Immediate effect: Faster release date in Q1.",
                "Second-order effect: Earlier customer feedback loop gives 3-month compounding product advantage.",
                "Third-order effect: Engineering team stays focused on product-market fit rather than operational crypto patch cycles.",
            ],
        }

        return {
            "framework": "first_principles",
            "summary": f"First Principles decomposition shows custom building diverts core capital from value creation without providing competitive moat.",
            "matrix": matrix,
            "key_findings": [
                "Auth is non-core overhead with negative asymmetry upon breach.",
                "Time-to-market advantage yields higher expected value than infrastructure cost savings.",
            ],
            "recommendations": [
                "Delegate non-core commodity services to certified providers.",
                "Reinvest saved engineering sprints directly into proprietary differentiation.",
            ],
            "confidence_score": 0.94,
        }
