"""LLM chat endpoint — proxies messages to Groq with live simulation context."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


class ChatResponse(BaseModel):
    reply: str


def _build_system_prompt() -> str:
    from ..services.simulation_service import sim_manager

    info = sim_manager.get_info()
    td   = sim_manager.last_tick_data

    if td is None or info.status.value == "idle":
        return (
            "You are an AI assistant for a 3×2 arterial traffic management dashboard. "
            "The simulation is currently idle. Answer general traffic management questions concisely."
        )

    m = td.metrics
    intersections_text = "\n".join(
        f"  {i.id}: Q[N={i.queue_lengths.N} S={i.queue_lengths.S} "
        f"E={i.queue_lengths.E} W={i.queue_lengths.W}] wait={i.avg_wait_s:.1f}s"
        for i in sorted(td.intersections, key=lambda x: x.id)
    )

    policy = info.config.policy_type if info.config else "unknown"

    return (
        "You are an AI assistant for a 3×2 arterial traffic management dashboard. "
        "Answer in 2–4 sentences. Be concise and specific.\n\n"
        f"Simulation: {info.status.value} | tick {info.tick} | "
        f"{info.sim_time:.0f}s elapsed | policy: {policy}\n"
        f"Global: {m.total_vehicles} vehicles active, "
        f"avg delay {m.avg_delay_s:.1f}s, "
        f"throughput {m.throughput_veh_per_min:.1f} veh/min, "
        f"{m.total_halting} halting\n\n"
        f"Intersections (queue N/S/E/W | avg wait):\n{intersections_text}"
    )


@router.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    from shared.config import get_settings
    settings = get_settings()

    if not settings.groq_api_key:
        return ChatResponse(reply="Add GROQ_API_KEY to .env to enable the AI assistant.")

    try:
        from groq import Groq
        client = Groq(api_key=settings.groq_api_key)

        system_prompt = _build_system_prompt()
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                *[{"role": m.role, "content": m.content} for m in req.messages],
            ],
            max_tokens=300,
            temperature=0.5,
        )
        reply = completion.choices[0].message.content or "No response."
        return ChatResponse(reply=reply)

    except Exception as e:
        print(f"[Chat] Groq error: {e}")
        return ChatResponse(reply="AI service temporarily unavailable. Please try again.")
