import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:myanlex_dart/myanlex_dart.dart';
import 'package:test/test.dart';

http.Response json(
  Object value, {
  int status = 200,
  Map<String, String> headers = const {},
}) => http.Response(
  jsonEncode(value),
  status,
  headers: {'content-type': 'application/json; charset=utf-8', ...headers},
);
final normalized = {
  'input': 'က😀',
  'output': 'က😀',
  'changed': false,
  'profile': 'unicode-nfc',
};
Matcher failure(String kind) =>
    isA<MyanLexRequestException>().having((error) => error.kind, 'kind', kind);

final class PendingClient extends http.BaseClient {
  bool closed = false;
  int calls = 0;
  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    calls++;
    final stream = StreamController<List<int>>();
    (request as http.AbortableRequest).abortTrigger!.then((_) {
      stream.addError(http.RequestAbortedException());
      stream.close();
    });
    return http.StreamedResponse(
      stream.stream,
      200,
      headers: {'content-type': 'application/json'},
    );
  }

  @override
  void close() {
    closed = true;
  }
}

void main() {
  test(
    'preserves Unicode, prefix, auth, redirect policy, and response types',
    () async {
      final client = MyanLex(
        apiKey: 'secret',
        baseUrl: 'http://localhost:3001/prefix/v1/',
        client: MockClient((request) async {
          expect(request.url.path, '/prefix/v1/text/normalize');
          expect(request.headers['authorization'], 'Bearer secret');
          expect(request.followRedirects, false);
          expect(jsonDecode(utf8.decode(request.bodyBytes)), {'text': 'က😀'});
          return json(normalized);
        }),
      );
      final result = await client.normalize(text: 'က😀');
      expect(result.output, 'က😀');
      expect(result.changed, false);
      client.close();
    },
  );

  test(
    'all nine language routes match OpenAPI and decode typed results',
    () async {
      final contract = File('../../openapi/openapi.yaml').readAsStringSync();
      final seen = <String>[];
      final client = MyanLex(
        apiKey: 'secret',
        client: MockClient((request) async {
          final path = request.url.path.substring(3);
          seen.add(path);
          expect(contract, contains('  $path:\n    post:'));
          final base = {'input': 'က', 'profile': 'test'};
          final values = <String, Object>{
            '/text/detect': {
              ...base,
              'encoding': 'unknown',
              'confidence': null,
              'segments': [],
            },
            '/text/normalize': normalized,
            '/text/convert': {...normalized, 'from': 'unicode', 'to': 'zawgyi'},
            '/syllabify': {
              ...base,
              'segments': [
                {'start': 0, 'end': 2, 'text': 'က😀', 'kind': 'non_myanmar'},
              ],
            },
            '/orthography/validate': {
              ...base,
              'valid': false,
              'diagnostics': [
                {
                  'start': 0,
                  'end': 1,
                  'code': 'future_code',
                  'severity': 'error',
                  'message': 'issue',
                },
              ],
            },
            '/transliterate': {
              ...base,
              'output': 'ka',
              'scheme': 'ala-lc-2011',
              'complete': true,
              'segments': [],
            },
            '/tokenize': {
              ...base,
              'mixedScript': false,
              'scripts': ['myanmar'],
              'tokens': [],
            },
            '/batch/syllabify': {
              'results': [
                {
                  'id': 'bad',
                  'success': false,
                  'error': {'code': 'invalid_unicode', 'message': 'bad'},
                },
                {
                  'id': 'good',
                  'success': true,
                  'result': {...base, 'segments': []},
                },
              ],
            },
            '/batch/transliterate': {'results': []},
          };
          return json(values[path]!);
        }),
      );
      expect((await client.detect(text: 'က')).confidence, isNull);
      await client.normalize(text: 'က');
      expect(
        (await client.convert(text: 'က', from: 'unicode', to: 'zawgyi')).to,
        'zawgyi',
      );
      expect((await client.syllabify(text: 'က😀')).segments.single.end, 2);
      expect(
        (await client.validateOrthography(text: 'က')).diagnostics.single.code,
        'future_code',
      );
      expect(
        (await client.transliterate(text: 'က', scheme: 'ala-lc-2011')).output,
        'ka',
      );
      expect((await client.tokenize(text: 'က')).scripts, ['myanmar']);
      final batch = await client.batchSyllabify(
        items: [
          BatchItem(id: 'bad', text: '\ud800'),
          BatchItem(id: 'good', text: 'က'),
        ],
      );
      expect(batch.results.first, isA<BatchFailure<SyllabificationResult>>());
      expect(batch.results.last, isA<BatchSuccess<SyllabificationResult>>());
      expect(() => batch.results.clear(), throwsUnsupportedError);
      await client.batchTransliterate(items: [], scheme: 'ala-lc-2011');
      expect(seen.toSet(), hasLength(9));
      client.close();
    },
  );

  test('health does not send the key', () async {
    final client = MyanLex(
      apiKey: 'secret',
      client: MockClient((request) async {
        expect(request.headers.containsKey('authorization'), false);
        return json({'status': 'ok', 'version': 'test'});
      }),
    );
    expect((await client.health()).status, 'ok');
    client.close();
  });

  for (final status in [301, 401, 403, 413, 429, 503]) {
    test(
      'HTTP $status retains status/code/retry info without replay',
      () async {
        var count = 0;
        final client = MyanLex(
          apiKey: 'secret',
          client: MockClient((request) async {
            count++;
            return json(
              {'code': 'quota_exceeded', 'requestId': 'req', 'status': 999},
              status: status,
              headers: {'retry-after': '60'},
            );
          }),
        );
        await expectLater(
          client.normalize(text: 'private'),
          throwsA(
            isA<MyanLexApiException>()
                .having((e) => e.status, 'status', status)
                .having((e) => e.code, 'code', 'quota_exceeded')
                .having((e) => e.retryAfterSeconds, 'retry', 60),
          ),
        );
        expect(count, 1);
        client.close();
      },
    );
  }
  test('non-JSON HTTP errors are sanitized', () async {
    final client = MyanLex(
      apiKey: 'secret',
      client: MockClient(
        (_) async => http.Response('secret private text', 502),
      ),
    );
    await expectLater(
      client.normalize(text: 'private'),
      throwsA(
        isA<MyanLexApiException>()
            .having((e) => e.toString(), 'message', isNot(contains('secret')))
            .having((e) => e.problem, 'problem', isNull),
      ),
    );
    client.close();
  });
  for (final value in [
    null,
    [],
    {},
    {'input': 123},
  ]) {
    test('invalid response schema $value is a typed failure', () async {
      final client = MyanLex(
        apiKey: 'secret',
        client: MockClient((_) async => json(value ?? 'null')),
      );
      await expectLater(
        client.normalize(text: ''),
        throwsA(failure('invalid_response')),
      );
      client.close();
    });
  }
  test('network errors are sanitized', () async {
    final client = MyanLex(
      apiKey: 'secret',
      client: MockClient((_) async => throw Exception('secret')),
    );
    await expectLater(
      client.normalize(text: ''),
      throwsA(failure('transport_failure')),
    );
    client.close();
  });
  test(
    'timeout covers stalled response body and does not close borrowed client',
    () async {
      final httpClient = PendingClient();
      final client = MyanLex(
        apiKey: 'secret',
        client: httpClient,
        timeout: Duration(milliseconds: 10),
      );
      await expectLater(
        client.normalize(text: ''),
        throwsA(failure('timeout')),
      );
      client.close();
      expect(httpClient.closed, false);
      expect(httpClient.calls, 1);
    },
  );
  test('cancel before dispatch, in-flight cancellation and close', () async {
    final httpClient = PendingClient();
    final client = MyanLex(apiKey: 'secret', client: httpClient);
    final cancelled = CancellationToken()..cancel();
    await expectLater(
      client.normalize(text: '', cancellation: cancelled),
      throwsA(failure('aborted')),
    );
    expect(httpClient.calls, 0);
    final token = CancellationToken();
    final pending = client.normalize(text: '', cancellation: token);
    token.cancel();
    await expectLater(pending, throwsA(failure('aborted')));
    final closing = client.normalize(text: '');
    client.close();
    client.close();
    await expectLater(closing, throwsA(failure('closed')));
    await expectLater(client.health(), throwsA(failure('closed')));
  });
  test('rejects unsafe configuration without revealing secrets', () {
    for (final url in [
      'invalid',
      'http://example.com/v1',
      'https://user:secret@example.com/v1',
      'https://example.com/v1?q=secret',
      'https://example.com/v1#secret',
    ]) {
      expect(
        () => MyanLex(apiKey: 'secret', baseUrl: url),
        throwsArgumentError,
      );
    }
    for (final key in ['', ' ', 'key\nvalue']) {
      expect(() => MyanLex(apiKey: key), throwsArgumentError);
    }
    expect(
      () => MyanLex(apiKey: 'secret', timeout: Duration.zero),
      throwsArgumentError,
    );
  });
  test('Retry-After HTTP dates and invalid headers', () async {
    for (final header in ['Thu, 01 Jan 2099 00:00:00 GMT', '-1', 'bad']) {
      final client = MyanLex(
        apiKey: 'secret',
        client: MockClient(
          (_) async => json({}, status: 429, headers: {'retry-after': header}),
        ),
      );
      try {
        await client.health();
        fail('Expected error');
      } on MyanLexApiException catch (error) {
        expect(
          error.retryAfterSeconds,
          header.startsWith('Thu') ? isNonNegative : isNull,
        );
      } finally {
        client.close();
      }
    }
  });
}
