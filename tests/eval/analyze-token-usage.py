#!/usr/bin/env python3
"""Summarize Claude Code session and subagent token usage from JSONL."""

from __future__ import annotations

import argparse
import json
import math
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any


TOKEN_FIELDS = {
    "input_tokens": "input_tokens",
    "output_tokens": "output_tokens",
    "cache_read_input_tokens": "cache_read_tokens",
    "cache_creation_input_tokens": "cache_write_tokens",
}


def nonnegative_decimal(value: str) -> Decimal:
    try:
        parsed = Decimal(value)
    except InvalidOperation as exc:
        raise argparse.ArgumentTypeError(f"invalid price: {value}") from exc
    if not parsed.is_finite() or parsed < 0:
        raise argparse.ArgumentTypeError("prices must be non-negative")
    return parsed


def read_jsonl(path: Path) -> tuple[list[dict[str, Any]], int]:
    records: list[dict[str, Any]] = []
    malformed = 0
    with path.open("r", encoding="utf-8-sig") as handle:
        for line in handle:
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError:
                malformed += 1
                continue
            if isinstance(value, dict):
                records.append(value)
            else:
                malformed += 1
    return records, malformed


def token_value(value: Any) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 0
    if isinstance(value, float) and not math.isfinite(value):
        return 0
    return max(0, int(value))


def message_content(record: dict[str, Any]) -> list[dict[str, Any]]:
    message = record.get("message")
    if not isinstance(message, dict):
        return []
    content = message.get("content", [])
    return [item for item in content if isinstance(item, dict)] if isinstance(content, list) else []


