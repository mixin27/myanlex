import 'dart:io';

import 'package:myanlex_dart/myanlex_dart.dart';

void check(bool condition, String message) {
  if (!condition) throw StateError(message);
}

Future<void> main() async {
  final client = MyanLex(
    apiKey: Platform.environment['MYANLEX_SMOKE_KEY']!,
    baseUrl: Platform.environment['MYANLEX_SMOKE_URL']!,
  );
  try {
    check((await client.health()).status == 'ok', 'health');
    check(
      (await client.detect(text: 'မြန်မာ')).profile == 'zawgyi-unicode-v1',
      'detect',
    );
    check((await client.normalize(text: 'က😀')).output == 'က😀', 'normalize');
    check(
      (await client.convert(
            text: 'က',
            from: 'unicode',
            to: 'unicode',
          )).output ==
          'က',
      'convert',
    );
    check(
      (await client.syllabify(text: 'က😀')).segments.last.end == 2,
      'code points',
    );
    check((await client.validateOrthography(text: 'က')).valid, 'orthography');
    check(
      (await client.transliterate(text: 'က', scheme: 'ala-lc-2011')).complete,
      'transliterate',
    );
    check(
      (await client.tokenize(text: 'က😀')).tokens.last.end == 2,
      'tokenize',
    );
    final batch = await client.batchSyllabify(
      items: [
        BatchItem(id: 'ok', text: 'က'),
        BatchItem(id: 'bad', text: '\ud800'),
      ],
    );
    check(
      batch.results[0] is BatchSuccess && batch.results[1] is BatchFailure,
      'batch failures',
    );
    check(
      (await client.batchTransliterate(
            items: [BatchItem(id: 'a', text: 'က')],
            scheme: 'ala-lc-2011',
          )).results.single
          is BatchSuccess,
      'batch transliterate',
    );
    try {
      await client.convert(text: 'က', from: 'invalid', to: 'unicode');
      throw StateError('Missing validation');
    } on MyanLexApiException catch (error) {
      check(error.status == 400, 'validation status');
    }
    try {
      await client.normalize(text: 'က');
      throw StateError('Missing limit');
    } on MyanLexApiException catch (error) {
      check(
        error.status == 429 &&
            error.code == 'rate_limited' &&
            error.retryAfterSeconds! > 0,
        'limit status',
      );
    }
    stdout.writeln(
      'Dart SDK smoke test passed against all nine NestJS language routes.',
    );
  } finally {
    client.close();
  }
}
