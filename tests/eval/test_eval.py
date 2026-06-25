#!/usr/bin/env python3
"""Unit and contract tests for offline token analysis and review fixtures."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
ANALYZER = HERE / "analyze-token-usage.py"
FIXTURES = HERE / "fixtures"
FIXTURE_IDS = {
    "expired-jwt-500",
    "refresh-as-access",
    "legacy-access-type-rollout",
    "upstream-4xx-collapsed",
    "preexisting-secret",
    "reset-password-npe-control",
}

ROUTING = HERE / "routing"
ROUTING_BLOCKERS = {
    "small-disjoint-diagnosis",
    "tracked-diagnostic-harness",
    "same-file-independent-outcomes",
}
ROUTING_CONTROLS = {
    "unknown-repo-disjoint-domains",
    "warm-repo-trivial-edit",
    "dirty-working-tree-preservation",
}
ROUTING_IDS = ROUTING_BLOCKERS | ROUTING_CONTROLS


def line(value: dict) -> str:
    return json.dumps(value, separators=(",", ":"))


class AnalyzerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.session = self.root / "session.jsonl"
        subagents = self.root / "session" / "subagents"
        subagents.mkdir(parents=True)

        main = [
            {
                "type": "assistant",
                "sessionId": "session-1",
                "message": {
                    "role": "assistant",
                    "model": "claude-opus-test",
                    "usage": {
                        "input_tokens": 100,
                        "output_tokens": 50,
                        "cache_read_input_tokens": 20,
                        "cache_creation_input_tokens": 10,
                    },
                    "content": [
                        {"type": "tool_use", "name": "Agent", "id": "tool-a", "input": {"description": "review auth", "model": "sonnet"}},
                        {"type": "tool_use", "name": "Task", "id": "tool-b", "input": {"description": "review edge", "model": "haiku"}},
                    ],
                },
            },
            {
                "type": "user",
                "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "tool-a"}]},
                "toolUseResult": {"agentId": "a1", "resolvedModel": "claude-sonnet-test"},
            },
            {
                "type": "user",
                "message": {"role": "user", "content": [{"type": "tool_result", "tool_use_id": "tool-b"}]},
                "toolUseResult": {"agentId": "a2"},
            },
            {"type": "assistant", "sessionId": "session-1", "message": {"role": "assistant", "usage": {"input_tokens": float("nan")}, "content": []}},
            {"type": "assistant", "sessionId": "session-1", "message": None},
        ]
        self.session.write_text("\n".join(map(line, main)) + "\n", encoding="utf-8")
        (subagents / "agent-a1.jsonl").write_text(
            line({
                "type": "assistant",
                "agentId": "a1",
                "sessionId": "session-1",
                "message": {
                    "role": "assistant",
                    "model": "claude-sonnet-test",
                    "usage": {
                        "input_tokens": 40,
                        "output_tokens": 10,
                        "cache_read_input_tokens": 5,
                        "cache_creation_input_tokens": 2,
                    },
                },
            }) + "\n{malformed\n",
            encoding="utf-8",
        )
        (subagents / "agent-a2.jsonl").write_text(
            line({"type": "assistant", "agentId": "a2", "sessionId": "session-1", "message": {"role": "assistant"}}) + "\n",
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temp.cleanup()

    def run_analyzer(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(ANALYZER), str(self.session), *args],
            text=True,
            capture_output=True,
            check=False,
        )

    def test_unpriced_report_covers_main_subagents_cache_missing_fields_and_malformed_lines(self) -> None:
        output = self.root / "report.json"
        result = self.run_analyzer("--json", str(output))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn("$", result.stdout)
        self.assertIn("review auth", result.stdout)
        self.assertIn("review edge", result.stdout)
        report = json.loads(output.read_text(encoding="utf-8"))
        self.assertIsNone(report["pricing"])
        self.assertNotIn("estimated_cost_usd", report["totals"])
        self.assertTrue(all("estimated_cost_usd" not in agent for agent in report["agents"]))
        self.assertEqual([agent["agent_id"] for agent in report["agents"]], ["main", "a1", "a2"])
        self.assertEqual(report["agents"][1]["description"], "review auth")
        self.assertEqual(report["agents"][2]["model"], "haiku")
        self.assertEqual(report["agents"][2]["message_count"], 1)
        self.assertEqual(report["agents"][2]["total_tokens"], 0)
        self.assertEqual(report["totals"]["message_count"], 4)
        self.assertEqual(report["totals"]["input_tokens"], 140)
        self.assertEqual(report["totals"]["output_tokens"], 60)
        self.assertEqual(report["totals"]["cache_read_tokens"], 25)
        self.assertEqual(report["totals"]["cache_write_tokens"], 12)
        self.assertEqual(report["totals"]["total_tokens"], 237)
        self.assertEqual(report["totals"]["malformed_lines"], 1)
        for field in ("message_count", "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "total_tokens", "malformed_lines"):
            self.assertEqual(report["totals"][field], sum(agent[field] for agent in report["agents"]))

    def test_priced_report_uses_one_data_model_for_table_and_json(self) -> None:
        output = self.root / "priced.json"
        result = self.run_analyzer(
            "--json", str(output),
            "--input-price-per-million", "2",
            "--output-price-per-million", "10",
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Est. USD", result.stdout)
        report = json.loads(output.read_text(encoding="utf-8"))
        expected = ((140 + 25 + 12) * 2 + 60 * 10) / 1_000_000
        self.assertAlmostEqual(report["totals"]["estimated_cost_usd"], expected)
        self.assertAlmostEqual(report["pricing"]["estimated_cost_usd"], expected)
        self.assertAlmostEqual(
            report["totals"]["estimated_cost_usd"],
            sum(agent["estimated_cost_usd"] for agent in report["agents"]),
        )

    def test_partial_price_is_rejected(self) -> None:
        result = self.run_analyzer("--input-price-per-million", "2")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must be supplied together", result.stderr)

    def test_nonfinite_price_is_rejected(self) -> None:
        result = self.run_analyzer(
            "--input-price-per-million", "NaN",
            "--output-price-per-million", "10",
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("prices must be non-negative", result.stderr)

    def test_json_output_cannot_overwrite_input_session(self) -> None:
        original = self.session.read_bytes()
        result = self.run_analyzer("--json", str(self.session))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must not overwrite", result.stderr)
        self.assertEqual(self.session.read_bytes(), original)


class FixtureContractTests(unittest.TestCase):
    def test_fixture_set_and_hidden_expected_contract(self) -> None:
        actual = {path.name for path in FIXTURES.iterdir() if path.is_dir()}
        self.assertEqual(actual, FIXTURE_IDS)
        for fixture_id in sorted(FIXTURE_IDS):
            directory = FIXTURES / fixture_id
            self.assertEqual({path.name for path in directory.iterdir()}, {"brief.md", "review.diff", "expected.json"})
            self.assertGreater((directory / "brief.md").stat().st_size, 100)
            diff = directory / "review.diff"
            self.assertTrue(diff.read_text(encoding="utf-8").startswith("diff --git "))
            parsed = subprocess.run(
                ["git", "apply", "--numstat", "--", str(diff)],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(parsed.returncode, 0, parsed.stderr)
            expected = json.loads((directory / "expected.json").read_text(encoding="utf-8"))
            self.assertEqual(expected["id"], fixture_id)
            self.assertEqual(expected["fixture_version"], 1)
            self.assertIn(expected["kind"], {"positive", "causality-control", "negative-precision"})
            self.assertIsInstance(expected["findings"], list)
            self.assertIsInstance(expected["forbidden"], list)
            self.assertIsInstance(expected["confirmation"]["question"], str)
            self.assertGreater(len(expected["confirmation"]["question"]), 30)
            self.assertEqual(expected["acceptance"]["initial_runs"], 3)
            self.assertEqual(expected["acceptance"]["extend_inconsistent_to"], 5)


class RoutingFixtureContractTests(unittest.TestCase):
    """Schema/contract checks for the route-only pressure-test fixtures.

    These validate fixture *shape*, not model behavior. A malformed routing
    fixture (missing field, wrong category arithmetic, leaked grading signal in
    the prompt) fails the suite so the live route-only dogfood in docs/DOGFOOD.md
    always grades against a well-formed contract. Behavioral grading itself is
    the human-adjudicated layer; a passing schema proves nothing about a model.
    """

    LIST_FIELDS = (
        "required_receipts",
        "required_actions",
        "forbidden_actions",
        "forbidden_rationalizations",
        "human_checks",
    )
    LEAK_TOKENS = ("expected_initial_route", "re-route:", "light-inline", "forbidden_")

    def test_routing_fixture_set_and_readme(self) -> None:
        self.assertTrue(ROUTING.is_dir(), "tests/eval/routing/ must exist")
        actual = {path.name for path in ROUTING.iterdir() if path.is_dir()}
        self.assertEqual(actual, ROUTING_IDS)
        self.assertGreater((ROUTING / "README.md").stat().st_size, 200)

    def test_each_routing_fixture_is_well_formed(self) -> None:
        for fixture_id in sorted(ROUTING_IDS):
            directory = ROUTING / fixture_id
            with self.subTest(fixture=fixture_id):
                self.assertEqual(
                    {path.name for path in directory.iterdir()},
                    {"prompt.md", "expected.json"},
                )
                prompt = (directory / "prompt.md").read_text(encoding="utf-8")
                self.assertGreater(len(prompt), 100, "prompt.md must present a real scenario")
                lowered = prompt.lower()
                for token in self.LEAK_TOKENS:
                    self.assertNotIn(token, lowered, f"prompt leaks grading signal: {token}")

                expected = json.loads((directory / "expected.json").read_text(encoding="utf-8"))
                self.assertEqual(expected["id"], fixture_id)
                self.assertEqual(expected["fixture_version"], 1)
                self.assertIn(expected["category"], {"release-blocker", "regression-control"})
                self.assertIn(expected["mode"], {"standard", "production"})
                self.assertIsInstance(expected["expected_initial_route"], str)
                self.assertGreater(len(expected["expected_initial_route"]), 5)
                self.assertIsInstance(expected["stop_condition"], str)
                self.assertGreater(len(expected["stop_condition"]), 10)
                self.assertTrue(
                    expected["reroute_trigger"] is None or isinstance(expected["reroute_trigger"], str),
                    "reroute_trigger must be a string or null",
                )
                for field in self.LIST_FIELDS:
                    self.assertIsInstance(expected[field], list, f"{field} must be a list")
                    self.assertTrue(all(isinstance(item, str) and item for item in expected[field]))
                self.assertGreaterEqual(len(expected["required_actions"]), 1)
                self.assertGreaterEqual(len(expected["forbidden_actions"]), 1)
                self.assertGreaterEqual(len(expected["human_checks"]), 1)

                acceptance = expected["acceptance"]
                self.assertEqual(acceptance["extend_inconsistent_to"], 5)
                if expected["category"] == "release-blocker":
                    self.assertEqual(acceptance["initial_runs"], 3)
                    self.assertEqual(acceptance["minimum_clean_runs"], 3)
                else:
                    self.assertEqual(acceptance["initial_runs"], 1)
                    self.assertEqual(acceptance["minimum_clean_runs"], 1)

    def test_blocker_partition_and_dogfood_failure_signatures(self) -> None:
        declared_blockers = {
            path.name
            for path in ROUTING.iterdir()
            if path.is_dir()
            and json.loads((path / "expected.json").read_text(encoding="utf-8"))["category"]
            == "release-blocker"
        }
        self.assertEqual(declared_blockers, ROUTING_BLOCKERS)

        def forbidden_text(fixture_id: str) -> str:
            data = json.loads((ROUTING / fixture_id / "expected.json").read_text(encoding="utf-8"))
            return " ".join(data["forbidden_rationalizations"]).lower()

        small = forbidden_text("small-disjoint-diagnosis")
        self.assertIn("small", small)
        self.assertIn("inline", small)
        self.assertIn("approved", forbidden_text("tracked-diagnostic-harness"))
        self.assertIn("same file", forbidden_text("same-file-independent-outcomes"))


AGENTS = HERE / "agents"
AGENT_IDS = {"repo-investigator", "debug-investigator", "implementer", "reviewer"}
# Only the implementer mutates tracked files; the others are read-only.
AGENT_MUTATORS = {"implementer"}


class AgentFixtureContractTests(unittest.TestCase):
    """Schema/contract checks for the plugin-agent fixtures (Phase 2).

    These validate fixture *shape*, not agent behavior. A malformed agent fixture
    (missing field, wrong scoped identifier, mutation flag inconsistent with the
    read-only contract) fails the suite so the live agent smokes always grade
    against a well-formed contract. A passing schema proves nothing about how an
    agent actually behaves — that is the human-adjudicated live-smoke layer.
    """

    def test_agent_fixture_set_and_readme(self) -> None:
        self.assertTrue(AGENTS.is_dir(), "tests/eval/agents/ must exist")
        actual = {path.name for path in AGENTS.iterdir() if path.is_dir()}
        self.assertEqual(actual, AGENT_IDS)
        self.assertGreater((AGENTS / "README.md").stat().st_size, 200)

    def test_each_agent_fixture_is_well_formed(self) -> None:
        for fixture_id in sorted(AGENT_IDS):
            directory = AGENTS / fixture_id
            with self.subTest(fixture=fixture_id):
                self.assertEqual(
                    {path.name for path in directory.iterdir()},
                    {"prompt.md", "expected.json"},
                )
                self.assertGreater((directory / "prompt.md").stat().st_size, 100)

                expected = json.loads((directory / "expected.json").read_text(encoding="utf-8"))
                self.assertEqual(expected["id"], fixture_id)
                self.assertEqual(expected["fixture_version"], 1)
                # Scoped identifier tail must agree with the fixture id.
                self.assertEqual(
                    expected["agent_type"],
                    f"cost-oriented-agentic-workflow:cow-{fixture_id}",
                )
                self.assertEqual(expected["model"], "sonnet")

                for field in ("required_inputs", "required_output_sections", "forbidden_actions", "human_checks"):
                    self.assertIsInstance(expected[field], list, f"{field} must be a list")
                    self.assertGreaterEqual(len(expected[field]), 1)
                    self.assertTrue(all(isinstance(x, str) and x for x in expected[field]))

                self.assertIsInstance(expected["file_mutation_expected"], bool)
                self.assertEqual(
                    expected["file_mutation_expected"],
                    fixture_id in AGENT_MUTATORS,
                    "only the implementer fixture may expect file mutation",
                )
                self.assertIsInstance(expected["stop_condition"], str)
                self.assertGreater(len(expected["stop_condition"]), 10)

                # A human check must confirm the exact scoped agent type was spawned.
                self.assertTrue(
                    any(expected["agent_type"] in check for check in expected["human_checks"]),
                    "a human_check must confirm the spawned scoped agent_type",
                )

    def test_role_specific_fixture_invariants(self) -> None:
        debug = json.loads((AGENTS / "debug-investigator" / "expected.json").read_text(encoding="utf-8"))
        self.assertEqual(debug["preloads_skill"], "cost-oriented-agentic-workflow:systematic-debugging")

        reviewer = json.loads((AGENTS / "reviewer" / "expected.json").read_text(encoding="utf-8"))
        self.assertEqual(
            set(reviewer["causality_classes"]),
            {"INTRODUCED", "WORSENED", "PRE_EXISTING", "UNCERTAIN"},
        )

        implementer = json.loads((AGENTS / "implementer" / "expected.json").read_text(encoding="utf-8"))
        joined = " ".join(implementer["forbidden_actions"]).lower()
        self.assertIn("commit", joined)
        self.assertTrue("state" in joined or "cow-state" in joined)


DISCOVERY = HERE / "discovery"
DISCOVERY_IDS = {
    "unknown-repository-intake", "warm-profile-skip", "stale-profile-reintake",
    "single-domain-debugging", "small-disjoint-debugging", "broad-investigation-tiny-fix",
    "invalid-profile-output", "dirty-tree-intake",
}
DISCOVERY_ROUTES = {"controller-map", "investigator", "parallel-investigators", "none"}


class DiscoveryFixtureContractTests(unittest.TestCase):
    """Schema/contract checks for the Phase 3A discovery control-plane fixtures.

    Validates fixture *shape* only — readiness/route/scoped-agent/budget contracts.
    A malformed fixture fails the suite so the live discovery smokes always grade
    against a well-formed contract. A passing schema is not behavioral proof.
    """

    def test_discovery_fixture_set_and_readme(self) -> None:
        self.assertTrue(DISCOVERY.is_dir(), "tests/eval/discovery/ must exist")
        self.assertEqual({p.name for p in DISCOVERY.iterdir() if p.is_dir()}, DISCOVERY_IDS)
        self.assertGreater((DISCOVERY / "README.md").stat().st_size, 200)

    def test_each_discovery_fixture_is_well_formed(self) -> None:
        for fid in sorted(DISCOVERY_IDS):
            d = DISCOVERY / fid
            with self.subTest(fixture=fid):
                self.assertEqual({p.name for p in d.iterdir()}, {"prompt.md", "expected.json"})
                self.assertGreater((d / "prompt.md").stat().st_size, 50)
                e = json.loads((d / "expected.json").read_text(encoding="utf-8"))
                self.assertEqual(e["id"], fid)
                self.assertEqual(e["fixture_version"], 1)
                self.assertIsInstance(e["expected_profile_state"], str)
                self.assertIn(e["expected_discovery_route"], DISCOVERY_ROUTES)
                agent = e["required_scoped_agent"]
                self.assertTrue(agent is None or agent.startswith("cost-oriented-agentic-workflow:cow-"),
                                "required_scoped_agent must be null or a scoped cow-* identifier")
                self.assertIsInstance(e["max_controller_reads"], int)
                self.assertGreaterEqual(e["max_controller_reads"], 0)
                self.assertLessEqual(e["max_controller_reads"], 10)
                for field in ("required_state_transitions", "forbidden_fallback",
                              "forbidden_rationalizations", "human_checks"):
                    self.assertIsInstance(e[field], list)
                    self.assertGreaterEqual(len(e[field]), 1)
                    self.assertTrue(all(isinstance(x, str) and x for x in e[field]))
                self.assertIsInstance(e["stop_condition"], str)
                self.assertGreater(len(e["stop_condition"]), 10)

    def test_discovery_fixture_agent_coherence(self) -> None:
        def agent(fid: str):
            return json.loads((DISCOVERY / fid / "expected.json").read_text(encoding="utf-8"))["required_scoped_agent"]
        # Warm / dirty fixtures dispatch no investigator.
        self.assertIsNone(agent("warm-profile-skip"))
        self.assertIsNone(agent("dirty-tree-intake"))
        # Debugging fixtures dispatch the debug investigator; intake fixtures the repo investigator.
        for fid in ("single-domain-debugging", "small-disjoint-debugging", "broad-investigation-tiny-fix"):
            self.assertEqual(agent(fid), "cost-oriented-agentic-workflow:cow-debug-investigator")
        for fid in ("unknown-repository-intake", "stale-profile-reintake", "invalid-profile-output"):
            self.assertEqual(agent(fid), "cost-oriented-agentic-workflow:cow-repo-investigator")


if __name__ == "__main__":
    unittest.main(verbosity=2)
