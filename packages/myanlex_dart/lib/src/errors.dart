/// Non-2xx HTTP result. The HTTP status is authoritative.
final class MyanLexApiException implements Exception {
  final int status;
  final Map<String, Object?>? problem;
  final int? retryAfterSeconds;
  MyanLexApiException(
    this.status,
    Map<String, Object?>? problem,
    this.retryAfterSeconds,
  ) : problem = problem == null ? null : Map.unmodifiable(problem);
  String? get code =>
      problem?['code'] is String ? problem!['code'] as String : null;
  String? get requestId =>
      problem?['requestId'] is String ? problem!['requestId'] as String : null;
  @override
  String toString() => 'MyanLex API returned HTTP $status.';
}

/// Local request failure; never includes keys, text, or raw transport errors.
final class MyanLexRequestException implements Exception {
  final String kind;
  const MyanLexRequestException(this.kind);
  @override
  String toString() => 'MyanLex request failed: $kind.';
}
