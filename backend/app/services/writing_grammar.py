import json
import re
from dataclasses import dataclass
from typing import Any

import httpx
from pydantic import BaseModel, Field, ValidationError

from app.core.config import settings
from app.core.exceptions import AppError


ALLOWED_GRAMMAR_CATEGORIES = {
    "grammar",
    "subject_verb_agreement",
    "tense",
    "article",
    "preposition",
    "word_order",
    "punctuation",
    "sentence_structure",
}

CATEGORY_MESSAGES = {
    "grammar": "此处可能存在语法问题",
    "subject_verb_agreement": "此处可能存在主谓一致问题",
    "tense": "此处可能存在时态问题",
    "article": "此处可能存在冠词问题",
    "preposition": "此处可能存在介词问题",
    "word_order": "此处可能存在语序问题",
    "punctuation": "此处可能存在标点问题",
    "sentence_structure": "此处可能存在句子结构问题",
}


@dataclass(frozen=True)
class GrammarIssueDraft:
    start_offset: int
    end_offset: int
    segment_id: str | None
    category: str
    message: str


@dataclass(frozen=True)
class WritingSegment:
    id: str
    text: str
    start_offset: int
    end_offset: int


class _AIGrammarIssue(BaseModel):
    segment_id: str
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    category: str = "grammar"


class _AIResult(BaseModel):
    issues: list[_AIGrammarIssue] = []


class WritingGrammarService:
    def detect(self, content: str) -> list[GrammarIssueDraft]:
        if not settings.ai_import_configured:
            raise AppError("WRITING_GRAMMAR_NOT_CONFIGURED", "写作语法检测未配置", 503)
        segments = self._split_segments(content)
        if not segments:
            return []
        result = self._request_ai(segments)
        return self._normalize(result, segments)

    def _split_segments(self, content: str) -> list[WritingSegment]:
        segments: list[WritingSegment] = []
        cursor = 0
        paragraphs = [item.strip() for item in re.split(r"\n+", content) if item.strip()]
        if not paragraphs:
            paragraphs = [content]
        for paragraph_index, paragraph in enumerate(paragraphs):
            paragraph_start = content.index(paragraph, cursor)
            cursor = paragraph_start
            sentences = [
                item.strip()
                for item in re.split(r"(?<=[.!?。！？])\s+", paragraph)
                if item.strip()
            ]
            if not sentences:
                sentences = [paragraph]
            sentence_cursor = paragraph_start
            for sentence_index, sentence in enumerate(sentences):
                sentence_start = content.index(sentence, sentence_cursor)
                sentence_cursor = sentence_start
                segments.append(
                    WritingSegment(
                        id=f"p{paragraph_index}-s{sentence_index}",
                        text=sentence,
                        start_offset=sentence_start,
                        end_offset=sentence_start + len(sentence),
                    )
                )
                sentence_cursor += len(sentence)
        return segments

    def _request_ai(self, segments: list[WritingSegment]) -> _AIResult:
        payload = {
            "model": settings.openai_model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a grammar error locator. "
                        "Do not correct, rewrite, suggest, or explain. "
                        "For each possible grammar issue, return only segment_id, start, end, "
                        "and category. start and end are character offsets inside the segment. "
                        "Allowed categories: "
                        "grammar, subject_verb_agreement, tense, article, preposition, "
                        "word_order, punctuation, sentence_structure. "
                        "Return strict JSON with the schema "
                        '{"issues":[{"segment_id":"p0-s0","start":0,"end":5,"category":"grammar"}]}.'
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "segments": [
                                {"id": segment.id, "text": segment.text}
                                for segment in segments
                            ]
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
        }
        url = settings.openai_base_url.rstrip("/") + "/chat/completions"
        try:
            with httpx.Client(timeout=settings.writing_grammar_timeout_seconds, trust_env=settings.ai_http_trust_env) as client:
                response = client.post(
                    url,
                    headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                    json=payload,
                )
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise AppError(
                "WRITING_GRAMMAR_FAILED",
                f"Grammar provider returned {exc.response.status_code}.",
                502,
            ) from exc
        except httpx.HTTPError as exc:
            raise AppError("WRITING_GRAMMAR_FAILED", "Grammar provider request failed.", 502) from exc

        try:
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            parsed = self._parse_json_content(content)
            return _AIResult.model_validate(parsed)
        except (KeyError, TypeError, ValueError, ValidationError) as exc:
            raise AppError("WRITING_GRAMMAR_FAILED", "Grammar response could not be parsed.", 502) from exc

    def _normalize(
        self, result: _AIResult, segments: list[WritingSegment]
    ) -> list[GrammarIssueDraft]:
        segment_by_id = {segment.id: segment for segment in segments}
        issues: list[GrammarIssueDraft] = []
        seen: set[tuple[int, int, str]] = set()

        for item in result.issues:
            segment = segment_by_id.get(item.segment_id)
            if segment is None:
                continue
            start = max(0, min(item.start, len(segment.text)))
            end = max(0, min(item.end, len(segment.text)))
            if end <= start:
                continue
            category = item.category if item.category in ALLOWED_GRAMMAR_CATEGORIES else "grammar"
            global_start = segment.start_offset + start
            global_end = segment.start_offset + end
            key = (global_start, global_end, category)
            if key in seen:
                continue
            seen.add(key)
            issues.append(
                GrammarIssueDraft(
                    start_offset=global_start,
                    end_offset=global_end,
                    segment_id=segment.id,
                    category=category,
                    message=CATEGORY_MESSAGES[category],
                )
            )

        issues.sort(key=lambda item: (item.start_offset, item.end_offset))
        return issues

    @staticmethod
    def _parse_json_content(content: str | dict[str, Any]) -> dict[str, Any]:
        if isinstance(content, dict):
            return content
        text = content.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        if not text.startswith("{"):
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                text = text[start : end + 1]
        return json.loads(text)
