import re
from typing import List, Tuple

from shapely import wkt as shapely_wkt

from ..common.geo_utils import _clean_wkt_text

NUM_RE = r"[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?"
TYPE_RE = r"(?:POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)"
CURVED_RE = r"\b(CURVEPOLYGON|CIRCULARSTRING|COMPOUNDCURVE|ELLIPTICARC|MULTICURVE|MULTISURFACE|GEOMETRYCOLLECTION)\b"


def normalize_wkt_remove_m_dims(wkt: str) -> str:
    s = wkt
    m_hdr = re.match(rf"^\s*(?:{TYPE_RE})\s+(ZM|M)\b", s, flags=re.I)
    if not m_hdr:
        return s
    dim = m_hdr.group(1).upper()
    if dim == "ZM":
        s = re.sub(rf"\b({TYPE_RE})\s+ZM\b", r"\1 Z", s, flags=re.I)
        s = re.sub(rf"({NUM_RE})\s+({NUM_RE})\s+({NUM_RE})\s+({NUM_RE})", r"\1 \2 \3", s)
    elif dim == "M":
        s = re.sub(rf"\b({TYPE_RE})\s+M\b", r"\1", s, flags=re.I)
        s = re.sub(rf"({NUM_RE})\s+({NUM_RE})\s+({NUM_RE})", r"\1 \2", s)
    return s


def clip_tail(wkt: str) -> str:
    s = wkt
    if s.upper().startswith("SRID=") and ";" in s:
        s = s.split(";", 1)[1].strip()
    depth = 0
    end = -1
    for i, ch in enumerate(s):
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                end = i
                break
    return s[: end + 1].strip() if end >= 0 else s.strip()


def sanitize_input_wkts(wkt_list: List[str]) -> Tuple[List[str], int, int, int]:
    safe_wkts: List[str] = []
    bad_empty = bad_curved = bad_parse = 0

    for w in wkt_list:
        s = _clean_wkt_text(w or "")
        if not s:
            bad_empty += 1
            continue
        if re.search(CURVED_RE, s, flags=re.I):
            bad_curved += 1
            continue
        s = clip_tail(normalize_wkt_remove_m_dims(s))
        try:
            g = shapely_wkt.loads(s)
            if g.is_empty:
                bad_empty += 1
                continue
            s = g.wkt
        except Exception:
            bad_parse += 1
            continue
        safe_wkts.append(s)

    return safe_wkts, bad_empty, bad_curved, bad_parse


def infer_srid(wkts: List[str], fallback: int, logger=None) -> int:
    try:
        g0 = shapely_wkt.loads(wkts[0])
        minx, miny, maxx, maxy = g0.bounds
        if -180 <= minx <= 180 and -180 <= maxx <= 180 and -90 <= miny <= 90 and -90 <= maxy <= 90:
            return 4326
    except Exception:
        if logger:
            logger.debug("[TEKUIS][GEOM] srid inference failed; fallback SRID istifadə olunacaq.", exc_info=True)
    return fallback


def load_output_geom(wkt: str):
    w2 = clip_tail(wkt)
    tail_fixed = w2 != wkt
    w2 = normalize_wkt_remove_m_dims(w2)
    
    return shapely_wkt.loads(w2), tail_fixed