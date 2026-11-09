"""Standardized UAV training curriculum (BT01-BT08) catalog and real-time evaluator."""

from .models import ExerciseDefinition, ExerciseStage, load_exercise_catalog
from .runner import ExerciseRunner

__all__ = [
    "ExerciseDefinition",
    "ExerciseRunner",
    "ExerciseStage",
    "load_exercise_catalog",
]
