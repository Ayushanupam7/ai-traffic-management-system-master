"""Policy variants — named parameter sets persisted in Supabase.

Two families today:
  - "arterial" -> ActuatedPolicyParams (3x2 grid actuated controller)
  - "highway"  -> AlineaPolicyParams   (ramp-metering ALINEA controller)

Backing store: public.policy_variants
    name (PK), params (JSONB), family (TEXT), description (TEXT), timestamps.

Endpoints expose CRUD, per-variant performance lookup, and an LLM-backed
suggestion endpoint that adapts its prompt + bounds to the family.
"""

from __future__ import annotations

import json
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from shared.types import ActuatedPolicyParams, AlineaPolicyParams

from ..services.db_service import db_service


# --------------------------------------------------------------------- #
# Models — params is loose (dict) so a single PolicyVariant carries either
# family. The family field tags which schema applies.
# --------------------------------------------------------------------- #

class PolicyVariant(BaseModel):
    name: str
    params: dict
    family: str = "arterial"   # "arterial" | "highway"
    description: str = ""


class SuggestRequest(BaseModel):
    draft: dict
    family: str = "arterial"
    goal: str = "balanced"


class Suggestion(BaseModel):
    field: str
    value: float
    reason: str


class SuggestResponse(BaseModel):
    suggestions: list[Suggestion]
    sample_size: int
    note: str = ""


router = APIRouter()


# --------------------------------------------------------------------- #
# Bounds + validators per family — used to validate input and to feed the
# LLM the rules of the road.
# --------------------------------------------------------------------- #

_ARTERIAL_BOUNDS: dict[str, tuple[float, float]] = {
    "base_green_n": (5.0, 60.0),
    "base_green_s": (5.0, 60.0),
    "base_green_e": (5.0, 60.0),
    "base_green_w": (5.0, 60.0),
    "min_green":    (3.0, 30.0),
    "max_green":    (20.0, 120.0),
    "max_redist_s": (0.0, 30.0),
    "smooth_alpha": (0.0, 1.0),
}

_HIGHWAY_BOUNDS: dict[str, tuple[float, float]] = {
    "target_occupancy_pct": (10.0, 35.0),
    "gain_K":               (10.0, 200.0),
    "r_min_vph":            (120.0, 600.0),
    "r_max_vph":            (900.0, 2400.0),
    "control_interval_s":   (10.0, 120.0),
    "queue_max_veh":        (10.0, 80.0),
    "green_s":              (1.0, 6.0),
    "yellow_s":             (0.5, 2.0),
}


def _bounds_for(family: str) -> dict[str, tuple[float, float]]:
    return _HIGHWAY_BOUNDS if family == "highway" else _ARTERIAL_BOUNDS


def _validate_params(family: str, params: dict) -> dict:
    """Run params through the Pydantic model for its family. Raises
    HTTPException(400) on schema violations."""
    try:
        if family == "highway":
            return AlineaPolicyParams(**params).model_dump()
        return ActuatedPolicyParams(**params).model_dump()
    except Exception as e:
        raise HTTPException(400, f"invalid {family} params: {e}")


# --------------------------------------------------------------------- #
# CRUD
# --------------------------------------------------------------------- #

@router.get("", response_model=List[PolicyVariant])
@router.get("/", response_model=List[PolicyVariant])
async def list_variants(
    family: Optional[str] = Query(None, description="arterial | highway"),
) -> List[PolicyVariant]:
    rows = await db_service.list_variants()
    out: List[PolicyVariant] = []
    for row in rows:
        fam = row.get("family") or "arterial"
        if family and fam != family:
            continue
        try:
            out.append(PolicyVariant(
                name=row["name"],
                params=row["params"] or {},
                family=fam,
                description=row.get("description") or "",
            ))
        except Exception as e:
            print(f"[variants] skipping malformed row {row.get('name')}: {e}")
    return out


@router.post("", response_model=PolicyVariant)
@router.post("/", response_model=PolicyVariant)
async def save_variant(variant: PolicyVariant) -> PolicyVariant:
    name = variant.name.strip()
    if not name:
        raise HTTPException(400, "name is required")
    if variant.family not in ("arterial", "highway"):
        raise HTTPException(400, f"unknown family '{variant.family}'")
    validated = _validate_params(variant.family, variant.params)
    try:
        await db_service.upsert_variant(
            name=name,
            params=validated,
            description=variant.description or "",
            family=variant.family,
        )
    except Exception as e:
        raise HTTPException(500, f"failed to save variant: {e}")
    return PolicyVariant(
        name=name,
        params=validated,
        family=variant.family,
        description=variant.description,
    )


@router.delete("/{name}")
async def delete_variant(name: str) -> dict:
    rows = await db_service.list_variants()
    if not any(r["name"] == name for r in rows):
        raise HTTPException(404, f"variant {name} not found")
    try:
        await db_service.delete_variant(name)
    except Exception as e:
        raise HTTPException(500, f"failed to delete variant: {e}")
    return {"deleted": name}


# --------------------------------------------------------------------- #
# Per-variant performance — runs that used this variant
# --------------------------------------------------------------------- #

