"""API response models. All offsets are half-open Unicode code-point offsets."""

from typing import Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field


class Model(BaseModel):
    model_config = ConfigDict(
        frozen=True, strict=True, populate_by_name=True, extra="ignore"
    )


class HealthResult(Model):
    status: str
    version: str


class TextResult(Model):
    input: str
    profile: str


class NormalizationResult(TextResult):
    output: str
    changed: bool


class ConversionResult(NormalizationResult):
    from_encoding: str = Field(alias="from")
    to_encoding: str = Field(alias="to")


class Span(Model):
    start: int
    end: int


class EncodingSegment(Span):
    text: str
    encoding: str
    zawgyi_probability: float | None = Field(alias="zawgyiProbability")


class DetectionResult(TextResult):
    encoding: str
    confidence: float | None
    segments: tuple[EncodingSegment, ...]


class SyllableSegment(Span):
    kind: str
    text: str


class SyllabificationResult(TextResult):
    segments: tuple[SyllableSegment, ...]


class OrthographyDiagnostic(Span):
    code: str
    severity: str
    message: str


class OrthographyResult(TextResult):
    valid: bool
    diagnostics: tuple[OrthographyDiagnostic, ...]


class TransliterationSegment(Span):
    kind: str
    input: str
    output: str


class TransliterationResult(TextResult):
    output: str
    scheme: str
    complete: bool
    segments: tuple[TransliterationSegment, ...]


class Token(SyllableSegment):
    script: str


class TokenizationResult(TextResult):
    tokens: tuple[Token, ...]
    scripts: tuple[str, ...]
    mixed_script: bool = Field(alias="mixedScript")


class BatchItem(Model):
    id: str
    text: str


class BatchError(Model):
    code: str
    message: str


T = TypeVar("T", bound=Model)


class BatchSuccess(Model, Generic[T]):
    id: str
    success: Literal[True]
    result: T


class BatchFailure(Model):
    id: str
    success: Literal[False]
    error: BatchError


class BatchResult(Model, Generic[T]):
    results: tuple[BatchSuccess[T] | BatchFailure, ...]
