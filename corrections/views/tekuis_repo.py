import os
from typing import Callable

import oracledb
from django.conf import settings

TEKUIS_ATTRS = (
    "ID",
    "LAND_CATEGORY2ENUM",
    "LAND_CATEGORY_ENUM",
    "NAME",
    "OWNER_TYPE_ENUM",
    "SUVARILMA_NOVU_ENUM",
    "EMLAK_NOVU_ENUM",
    "OLD_LAND_CATEGORY2ENUM",
    "TERRITORY_NAME",
    "RAYON_ADI",
    "IED_ADI",
    "BELEDIYE_ADI",
    "LAND_CATEGORY3ENUM",
    "LAND_CATEGORY4ENUM",
    "AREA_HA",
)


def tekuis_props_from_row(vals):
    return {k: v for k, v in zip(TEKUIS_ATTRS, vals)}


def oracle_connect():
    host = os.getenv("ORA_HOST", "alldb-scan.emlak.gov.az")
    port = int(os.getenv("ORA_PORT", "1521"))
    service = os.getenv("ORA_SERVICE", "tekuisdb")
    user = os.getenv("ORA_USER")
    password = os.getenv("ORA_PASSWORD")
    dsn = oracledb.makedsn(host, port, service_name=service)
    try:
        return oracledb.connect(user=user, password=password, dsn=dsn, encoding="UTF-8", nencoding="UTF-8")
    except TypeError:
        return oracledb.connect(user=user, password=password, dsn=dsn)


def query_parcels_by_bbox(minx: float, miny: float, maxx: float, maxy: float):
    schema = getattr(settings, "TEKUIS_SCHEMA", os.getenv("TEKUIS_SCHEMA", "BTG_MIS"))
    table = getattr(settings, "TEKUIS_TABLE", os.getenv("TEKUIS_TABLE", "M_G_PARSEL"))
    sql = f"""
        SELECT sde.st_astext(t.SHAPE) AS wkt,
               t.ID, t.LAND_CATEGORY2ENUM, t.LAND_CATEGORY_ENUM, t.NAME, t.OWNER_TYPE_ENUM,
               t.SUVARILMA_NOVU_ENUM, t.EMLAK_NOVU_ENUM, t.OLD_LAND_CATEGORY2ENUM,
               t.TERRITORY_NAME, t.RAYON_ADI, t.IED_ADI, t.BELEDIYE_ADI,t.LAND_CATEGORY3ENUM,t.LAND_CATEGORY4ENUM, t.AREA_HA
          FROM {schema}.{table} t
         WHERE t.SHAPE.MINX <= :maxx AND t.SHAPE.MAXX >= :minx
           AND t.SHAPE.MINY <= :maxy AND t.SHAPE.MAXY >= :miny
    """
    with oracle_connect() as cn:
        with cn.cursor() as cur:
            cur.execute(sql, {"minx": minx, "miny": miny, "maxx": maxx, "maxy": maxy})
            return list(cur)


