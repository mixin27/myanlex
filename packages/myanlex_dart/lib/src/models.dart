typedef Json = Map<String, Object?>;

Json object(Object? value) => Map<String, Object?>.from(value as Map);
List<T> objects<T>(Json json, String key, T Function(Json) parse) =>
    List.unmodifiable((json[key] as List).map((value) => parse(object(value))));

/// Immutable text span using Unicode code-point offsets, not UTF-16 indexes.
class TextSegment {
  final int start, end;
  final String text, kind;
  TextSegment.fromJson(Json json)
    : start = json['start'] as int,
      end = json['end'] as int,
      text = json['text'] as String,
      kind = json['kind'] as String;
}

final class TextToken extends TextSegment {
  final String script;
  TextToken.fromJson(super.json)
    : script = json['script'] as String,
      super.fromJson();
}

final class NormalizationResult {
  final String input, output, profile;
  final bool changed;
  NormalizationResult.fromJson(Json json)
    : input = json['input'] as String,
      output = json['output'] as String,
      profile = json['profile'] as String,
      changed = json['changed'] as bool;
}

final class ConversionResult {
  final String input, output, profile, from, to;
  final bool changed;
  ConversionResult.fromJson(Json json)
    : input = json['input'] as String,
      output = json['output'] as String,
      profile = json['profile'] as String,
      from = json['from'] as String,
      to = json['to'] as String,
      changed = json['changed'] as bool;
}

final class SyllabificationResult {
  final String input, profile;
  final List<TextSegment> segments;
  SyllabificationResult.fromJson(Json json)
    : input = json['input'] as String,
      profile = json['profile'] as String,
      segments = objects(json, 'segments', TextSegment.fromJson);
}

final class EncodingSegment {
  final int start, end;
  final String text, encoding;
  final double? zawgyiProbability;
  EncodingSegment.fromJson(Json json)
    : start = json['start'] as int,
      end = json['end'] as int,
      text = json['text'] as String,
      encoding = json['encoding'] as String,
      zawgyiProbability = (json['zawgyiProbability'] as num?)?.toDouble();
}

final class DetectionResult {
  final String input, profile, encoding;
  final double? confidence;
  final List<EncodingSegment> segments;
  DetectionResult.fromJson(Json json)
    : input = json['input'] as String,
      profile = json['profile'] as String,
      encoding = json['encoding'] as String,
      confidence = (json['confidence'] as num?)?.toDouble(),
      segments = objects(json, 'segments', EncodingSegment.fromJson);
}

final class OrthographyDiagnostic {
  final int start, end;
  final String code, severity, message;
  OrthographyDiagnostic.fromJson(Json json)
    : start = json['start'] as int,
      end = json['end'] as int,
      code = json['code'] as String,
      severity = json['severity'] as String,
      message = json['message'] as String;
}

final class OrthographyResult {
  final String input, profile;
  final bool valid;
  final List<OrthographyDiagnostic> diagnostics;
  OrthographyResult.fromJson(Json json)
    : input = json['input'] as String,
      profile = json['profile'] as String,
      valid = json['valid'] as bool,
      diagnostics = objects(
        json,
        'diagnostics',
        OrthographyDiagnostic.fromJson,
      );
}

final class TransliterationSegment {
  final int start, end;
  final String kind, input, output;
  TransliterationSegment.fromJson(Json json)
    : start = json['start'] as int,
      end = json['end'] as int,
      kind = json['kind'] as String,
      input = json['input'] as String,
      output = json['output'] as String;
}

final class TransliterationResult {
  final String input, output, scheme, profile;
  final bool complete;
  final List<TransliterationSegment> segments;
  TransliterationResult.fromJson(Json json)
    : input = json['input'] as String,
      output = json['output'] as String,
      scheme = json['scheme'] as String,
      profile = json['profile'] as String,
      complete = json['complete'] as bool,
      segments = objects(json, 'segments', TransliterationSegment.fromJson);
}

final class TokenizationResult {
  final String input, profile;
  final bool mixedScript;
  final List<String> scripts;
  final List<TextToken> tokens;
  TokenizationResult.fromJson(Json json)
    : input = json['input'] as String,
      profile = json['profile'] as String,
      mixedScript = json['mixedScript'] as bool,
      scripts = List.unmodifiable((json['scripts'] as List).cast<String>()),
      tokens = objects(json, 'tokens', TextToken.fromJson);
}

final class HealthResult {
  final String status, version;
  HealthResult.fromJson(Json json)
    : status = json['status'] as String,
      version = json['version'] as String;
}

final class BatchItem {
  final String id, text;
  const BatchItem({required this.id, required this.text});
  Json toJson() => {'id': id, 'text': text};
}

sealed class BatchItemResult<T> {
  final String id;
  const BatchItemResult(this.id);
}

final class BatchSuccess<T> extends BatchItemResult<T> {
  final T result;
  const BatchSuccess(super.id, this.result);
}

final class BatchFailure<T> extends BatchItemResult<T> {
  final String code, message;
  const BatchFailure(super.id, this.code, this.message);
}

final class BatchResult<T> {
  final List<BatchItemResult<T>> results;
  BatchResult.fromJson(Json json, T Function(Json) parse)
    : results = objects(json, 'results', (item) {
        final id = item['id'] as String;
        if (item['success'] == true) {
          return BatchSuccess(id, parse(object(item['result'])));
        }
        if (item['success'] != false) {
          throw const FormatException('Invalid batch result');
        }
        final error = object(item['error']);
        return BatchFailure<T>(
          id,
          error['code'] as String,
          error['message'] as String,
        );
      });
}
