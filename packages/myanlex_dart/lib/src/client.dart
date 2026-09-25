import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart' show parseHttpDate;

import 'cancellation.dart';
import 'errors.dart';
import 'models.dart';

/// Server-side API-key client. Never embed long-lived keys in distributed apps.
final class MyanLex {
  final String _apiKey;
  final Uri _base;
  final Duration timeout;
  final http.Client _client;
  final bool _ownsClient;
  final _pending = <void Function(String)>{};
  bool _closed = false;

  MyanLex({
    required String apiKey,
    String baseUrl = 'https://api.myanlex.dev/v1',
    this.timeout = const Duration(seconds: 30),
    http.Client? client,
  }) : _apiKey = apiKey,
       _base = _validateUrl(baseUrl),
       _client = client ?? http.Client(),
       _ownsClient = client == null {
    if (apiKey.isEmpty ||
        apiKey.codeUnits.any((unit) => unit < 33 || unit > 126)) {
      if (_ownsClient) _client.close();
      throw ArgumentError(
        'Provide a non-empty ASCII API key without whitespace.',
      );
    }
    if (timeout <= Duration.zero) {
      if (_ownsClient) _client.close();
      throw ArgumentError('timeout must be positive.');
    }
  }

  static Uri _validateUrl(String value) {
    final uri = Uri.tryParse(value);
    if (uri == null ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.hasQuery ||
        uri.hasFragment ||
        (uri.scheme != 'https' &&
            !(uri.scheme == 'http' &&
                ['localhost', '127.0.0.1', '::1'].contains(uri.host)))) {
      throw ArgumentError(
        'baseUrl requires HTTPS (HTTP on loopback only), without credentials, query, or fragment.',
      );
    }
    return uri.replace(path: uri.path.replaceFirst(RegExp(r'/+$'), ''));
  }

  Future<HealthResult> health({CancellationToken? cancellation}) =>
      _request('health', null, HealthResult.fromJson, cancellation);
  Future<DetectionResult> detect({
    required String text,
    CancellationToken? cancellation,
  }) => _request(
    'text/detect',
    {'text': text},
    DetectionResult.fromJson,
    cancellation,
  );
  Future<NormalizationResult> normalize({
    required String text,
    CancellationToken? cancellation,
  }) => _request(
    'text/normalize',
    {'text': text},
    NormalizationResult.fromJson,
    cancellation,
  );
  Future<ConversionResult> convert({
    required String text,
    required String from,
    required String to,
    bool? validateSource,
    CancellationToken? cancellation,
  }) => _request(
    'text/convert',
    {'text': text, 'from': from, 'to': to, 'validateSource': ?validateSource},
    ConversionResult.fromJson,
    cancellation,
  );
  Future<SyllabificationResult> syllabify({
    required String text,
    CancellationToken? cancellation,
  }) => _request(
    'syllabify',
    {'text': text},
    SyllabificationResult.fromJson,
    cancellation,
  );
  Future<OrthographyResult> validateOrthography({
    required String text,
    CancellationToken? cancellation,
  }) => _request(
    'orthography/validate',
    {'text': text},
    OrthographyResult.fromJson,
    cancellation,
  );
  Future<TransliterationResult> transliterate({
    required String text,
    required String scheme,
    CancellationToken? cancellation,
  }) => _request(
    'transliterate',
    {'text': text, 'scheme': scheme},
    TransliterationResult.fromJson,
    cancellation,
  );
  Future<TokenizationResult> tokenize({
    required String text,
    CancellationToken? cancellation,
  }) => _request(
    'tokenize',
    {'text': text},
    TokenizationResult.fromJson,
    cancellation,
  );
  Future<BatchResult<SyllabificationResult>> batchSyllabify({
    required List<BatchItem> items,
    CancellationToken? cancellation,
  }) => _request(
    'batch/syllabify',
    {'items': items.map((item) => item.toJson()).toList()},
    (json) => BatchResult.fromJson(json, SyllabificationResult.fromJson),
    cancellation,
  );
  Future<BatchResult<TransliterationResult>> batchTransliterate({
    required List<BatchItem> items,
    required String scheme,
    CancellationToken? cancellation,
  }) => _request(
    'batch/transliterate',
    {'items': items.map((item) => item.toJson()).toList(), 'scheme': scheme},
    (json) => BatchResult.fromJson(json, TransliterationResult.fromJson),
    cancellation,
  );

  Future<T> _request<T>(
    String path,
    Json? body,
    T Function(Json) parse,
    CancellationToken? cancellation,
  ) async {
    if (_closed) throw const MyanLexRequestException('closed');
    if (cancellation?.isCancelled == true) {
      throw const MyanLexRequestException('aborted');
    }
    final abort = Completer<void>();
    final failure = Completer<T>();
    String? stopped;
    void stop(String kind) {
      if (stopped != null) return;
      stopped = kind;
      abort.complete();
      failure.completeError(MyanLexRequestException(kind));
    }

    final request =
        http.AbortableRequest(
            body == null ? 'GET' : 'POST',
            _base.replace(path: '${_base.path}/$path'),
            abortTrigger: abort.future,
          )
          ..followRedirects = false
          ..headers['accept'] = 'application/json';
    if (body != null) {
      request.headers['authorization'] = 'Bearer $_apiKey';
      request.headers['content-type'] = 'application/json; charset=utf-8';
      request.bodyBytes = utf8.encode(jsonEncode(body));
    }
    _pending.add(stop);
    final remove = cancellation?.listen(() => stop('aborted'));
    final timer = Timer(timeout, () => stop('timeout'));
    Future<T> send() async {
      try {
        final response = await _client.send(request);
        final bytes = await response.stream.toBytes();
        if (stopped != null) throw MyanLexRequestException(stopped!);
        Object? value;
        try {
          value = jsonDecode(utf8.decode(bytes));
        } catch (_) {
          value = null;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          final problem = value is Map<String, dynamic>
              ? <String, Object?>{
                  for (final field in [
                    'type',
                    'title',
                    'code',
                    'detail',
                    'instance',
                    'requestId',
                  ])
                    if (value[field] is String) field: value[field],
                }
              : null;
          throw MyanLexApiException(
            response.statusCode,
            problem,
            _retryAfter(response.headers['retry-after']),
          );
        }
        if (response.headers['content-type']
                ?.split(';')
                .first
                .trim()
                .toLowerCase() !=
            'application/json') {
          throw const MyanLexRequestException('invalid_response');
        }
        try {
          return parse(object(value));
        } catch (_) {
          throw const MyanLexRequestException('invalid_response');
        }
      } on MyanLexApiException {
        rethrow;
      } on MyanLexRequestException {
        rethrow;
      } catch (_) {
        throw MyanLexRequestException(stopped ?? 'transport_failure');
      }
    }

    try {
      return await Future.any([send(), failure.future]);
    } finally {
      timer.cancel();
      remove?.call();
      _pending.remove(stop);
    }
  }

  static int? _retryAfter(String? value) {
    if (value == null) return null;
    if (RegExp(r'^\d+$').hasMatch(value)) return int.tryParse(value);
    try {
      return (parseHttpDate(value)
                  .difference(DateTime.now().toUtc())
                  .inMilliseconds /
              1000)
          .ceil()
          .clamp(0, 2147483647);
    } catch (_) {
      return null;
    }
  }

  /// Cancels pending calls. Only closes the HTTP client when created internally.
  void close() {
    if (_closed) return;
    _closed = true;
    for (final stop in List.of(_pending)) {
      stop('closed');
    }
    if (_ownsClient) _client.close();
  }
}
