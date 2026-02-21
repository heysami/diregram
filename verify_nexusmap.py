#!/usr/bin/env python3
"""
Diregram markdown verifier (repo-local)

Usage:
  python3 verify_diregram.py /absolute/path/to/file.md

Scope:
  - Context-agnostic checks for Diregram markdown FORMAT + LINKAGE integrity.
  - Focuses on machine-checkable rules used by the app importer, plus strict tag/actor rules.

Exit codes:
  - 0: no errors
  - 1: errors present
  - 2: usage error
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple


REQUIRED_TAG_GROUP_ACTORS = "tg-actors"
REQUIRED_TAG_GROUP_UI_SURFACE = "tg-uiSurface"


@dataclass(frozen=True)
class Issue:
    severity: str  # "error" | "warning"
    code: str
    message: str


TAGS_RE = re.compile(r"<!--\s*tags:([^>]*)\s*-->")
EXPID_RE = re.compile(r"<!--\s*expid:(\d+)\s*-->")
DO_RE = re.compile(r"<!--\s*do:([^>]+)\s*-->")
DOATTRS_RE = re.compile(r"<!--\s*doattrs:([^>]*)\s*-->")

OBJECT_NAME_ATTR_ID = "__objectName__"


def find_separator_index_outside_fences(lines: List[str]) -> int:
    in_fence = False
    for i, line in enumerate(lines):
        if line.strip().startswith("```"):
            in_fence = not in_fence
            continue
        if (not in_fence) and line.strip() == "---":
            return i
    return -1


def scan_unclosed_fences(lines: List[str]) -> Optional[int]:
    in_fence = False
    start = 0
    for i, line in enumerate(lines):
        if line.strip().startswith("```"):
            if not in_fence:
                in_fence = True
                start = i + 1
            else:
                in_fence = False
    return start if in_fence else None


def iter_fenced_blocks(text: str) -> Iterable[Tuple[str, str]]:
    # Best-effort: ```type\n<body>\n```
    for m in re.finditer(r"```([^\n]*)\n(.*?)\n```", text, flags=re.S):
        block_type = (m.group(1) or "").strip()
        body = m.group(2) or ""
        yield (block_type, body)


def parse_tag_ids_from_line(line: str) -> List[str]:
    m = TAGS_RE.search(line)
    if not m:
        return []
    raw = m.group(1) or ""
    ids: List[str] = []
    for part in raw.split(","):
        tid = part.strip()
        if not tid:
            continue
        # basic safety, mirroring app sanitization
        tid = tid.replace("\n", "").replace("\r", "").replace("<", "").replace(">", "").replace("--", "").strip()
        if tid:
            ids.append(tid)
    # de-dupe preserving order
    seen = set()
    out: List[str] = []
    for tid in ids:
        if tid in seen:
            continue
        seen.add(tid)
        out.append(tid)
    return out


def parse_doattrs_ids_from_line(line: str) -> List[str]:
    m = DOATTRS_RE.search(line)
    if not m:
        return []
    raw = (m.group(1) or "").strip()
    if not raw:
        return []
    ids: List[str] = []
    for part in raw.split(","):
        s = part.strip()
        if not s:
            continue
        s = s.replace("\n", "").replace("\r", "").replace("<", "").replace(">", "").replace("--", "").strip()
        if s:
            ids.append(s[:64])
    # de-dupe preserving order
    seen = set()
    out: List[str] = []
    for x in ids:
        if x in seen:
            continue
        seen.add(x)
        out.append(x)
    return out


def node_title_for_prefix_checks(raw_line: str) -> str:
    # Remove indentation, HTML comments, and known inline markers.
    s = raw_line.lstrip()
    s = re.sub(r"<!--[\s\S]*?-->", "", s)
    s = s.replace("#flowtab#", " ").replace("#flow#", " ").replace("#common#", " ")
    s = re.sub(r"\s+", " ", s).strip()
    return s


def expected_actor_for_lane_label(label: str) -> Optional[str]:
    s = (label or "").lower()
    if not s:
        return None
    if "system" in s:
        return "actor-system"
    if re.search(r"\b(staff|admin|reviewer|operator|agent)\b", s):
        return "actor-staff"
    if "partner" in s:
        return "actor-partner"
    if re.search(r"\b(applicant|customer|user|visitor|student)\b", s):
        return "actor-applicant"
    return None


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: python3 verify_diregram.py /absolute/path/to/file.md")
        raise SystemExit(2)

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"FAIL: file not found: {path}")
        raise SystemExit(1)

    raw = path.read_text(encoding="utf-8")
    text = raw.replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")

    issues: List[Issue] = []

    unclosed_start = scan_unclosed_fences(lines)
    if unclosed_start is not None:
        issues.append(Issue("error", "UNCLOSED_CODE_BLOCK", f"Unclosed fenced code block starting near line {unclosed_start}."))

    sep = find_separator_index_outside_fences(lines)
    tree_lines = lines[:sep] if sep != -1 else lines

    # Parse metadata blocks (best-effort JSON parse; report errors but keep going)
    blocks: Dict[str, Any] = {}
    for block_type, body in iter_fenced_blocks(text):
        if not block_type:
            continue
        try:
            blocks[block_type] = json.loads(body)
        except Exception as e:
            issues.append(Issue("error", "INVALID_JSON", f"Invalid JSON in ```{block_type}```: {e}"))

    tag_store = blocks.get("tag-store")
    tag_id_to_group: Dict[str, str] = {}
    group_ids: set[str] = set()
    if isinstance(tag_store, dict):
        groups = tag_store.get("groups", [])
        tags = tag_store.get("tags", [])
        if isinstance(groups, list):
            for g in groups:
                if isinstance(g, dict) and isinstance(g.get("id"), str):
                    group_ids.add(g["id"])
        if isinstance(tags, list):
            for t in tags:
                if not isinstance(t, dict):
                    continue
                tid = t.get("id")
                gid = t.get("groupId")
                if isinstance(tid, str) and isinstance(gid, str):
                    tag_id_to_group[tid] = gid

    # Data objects: build attribute-id lookup for doattrs validation.
    data_objects = blocks.get("data-objects")
    do_to_attr_ids: Dict[str, set[str]] = {}
    if isinstance(data_objects, dict):
        objs = data_objects.get("objects", [])
        if isinstance(objs, list):
            for o in objs:
                if not isinstance(o, dict):
                    continue
                doid = o.get("id")
                if not isinstance(doid, str) or not doid.strip():
                    continue
                attrs_set: set[str] = {OBJECT_NAME_ATTR_ID}
                data = o.get("data")
                if isinstance(data, dict):
                    attrs = data.get("attributes")
                    if isinstance(attrs, list):
                        for a in attrs:
                            if not isinstance(a, dict):
                                continue
                            aid = a.get("id")
                            if isinstance(aid, str) and aid.strip():
                                attrs_set.add(aid.strip())
                do_to_attr_ids[doid.strip()] = attrs_set

    def ensure_tag_store_present() -> None:
        nonlocal tag_store
        if not isinstance(tag_store, dict):
            issues.append(Issue("error", "MISSING_TAG_STORE", "Missing ```tag-store``` block (required when using tags and for actor enforcement)."))

    # Tree scanning (skip fences that accidentally appear in tree region)
    in_tree_fence = False
    any_flow = False
    any_expid = False
    for i, line in enumerate(tree_lines):
        if line.strip().startswith("```"):
            in_tree_fence = not in_tree_fence
            continue
        if in_tree_fence:
            continue
        if not line.strip():
            continue

        title = node_title_for_prefix_checks(line)
        if re.match(r"^(system|staff|applicant|partner)\s*:\s*", title, flags=re.I):
            issues.append(
                Issue(
                    "error",
                    "ACTOR_PREFIX_IN_TITLE",
                    f"Line {i+1} encodes an actor in the title ('System:/Staff:/Applicant:/Partner:'). Use actor tags + swimlanes instead.",
                )
            )

        tag_ids = parse_tag_ids_from_line(line)
        if tag_ids:
            ensure_tag_store_present()
            if isinstance(tag_store, dict):
                for tid in tag_ids:
                    if tid not in tag_id_to_group:
                        issues.append(Issue("error", "UNKNOWN_TAG_ID", f'Line {i+1} references unknown tag id "{tid}" (not present in tag-store).'))

        if "#flow#" in line:
            any_flow = True
            ensure_tag_store_present()
            if isinstance(tag_store, dict) and REQUIRED_TAG_GROUP_ACTORS not in group_ids:
                issues.append(Issue("error", "MISSING_REQUIRED_TAG_GROUP", f'tag-store missing required group "{REQUIRED_TAG_GROUP_ACTORS}".'))
            actor_tags = [tid for tid in tag_ids if tag_id_to_group.get(tid) == REQUIRED_TAG_GROUP_ACTORS or tid.startswith("actor-")]
            if len(actor_tags) == 0:
                issues.append(Issue("error", "MISSING_ACTOR_TAG", f"Line {i+1} is #flow# but has no actor tag (group {REQUIRED_TAG_GROUP_ACTORS})."))
            elif len(actor_tags) > 1:
                issues.append(Issue("error", "MULTIPLE_ACTOR_TAGS", f"Line {i+1} is #flow# but has multiple actor tags: {', '.join(actor_tags)}"))

        do_m = DO_RE.search(line)
        do_id = (do_m.group(1).strip() if do_m else "")
        doattrs_ids = parse_doattrs_ids_from_line(line)
        if doattrs_ids:
            if not do_id:
                issues.append(Issue("error", "DOATTRS_WITHOUT_DO", f"Line {i+1} uses <!-- doattrs:... --> but has no <!-- do:... --> on the same line."))
            elif do_to_attr_ids:
                allowed = do_to_attr_ids.get(do_id)
                if allowed:
                    for aid in doattrs_ids:
                        if aid not in allowed:
                            issues.append(
                                Issue(
                                    "warning",
                                    "UNKNOWN_DATA_OBJECT_ATTRIBUTE_ID",
                                    f'Line {i+1} references unknown attribute "{aid}" for data object "{do_id}".',
                                )
                            )

        if EXPID_RE.search(line):
            any_expid = True
            ensure_tag_store_present()
            if isinstance(tag_store, dict) and REQUIRED_TAG_GROUP_UI_SURFACE not in group_ids:
                issues.append(Issue("error", "MISSING_REQUIRED_TAG_GROUP", f'tag-store missing required group "{REQUIRED_TAG_GROUP_UI_SURFACE}".'))
            ui_surface_tags = [tid for tid in tag_ids if tag_id_to_group.get(tid) == REQUIRED_TAG_GROUP_UI_SURFACE]
            if len(ui_surface_tags) == 0:
                issues.append(Issue("error", "MISSING_UI_SURFACE_TAG", f"Line {i+1} has expid but no ui-surface tag (group {REQUIRED_TAG_GROUP_UI_SURFACE})."))

    # Cross-timeframe heuristic (warn): scan #flow# lines for strong signals.
    timeframe_re = re.compile(
        r"\b(await|waiting|wait|queued|queue|2-4\s*weeks|weeks?|months?|within\s+one\s+month|mail|postal|partner\s+assessment|assessment|ica)\b",
        flags=re.I,
    )
    for i, line in enumerate(tree_lines):
        if "#flow#" not in line:
            continue
        if timeframe_re.search(line):
            issues.append(
                Issue(
                    "warning",
                    "CROSS_TIMEFRAME_SIGNAL",
                    f"Line {i+1} (#flow#) contains a cross-timeframe/async signal. Non-swimlane #flow# processes should be session-scoped; consider splitting via Flowtab/lifecycle hubs.",
                )
            )

    # Validate expanded-metadata-* and expanded-grid-* attribute links against data-objects (best-effort).
    if do_to_attr_ids:
        for block_type, data in blocks.items():
            if block_type.startswith("expanded-metadata-") and isinstance(data, dict):
                doid = data.get("dataObjectId")
                attrs = data.get("dataObjectAttributeIds")
                if isinstance(attrs, list) and len(attrs) > 0:
                    if not isinstance(doid, str) or not doid.strip():
                        issues.append(Issue("error", "DOATTRS_WITHOUT_DO", f"```{block_type}``` includes dataObjectAttributeIds but has no dataObjectId."))
                        continue
                    allowed = do_to_attr_ids.get(doid.strip())
                    if allowed:
                        for aid in attrs:
                            if isinstance(aid, str) and aid.strip() and aid.strip() not in allowed:
                                issues.append(
                                    Issue(
                                        "warning",
                                        "UNKNOWN_DATA_OBJECT_ATTRIBUTE_ID",
                                        f'```{block_type}``` references unknown attribute "{aid.strip()}" for data object "{doid.strip()}".',
                                    )
                                )
            if block_type.startswith("expanded-grid-") and isinstance(data, list):
                for idx, n in enumerate(data):
                    if not isinstance(n, dict):
                        continue
                    doid = n.get("dataObjectId")
                    attrs = n.get("dataObjectAttributeIds")
                    if isinstance(attrs, list) and len(attrs) > 0:
                        if not isinstance(doid, str) or not doid.strip():
                            issues.append(
                                Issue(
                                    "error",
                                    "DOATTRS_WITHOUT_DO",
                                    f"```{block_type}``` grid node #{idx+1} includes dataObjectAttributeIds but has no dataObjectId.",
                                )
                            )
                            continue
                        allowed = do_to_attr_ids.get(doid.strip())
                        if allowed:
                            for aid in attrs:
                                if isinstance(aid, str) and aid.strip() and aid.strip() not in allowed:
                                    issues.append(
                                        Issue(
                                            "warning",
                                            "UNKNOWN_DATA_OBJECT_ATTRIBUTE_ID",
                                            f'```{block_type}``` grid node #{idx+1} references unknown attribute "{aid.strip()}" for data object "{doid.strip()}".',
                                        )
                                    )

    # Swimlane alignment (warn): if lane label clearly implies actor, compare to node actor tag.
    for block_type, data in blocks.items():
        if not block_type.startswith("flowtab-swimlane-"):
            continue
        if not isinstance(data, dict):
            continue
        lanes = data.get("lanes", [])
        placement = data.get("placement", {})
        lane_label_by_id: Dict[str, str] = {}
        if isinstance(lanes, list):
            for l in lanes:
                if isinstance(l, dict) and isinstance(l.get("id"), str) and isinstance(l.get("label"), str):
                    lane_label_by_id[l["id"]] = l["label"]
        if isinstance(placement, dict):
            for node_id, p in placement.items():
                if not isinstance(node_id, str) or not isinstance(p, dict):
                    continue
                lane_id = p.get("laneId")
                if not isinstance(lane_id, str):
                    continue
                label = lane_label_by_id.get(lane_id, "")
                expected = expected_actor_for_lane_label(label)
                if not expected:
                    continue
                m = re.match(r"^node-(\d+)$", node_id)
                if not m:
                    continue
                li = int(m.group(1))
                if li < 0 or li >= len(lines):
                    continue
                line = lines[li]
                actor_tags = [tid for tid in parse_tag_ids_from_line(line) if tag_id_to_group.get(tid) == REQUIRED_TAG_GROUP_ACTORS or tid.startswith("actor-")]
                if not actor_tags:
                    issues.append(Issue("warning", "SWIMLANE_NODE_MISSING_ACTOR_TAG", f'{block_type} places {node_id} in lane "{label}" but node has no actor tag.'))
                elif len(actor_tags) == 1 and actor_tags[0] != expected:
                    issues.append(
                        Issue(
                            "warning",
                            "SWIMLANE_ACTOR_MISMATCH",
                            f'{block_type} places {node_id} in lane "{label}" (implies {expected}) but node actor tag is "{actor_tags[0]}".',
                        )
                    )

    # Summary
    err = [x for x in issues if x.severity == "error"]
    warn = [x for x in issues if x.severity == "warning"]
    for x in err + warn:
        print(f"{x.severity.upper():7} {x.code}: {x.message}")
    print(f"\nSummary: errors={len(err)}, warnings={len(warn)}")
    raise SystemExit(1 if err else 0)


if __name__ == "__main__":
    main()