def dispatch_metadata(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    calls: dict[str, dict[str, Any]] = {}
    agents: dict[str, dict[str, Any]] = {}
    for record in records:
        for item in message_content(record):
            if item.get("type") == "tool_use" and item.get("name") in {"Agent", "Task"}:
                tool_id = item.get("id")
                tool_input = item.get("input") if isinstance(item.get("input"), dict) else {}
                if isinstance(tool_id, str):
                    calls[tool_id] = {
                        "description": tool_input.get("description"),
                        "requested_model": tool_input.get("model"),
                    }
            if item.get("type") != "tool_result":
                continue
            tool_id = item.get("tool_use_id")
            result = record.get("toolUseResult")
            if not isinstance(tool_id, str) or not isinstance(result, dict):
                continue
            agent_id = result.get("agentId")
            if not isinstance(agent_id, str):
                continue
            metadata = dict(calls.get(tool_id, {}))
            metadata["resolved_model"] = result.get("resolvedModel")
            agents[agent_id] = metadata
    return agents


def summarize_agent(
    path: Path,
    role: str,
    fallback_agent_id: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    records, malformed = read_jsonl(path)
    counts = {target: 0 for target in TOKEN_FIELDS.values()}
    message_count = 0
    models: set[str] = set()
    agent_id = fallback_agent_id
    session_id = None

    for record in records:
        if session_id is None and isinstance(record.get("sessionId"), str):
            session_id = record["sessionId"]
        if role == "subagent" and isinstance(record.get("agentId"), str):
            agent_id = record["agentId"]
        message = record.get("message")
        if record.get("type") != "assistant" or not isinstance(message, dict):
            continue
        message_count += 1
        model = message.get("model")
        if isinstance(model, str) and model and not model.startswith("<"):
            models.add(model)
        usage = message.get("usage")
        if not isinstance(usage, dict):
            continue
        for source, target in TOKEN_FIELDS.items():
            counts[target] += token_value(usage.get(source))

    metadata = metadata or {}
    fallback_model = metadata.get("resolved_model") or metadata.get("requested_model")
    if not models and isinstance(fallback_model, str) and fallback_model:
        models.add(fallback_model)
    ordered_models = sorted(models)
    model = ordered_models[0] if len(ordered_models) == 1 else (
        "mixed: " + ", ".join(ordered_models) if ordered_models else None
    )
    total_tokens = sum(counts.values())
    description = metadata.get("description")
    if not isinstance(description, str) or not description.strip():
        description = "main session" if role == "main" else "subagent"
    description = " ".join(description.splitlines())
    return {
        "agent_id": agent_id,
        "role": role,
        "description": description,
        "model": model,
        "models": ordered_models,
        "message_count": message_count,
        **counts,
        "total_tokens": total_tokens,
        "malformed_lines": malformed,
        "session_id": session_id,
        "source": str(path.resolve()),
    }


def subagent_paths(session_path: Path) -> list[Path]:
    directory = session_path.with_suffix("") / "subagents"
    return sorted(directory.glob("agent-*.jsonl")) if directory.is_dir() else []


def price_agent(agent: dict[str, Any], input_price: Decimal, output_price: Decimal) -> Decimal:
    priced_input = (
        agent["input_tokens"]
        + agent["cache_read_tokens"]
        + agent["cache_write_tokens"]
    )
    return (Decimal(priced_input) * input_price + Decimal(agent["output_tokens"]) * output_price) / Decimal(1_000_000)


def build_report(
    session_path: Path,
    input_price: Decimal | None = None,
    output_price: Decimal | None = None,
) -> dict[str, Any]:
    main_records, _ = read_jsonl(session_path)
    metadata = dispatch_metadata(main_records)
    agents = [summarize_agent(session_path, "main", "main")]
    for path in subagent_paths(session_path):
        fallback_id = path.stem.removeprefix("agent-")
        agents.append(summarize_agent(path, "subagent", fallback_id, metadata.get(fallback_id)))

    total_fields = [
        "message_count",
        "input_tokens",
        "output_tokens",
        "cache_read_tokens",
        "cache_write_tokens",
        "total_tokens",
        "malformed_lines",
    ]
    totals = {field: sum(agent[field] for agent in agents) for field in total_fields}
    totals["agent_count"] = len(agents)
    pricing = None
    if input_price is not None and output_price is not None:
        costs = []
        for agent in agents:
            cost = price_agent(agent, input_price, output_price)
            agent["estimated_cost_usd"] = float(cost)
            costs.append(cost)
        total_cost = sum(costs, Decimal(0))
        totals["estimated_cost_usd"] = float(total_cost)
        pricing = {
            "input_price_per_million": float(input_price),
            "output_price_per_million": float(output_price),
            "cache_policy": "cache read/write tokens use the supplied input rate",
            "estimated_cost_usd": float(total_cost),
        }

    return {
        "schema_version": 1,
        "session_file": str(session_path.resolve()),
        "agents": agents,
        "totals": totals,
        "pricing": pricing,
    }


def render_table(report: dict[str, Any]) -> str:
    priced = report["pricing"] is not None
    headers = ["Agent", "Role", "Model", "Messages", "Input", "Cache read", "Cache write", "Output", "Total", "Description"]
    if priced:
        headers.append("Est. USD")
    rows: list[list[str]] = []
    for agent in report["agents"]:
        row = [
            agent["agent_id"],
            agent["role"],
            agent["model"] or "unknown",
            str(agent["message_count"]),
            str(agent["input_tokens"]),
            str(agent["cache_read_tokens"]),
            str(agent["cache_write_tokens"]),
            str(agent["output_tokens"]),
            str(agent["total_tokens"]),
            agent["description"],
        ]
        if priced:
            row.append(f"${agent['estimated_cost_usd']:.6f}")
        rows.append(row)
    totals = report["totals"]
    total_row = [
        "TOTAL",
        "-",
        "-",
        str(totals["message_count"]),
        str(totals["input_tokens"]),
        str(totals["cache_read_tokens"]),
        str(totals["cache_write_tokens"]),
        str(totals["output_tokens"]),
        str(totals["total_tokens"]),
        "all agents",
    ]
    if priced:
        total_row.append(f"${totals['estimated_cost_usd']:.6f}")
    rows.append(total_row)

    widths = [max(len(headers[i]), *(len(row[i]) for row in rows)) for i in range(len(headers))]
    line = "  ".join(headers[i].ljust(widths[i]) for i in range(len(headers)))
    separator = "  ".join("-" * width for width in widths)
    body = ["  ".join(row[i].ljust(widths[i]) for i in range(len(headers))) for row in rows]
    malformed = totals["malformed_lines"]
    notes = [f"Malformed JSONL lines skipped: {malformed}"]
    if priced:
        notes.append("Cost estimate applies the supplied input rate to uncached and cache read/write tokens.")
    return "\n".join([line, separator, *body, "", *notes])


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("session", type=Path, help="main Claude Code SESSION.jsonl file")
    parser.add_argument("--json", dest="json_output", type=Path, help="write machine-readable JSON")
    parser.add_argument("--input-price-per-million", type=nonnegative_decimal)
    parser.add_argument("--output-price-per-million", type=nonnegative_decimal)
    args = parser.parse_args(argv)
    if not args.session.is_file():
        parser.error(f"session file not found: {args.session}")
    if args.json_output and args.json_output.resolve() == args.session.resolve():
        parser.error("--json output must not overwrite the input session")
    supplied = [args.input_price_per_million is not None, args.output_price_per_million is not None]
    if any(supplied) and not all(supplied):
        parser.error("input and output prices must be supplied together")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])
    report = build_report(args.session, args.input_price_per_million, args.output_price_per_million)
    print(render_table(report))
    if args.json_output:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
