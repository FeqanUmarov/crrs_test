import json
import logging
import os
import re

from django.http import HttpResponseBadRequest, JsonResponse
from shapely.geometry import mapping

from .geo_utils import _clean_wkt_text, _payload_to_wkt_list
from .tekuis_geom import CURVED_RE, infer_srid, load_output_geom, sanitize_input_wkts
from .tekuis_repo import query_parcels_by_bbox, run_geom_chunked_query, tekuis_props_from_row

logger = logging.getLogger(__name__)


def get_tekuis_parcels_by_bbox_response(request):
    try:
        minx = float(request.GET.get("minx"))
        miny = float(request.GET.get("miny"))
        maxx = float(request.GET.get("maxx"))
        maxy = float(request.GET.get("maxy"))
    except Exception:
        return HttpResponseBadRequest("minx/miny/maxx/maxy tələb olunur və ədədi olmalıdır.")

    rows = query_parcels_by_bbox(minx=minx, miny=miny, maxx=maxx, maxy=maxy)
    features = []
    skipped = 0

    for row in rows:
        wkt_lob, *attr_vals = row
        raw = wkt_lob.read() if hasattr(wkt_lob, "read") else wkt_lob
        wkt = _clean_wkt_text(raw)
        if not wkt:
            skipped += 1
            continue
        try:
            geom, _ = load_output_geom(wkt)
        except Exception:
            skipped += 1
            continue
        props = tekuis_props_from_row(attr_vals)
        props["SOURCE"] = "TEKUIS"
        features.append({"type": "Feature", "geometry": mapping(geom), "properties": props})

    logger.info("[TEKUIS][BBOX] returned=%s skipped=%s extent=(%s,%s,%s,%s)", len(features), skipped, minx, miny, maxx, maxy)
    return JsonResponse({"type": "FeatureCollection", "features": features}, safe=False)


def get_tekuis_parcels_by_geom_response(request):
    if request.method != "POST":
        return HttpResponseBadRequest("POST gözlənirdi.")

    try:
        payload = json.loads(request.body.decode("utf-8"))
    except Exception:
        return HttpResponseBadRequest("Yanlış JSON.")

    srid_in_payload = int(payload.get("srid") or os.getenv("TEKUIS_SRID", 4326))
    buf_m = float(payload.get("buffer_m") or 0.0)
    table_srid = int(os.getenv("TEKUIS_TABLE_SRID", 4326))

    wkt_list = _payload_to_wkt_list(payload)
    if not wkt_list:
        w_single = _clean_wkt_text(payload.get("wkt")) if payload.get("wkt") else None
        if not w_single:
            return HttpResponseBadRequest("wkt və ya geojson verilməlidir.")
        wkt_list = [w_single]

    safe_wkts, bad_empty, bad_curved, bad_parse = sanitize_input_wkts(wkt_list)
    if not safe_wkts:
        logger.warning(
            "[TEKUIS][GEOM][input_sanitize] all invalid. empty=%s, curved=%s, parse=%s",
            bad_empty,
            bad_curved,
            bad_parse,
        )
        return JsonResponse({"type": "FeatureCollection", "features": []}, safe=False)

    srid_in = infer_srid(safe_wkts, srid_in_payload, logger=logger)
    features = []
    seen_rids = set()
    out_skip_empty = out_skip_parse = out_skip_curved = out_tailfix = 0

    def _consume_cursor(cur):
        nonlocal out_skip_empty, out_skip_curved, out_skip_parse, out_tailfix
        for row in cur:
            rid, wkt_lob, *attr_vals = row
            rid_key = str(rid) if rid is not None else None
            if rid_key and rid_key in seen_rids:
                continue

            raw = wkt_lob.read() if hasattr(wkt_lob, "read") else wkt_lob
            w = _clean_wkt_text(raw)
            if not w:
                out_skip_empty += 1
                continue
            if re.search(CURVED_RE, w, flags=re.I):
                out_skip_curved += 1
                continue

            try:
                geom, tail_fixed = load_output_geom(w)
                if tail_fixed:
                    out_tailfix += 1
            except Exception:
                out_skip_parse += 1
                continue

            props = tekuis_props_from_row(attr_vals)
            props["SOURCE"] = "TEKUIS"
            features.append({"type": "Feature", "geometry": mapping(geom), "properties": props})
            if rid_key:
                seen_rids.add(rid_key)

    run_geom_chunked_query(
        safe_wkts=safe_wkts,
        srid_in=srid_in,
        buf_m=buf_m,
        table_srid=table_srid,
        consumer=_consume_cursor,
        logger=logger,
    )

    logger.info(
        "[TEKUIS][GEOM] input_sanitized=%s dropped=%s (empty=%s, curved=%s, parse=%s) srid_in=%s table_srid=%s buf_m=%s",
        len(safe_wkts),
        bad_empty + bad_curved + bad_parse,
        bad_empty,
        bad_curved,
        bad_parse,
        srid_in,
        table_srid,
        buf_m,
    )
    logger.info(
        "[TEKUIS][GEOM] returned=%s unique_rids=%s skipped_out=%s tailfix=%s",
        len(features),
        len(seen_rids),
        out_skip_empty + out_skip_curved + out_skip_parse,
        out_tailfix,
    )

    return JsonResponse({"type": "FeatureCollection", "features": features}, safe=False)