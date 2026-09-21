"""Step 1 - Fetch raw datasets.

Downloads IFCT 2017 (via its npm package) and the South African Heart Disease
dataset (via the PMLB mirror). If the network is unavailable, the cached copies
already in pipeline/raw/ are used, so the pipeline never fails for lack of
internet once it has run once.
"""
from __future__ import annotations

import gzip
import io
import sys
import tarfile
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from common import IFCT_TARBALL, RAW, SAHEART_URL, log  # noqa: E402

IFCT_OUT = RAW / "ifct2017_compositions.csv"
IFCT_GROUPS_OUT = RAW / "ifct2017_groups.csv"
SAHEART_OUT = RAW / "saheart.csv"


def _download(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "mediplate-pipeline/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def fetch_ifct(force: bool = False) -> None:
    if IFCT_OUT.exists() and IFCT_GROUPS_OUT.exists() and not force:
        log("fetch", f"IFCT 2017 cached at {IFCT_OUT.name}")
        return
    log("fetch", f"downloading IFCT 2017 from {IFCT_TARBALL}")
    data = _download(IFCT_TARBALL)
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        members = {m.name: m for m in tar.getmembers()}
        for inner, out in (("package/compositions/index.csv", IFCT_OUT),
                           ("package/groups/index.csv", IFCT_GROUPS_OUT)):
            fh = tar.extractfile(members[inner])
            out.write_bytes(fh.read())
    log("fetch", "IFCT 2017 saved")


def fetch_saheart(force: bool = False) -> None:
    if SAHEART_OUT.exists() and not force:
        log("fetch", f"SAheart cached at {SAHEART_OUT.name}")
        return
    log("fetch", f"downloading SAheart from {SAHEART_URL}")
    raw = gzip.decompress(_download(SAHEART_URL)).decode("utf-8")
    SAHEART_OUT.write_text(raw.replace("\t", ","), encoding="utf-8")
    log("fetch", "SAheart saved")


def main(force: bool = False) -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for fn in (fetch_ifct, fetch_saheart):
        try:
            fn(force)
        except Exception as exc:  # network trouble: fall back to cache
            name = fn.__name__.replace("fetch_", "")
            cached = {"ifct": IFCT_OUT, "saheart": SAHEART_OUT}[name]
            if cached.exists():
                log("fetch", f"WARNING could not download {name} ({exc}); using cached copy")
            else:
                raise RuntimeError(f"{name} is not cached and could not be downloaded: {exc}") from exc


if __name__ == "__main__":
    main(force="--force" in sys.argv)