def run_geom_chunked_query(
    *,
    safe_wkts,
    srid_in,
    buf_m,
    table_srid,
    consumer: Callable,
    logger,
):
    schema = os.getenv("TEKUIS_SCHEMA", "BTG_MIS")
    table = os.getenv("TEKUIS_TABLE", "M_G_PARSEL")
    attrs_sql = ", ".join([f"t.{c}" for c in TEKUIS_ATTRS])

    def _make_sql_wkt(n_items: int):
        bind_names = [f"w{i}" for i in range(n_items)]
        g_raw_sql = " \nUNION ALL\n".join([f"  SELECT :{bn} AS wkt FROM dual" for bn in bind_names])
        sql = f"""
            WITH g_raw AS (
{g_raw_sql}
            ),
            g AS (
                SELECT CASE WHEN :bufm > 0 THEN
                    sde.st_transform(
                        sde.st_buffer(
                            sde.st_transform(sde.st_geomfromtext(wkt, :srid_in), 3857), :bufm
                        ),
                        :table_srid
                    )
                ELSE
                    sde.st_transform(sde.st_geomfromtext(wkt, :srid_in), :table_srid)
                END AS geom
                FROM g_raw
            ),
            ids AS (
                SELECT DISTINCT t.ROWID AS rid
                  FROM {schema}.{table} t, g
                 WHERE sde.st_envintersects(t.SHAPE, g.geom) = 1
                   AND sde.st_intersects(t.SHAPE, g.geom) = 1
            )
            SELECT t.ROWID AS rid,
                   sde.st_astext(t.SHAPE) AS wkt,
                   {attrs_sql}
              FROM {schema}.{table} t
              JOIN ids ON t.ROWID = ids.rid
        """
        params = {bn: safe_wkts[i] for i, bn in enumerate(bind_names)}
        params.update({"srid_in": int(srid_in), "bufm": float(buf_m), "table_srid": int(table_srid)})
        return sql, params

    def _make_sql_wkb():
        return f"""
            WITH g AS (
                SELECT CASE WHEN :bufm > 0 THEN
                    sde.st_transform(
                        sde.st_buffer(
                            sde.st_transform(sde.st_geomfromwkb(hextoraw(:wkb), :srid_in), 3857), :bufm
                        ),
                        :table_srid
                    )
                ELSE
                    sde.st_transform(sde.st_geomfromwkb(hextoraw(:wkb), :srid_in), :table_srid)
                END AS geom
                FROM dual
            ),
            ids AS (
                SELECT DISTINCT t.ROWID AS rid
                  FROM {schema}.{table} t, g
                 WHERE sde.st_envintersects(t.SHAPE, g.geom) = 1
                   AND sde.st_intersects(t.SHAPE, g.geom) = 1
            )
            SELECT t.ROWID AS rid,
                   sde.st_astext(t.SHAPE) AS wkt,
                   {attrs_sql}
              FROM {schema}.{table} t
              JOIN ids ON t.ROWID = ids.rid
        """

    with oracle_connect() as cn:
        with cn.cursor() as cur:
            chunk_size = 200
            for start in range(0, len(safe_wkts), chunk_size):
                sub = safe_wkts[start : start + chunk_size]
                sql_wkt, params = _make_sql_wkt(len(sub))
                try:
                    try:
                        cur.setinputsizes(**{k: oracledb.DB_TYPE_CLOB for k in params if k.startswith("w")})
                    except Exception:
                        logger.debug("[TEKUIS][GEOM] setinputsizes skipped for WKT chunk.", exc_info=True)
                    cur.execute(sql_wkt, params)
                    consumer(cur)
                except oracledb.DatabaseError:
                    for w in sub:
                        try:
                            cur.execute(
                                f"""
                                WITH g AS (
                                    SELECT CASE WHEN :bufm > 0 THEN
                                        sde.st_transform(
                                            sde.st_buffer(
                                                sde.st_transform(sde.st_geomfromtext(:w, :srid_in), 3857), :bufm
                                            ),
                                            :table_srid
                                        )
                                    ELSE
                                        sde.st_transform(sde.st_geomfromtext(:w, :srid_in), :table_srid)
                                    END AS geom
                                    FROM dual
                                ),
                                ids AS (
                                    SELECT DISTINCT t.ROWID AS rid
                                      FROM {schema}.{table} t, g
                                     WHERE sde.st_envintersects(t.SHAPE, g.geom) = 1
                                       AND sde.st_intersects(t.SHAPE, g.geom) = 1
                                )
                                SELECT t.ROWID AS rid,
                                       sde.st_astext(t.SHAPE) AS wkt,
                                       {attrs_sql}
                                  FROM {schema}.{table} t
                                  JOIN ids ON t.ROWID = ids.rid
                                """,
                                {"w": w, "srid_in": int(srid_in), "bufm": float(buf_m), "table_srid": int(table_srid)},
                            )
                            consumer(cur)
                        except Exception:
                            from shapely import wkb as _wkb
                            from shapely import wkt as _wkt

                            try:
                                g = _wkt.loads(w)
                                wkb_hex = _wkb.dumps(g, hex=True)
                                cur.execute(
                                    _make_sql_wkb(),
                                    {"wkb": wkb_hex, "srid_in": int(srid_in), "bufm": float(buf_m), "table_srid": int(table_srid)},
                                )
                                consumer(cur)
                            except Exception as e2:
                                head = (w[:220] + "…") if len(w) > 220 else w
                                logger.warning(
                                    "[TEKUIS][GEOM] skipped one WKT due to SDE error. WKT head: %s | WKB fallback err: %s",
                                    head,
                                    str(e2)[:240],
                                )