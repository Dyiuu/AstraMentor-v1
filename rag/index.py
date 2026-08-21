"""CLI: python -m rag.index --course agent-design | --all"""

from __future__ import annotations

import argparse
import json

from rag.course_registry import CourseRegistry
from rag.indexer import CourseIndexer


def main() -> int:
    parser = argparse.ArgumentParser(description="Build AstraMentor course indexes")
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--course", help="Course id to index")
    target.add_argument("--all", action="store_true", help="Index all valid courses")
    parser.add_argument("--force", action="store_true", help="Rebuild ready indexes")
    args = parser.parse_args()

    registry = CourseRegistry()
    indexer = CourseIndexer(registry)
    course_ids = [args.course] if args.course else [course.id for course in registry.list_courses()]
    for course_id in course_ids:
        status = indexer.build(course_id, force=args.force)
        print(json.dumps(status.to_dict(), ensure_ascii=False))
    if registry.errors():
        print(json.dumps({"invalid_courses": registry.errors()}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
