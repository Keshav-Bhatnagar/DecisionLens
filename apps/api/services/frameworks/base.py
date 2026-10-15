from abc import ABC, abstractmethod
from typing import Dict, Any, List


class BaseDecisionFramework(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        """Framework identifier (e.g. 'mcda', 'swot')."""
        pass

    @abstractmethod
    def analyze(self, objective: str, context: Dict[str, Any], responses: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Execute decision analysis and return structured results."""
        pass
