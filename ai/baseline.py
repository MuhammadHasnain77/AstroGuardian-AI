"""Personalized baselines: what is *normal* for this specific astronaut."""

import math

import pandas as pd

from .thresholds import BASELINE_MIN_READINGS, BASELINE_WINDOW, MIN_STD, NUMERIC_METRICS


def calculate_baseline(history: pd.DataFrame, window: int = BASELINE_WINDOW) -> dict:
    """Compute per-metric mean/std from an astronaut's *prior* readings.

    `history` must already be filtered to one astronaut, sorted oldest-first,
    and must NOT include the reading being evaluated — otherwise an anomaly
    would pull the baseline toward itself and hide itself.

    Returns {metric: {"mean", "std", "n", "reliable"}}. A metric is
    `reliable` only with at least BASELINE_MIN_READINGS valid samples; the
    engine ignores unreliable baselines instead of trusting noisy numbers.
    """
    recent = history.tail(window)
    baseline = {}
    for metric in NUMERIC_METRICS:
        if metric not in recent.columns:
            continue
        values = pd.to_numeric(recent[metric], errors="coerce").dropna()
        n = int(values.size)
        if n == 0:
            continue
        mean = float(values.mean())
        std = float(values.std(ddof=1)) if n > 1 else 0.0
        if math.isnan(std):
            std = 0.0
        baseline[metric] = {
            "mean": round(mean, 2),
            # Floor the std so a very stable astronaut doesn't alert on noise.
            "std": round(max(std, MIN_STD.get(metric, 0.0)), 2),
            "n": n,
            "reliable": n >= BASELINE_MIN_READINGS,
        }
    return baseline
