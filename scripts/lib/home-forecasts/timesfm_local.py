"""Local TimesFM forecasts, the fallback when BigQuery AI.FORECAST fails (see local.js).

stdin:  {"horizon": int, "series": [{"id": str, "values": [float, ...]}]}   values oldest first
stdout: {"model": str, "forecasts": {id: [{"value": v, "lower": q10, "upper": q90}, ...]}}

Runs on CPU in /opt/blogspro-timesfm/venv (timesfm 3.x + CPU-only torch). lower/upper are the 0.1 and 0.9
quantiles, an 80% interval like the BigQuery forecasts. Diagnostics go to stderr; stdout carries only the reply.

Server tuning (deploy/vps/README.md, "Local TimesFM"):
  - one process at a time (flock on TIMESFM_LOCK): the publisher may ask for two sections at once, and two
    checkpoint loads would double the memory and fight over the cores;
  - TIMESFM_THREADS intra-op threads (default: all cores, at most 4) and one inter-op thread;
  - inference_mode, every series in one predict_batch call;
  - only the last TIMESFM_MAX_CONTEXT points of each series (older history adds time, not accuracy);
  - the checkpoint is read from HF_HOME with HF_HUB_OFFLINE=1 set by the unit, so a run never downloads.
"""
import fcntl
import json
import math
import os
import sys
import time

CHECKPOINT = "google/timesfm-3.0-pytorch"
MODEL_NAME = "TimesFM 3.0 (Google, run locally)"
MAX_HORIZON = 100
MAX_SERIES = 200
MAX_CONTEXT = int(os.environ.get("TIMESFM_MAX_CONTEXT", "512"))
THREADS = int(os.environ.get("TIMESFM_THREADS", str(min(4, os.cpu_count() or 1))))
LOCK_PATH = os.environ.get("TIMESFM_LOCK", "/opt/blogspro-timesfm/run.lock")
Q10, Q90 = 0, 8  # indexes of the 0.1 and 0.9 deciles in the 9-quantile output


def log(message):
    print(f"timesfm_local: {message}", file=sys.stderr, flush=True)


def read_request():
    """Validated (horizon, [(id, values)]) from stdin; raises ValueError on anything malformed."""
    request = json.load(sys.stdin)
    horizon = request.get("horizon")
    if not isinstance(horizon, int) or isinstance(horizon, bool) or not 1 <= horizon <= MAX_HORIZON:
        raise ValueError(f"bad horizon {horizon!r}")
    series = []
    for item in request.get("series", [])[:MAX_SERIES]:
        values = [float(v) for v in item.get("values", [])][-MAX_CONTEXT:]
        if isinstance(item.get("id"), str) and len(values) >= 2 and all(math.isfinite(v) for v in values):
            series.append((item["id"], values))
    if not series:
        raise ValueError("no usable series")
    return horizon, series


def hold_lock():
    """An exclusive flock held until this process exits (the kernel drops it even on SIGKILL), or None."""
    try:
        handle = open(LOCK_PATH, "a")
    except OSError as error:
        log(f"running unserialized, cannot open {LOCK_PATH}: {error}")
        return None
    started = time.monotonic()
    fcntl.flock(handle, fcntl.LOCK_EX)
    waited = time.monotonic() - started
    if waited > 1:
        log(f"waited {waited:.0f}s for another forecast run")
    return handle


def load_forecaster():
    import torch
    from timesfm import TimesFM3Forecaster

    torch.set_num_threads(THREADS)
    torch.set_num_interop_threads(1)
    return TimesFM3Forecaster.from_pretrained(CHECKPOINT, device="cpu")


def step(point, quantiles):
    return {"value": float(point), "lower": float(quantiles[Q10]), "upper": float(quantiles[Q90])}


def forecast(horizon, series):
    import numpy as np
    import torch

    started = time.monotonic()
    model = load_forecaster()
    loaded = time.monotonic()
    contexts = [np.asarray(values, dtype=np.float32) for _, values in series]
    with torch.inference_mode():
        outputs = list(model.predict_batch(contexts, horizon=horizon, return_quantiles=True))
    result = {}
    for (series_id, _), out in zip(series, outputs):
        points = np.asarray(out.forecast, dtype=float).reshape(-1)[:horizon]
        quantiles = np.asarray(out.quantiles, dtype=float).reshape(len(points), -1)
        result[series_id] = [step(p, q) for p, q in zip(points, quantiles) if np.isfinite(q[[Q10, Q90]]).all() and math.isfinite(p)]
    log(f"{len(series)} series, horizon {horizon}: load {loaded - started:.1f}s, predict {time.monotonic() - loaded:.1f}s, {THREADS} threads")
    return result


def main():
    try:
        horizon, series = read_request()
        lock = hold_lock()
        reply = {"model": MODEL_NAME, "forecasts": forecast(horizon, series)}
    except Exception as error:  # noqa: BLE001  (report any failure to the Node caller via stderr + exit code)
        log(f"{type(error).__name__}: {error}")
        return 1
    json.dump(reply, sys.stdout)
    if lock:
        lock.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
