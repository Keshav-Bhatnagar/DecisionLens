from typing import Dict, Type
from apps.api.services.frameworks.base import BaseDecisionFramework
from apps.api.services.frameworks.mcda import MCDAFramework
from apps.api.services.frameworks.swot import SWOTFramework
from apps.api.services.frameworks.first_principles import FirstPrinciplesFramework

FRAMEWORKS: Dict[str, BaseDecisionFramework] = {
    "mcda": MCDAFramework(),
    "swot": SWOTFramework(),
    "first_principles": FirstPrinciplesFramework(),
}


def get_framework(framework_name: str) -> BaseDecisionFramework:
    """Retrieve decision framework by name, defaulting to MCDA."""
    return FRAMEWORKS.get(framework_name.lower(), FRAMEWORKS["mcda"])


__all__ = [
    "BaseDecisionFramework",
    "MCDAFramework",
    "SWOTFramework",
    "FirstPrinciplesFramework",
    "FRAMEWORKS",
    "get_framework",
]