@router.get("/{name}/runs")
async def get_variant_runs(name: str, limit: int = 50) -> list[dict]:
    rows = await db_service.list_variants()
    target = next((r for r in rows if r["name"] == name), None)
    if target is None:
        raise HTTPException(404, f"variant {name} not found")

    # Family decides which config field carries the params.
    fam = target.get("family") or "arterial"
    cfg_key = "alinea_params" if fam == "highway" else "policy_params"
    runs = await db_service.runs_for_variant(target["params"], limit=limit, key=cfg_key)
    out: list[dict] = []
    for r in runs:
        cfg = r.get("config") or {}
        out.append({
            "run_id": r["id"],
            "started_at": r.get("started_at"),
            "ended_at": r.get("ended_at"),
            "demand_profile": cfg.get("demand_profile"),
            "total_vehicles": cfg.get("total_vehicles"),
            "network_type": cfg.get("network_type"),
            "clearance_s": r.get("clearance_s"),
            "avg_trip_time_s": r.get("avg_trip_time_s"),
            "completed_trips": r.get("completed_trips"),
            "avg_control_delay_s": r.get("avg_control_delay_s"),
            "throughput_veh_per_min": r.get("throughput_veh_per_min"),
        })
    return out


# --------------------------------------------------------------------- #
# LLM-backed suggestion endpoint
# --------------------------------------------------------------------- #

_FAMILY_SYSTEM = {
    "arterial": (
        "You are a traffic-signal policy tuner for a 3x2 arterial grid. "
        "Respond with valid JSON only."
    ),
    "highway": (
        "You are a freeway ramp-metering policy tuner. The policy is ALINEA: "
        "r(k) = clamp(r(k-1) + K * (o_target - o_measured), r_min, r_max). "
        "Respond with valid JSON only."
    ),
}


@router.post("/suggest", response_model=SuggestResponse)
async def suggest_policy(req: SuggestRequest) -> SuggestResponse:
    from shared.config import get_settings
    settings = get_settings()

    family = req.family if req.family in ("arterial", "highway") else "arterial"
    bounds = _bounds_for(family)

    if not settings.groq_api_key:
        return SuggestResponse(
            suggestions=[],
            sample_size=0,
            note="Add GROQ_API_KEY to .env to enable suggestions.",
        )

    history = await db_service.list_recent_experiment_runs(limit=30)
    # Filter to the right family: arterial runs have policy_params, highway
    # runs have alinea_params (we tag via cfg's network_type as well).
    if family == "highway":
        history = [
            h for h in history
            if (h.get("config") or {}).get("network_type") == "highway_metered"
        ]
    else:
        history = [
            h for h in history
            if (h.get("config") or {}).get("network_type") != "highway_metered"
        ]

    if not history:
        return SuggestResponse(
            suggestions=[],
            sample_size=0,
            note=f"No {family} comparison runs in history yet — run some first.",
        )

    cfg_key = "alinea_params" if family == "highway" else "policy_params"
    summary_rows: list[dict] = []
    for h in history:
        cfg = h.get("config") or {}
        summary_rows.append({
            "params": cfg.get(cfg_key),
            "demand_profile": cfg.get("demand_profile"),
            "total_vehicles": cfg.get("total_vehicles"),
            "clearance_s": h.get("clearance_s"),
            "avg_trip_time_s": h.get("avg_trip_time_s"),
            "avg_control_delay_s": h.get("avg_control_delay_s"),
            "throughput_veh_per_min": h.get("throughput_veh_per_min"),
        })

    goal_text = {
        "minimize_trip_time":  "minimize average trip time (avg_trip_time_s)",
        "minimize_halting":    "minimize control delay (avg_control_delay_s)",
        "balanced":            "balance clearance time and trip time without exploding any metric",
    }.get(req.goal, "balance the metrics")

    user_prompt = (
        f"Here are recent {family} comparison runs (each is an outcome of a policy "
        f"with the listed params on a demand profile, plus metrics):\n\n"
        f"{json.dumps(summary_rows, separators=(',', ':'))}\n\n"
        f"Current draft params: {json.dumps(req.draft, separators=(',', ':'))}\n\n"
        f"Goal: {goal_text}.\n"
        "Suggest 2-3 specific parameter changes that the historical data supports. "
        "Each suggestion must be a single field with a new numeric value within bounds:\n"
        f"{json.dumps({k: list(v) for k, v in bounds.items()}, separators=(',', ':'))}\n"
        "Reply with ONLY a JSON object: "
        '{ "suggestions": [{ "field": "...", "value": ..., "reason": "..." }] }. '
        "Do not include explanations outside the JSON."
    )

    try:
        from groq import Groq
        client = Groq(api_key=settings.groq_api_key)
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": _FAMILY_SYSTEM[family]},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=500,
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        raw = completion.choices[0].message.content or "{}"
    except Exception as e:
        print(f"[suggest] Groq error: {e}")
        return SuggestResponse(
            suggestions=[],
            sample_size=len(history),
            note="LLM call failed; try again in a moment.",
        )

    try:
        parsed = json.loads(raw)
        raw_suggestions = parsed.get("suggestions") or []
    except Exception as e:
        print(f"[suggest] couldn't parse JSON: {e} :: {raw[:200]}")
        return SuggestResponse(
            suggestions=[],
            sample_size=len(history),
            note="LLM response wasn't valid JSON.",
        )

    valid: list[Suggestion] = []
    for s in raw_suggestions:
        field = s.get("field")
        value = s.get("value")
        reason = s.get("reason") or ""
        if field not in bounds:
            continue
        try:
            value = float(value)
        except Exception:
            continue
        lo, hi = bounds[field]
        if value < lo or value > hi:
            continue
        valid.append(Suggestion(field=field, value=value, reason=str(reason)))
        if len(valid) >= 3:
            break

    return SuggestResponse(suggestions=valid, sample_size=len(history))
