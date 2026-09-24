import 'dart:io';

import 'package:myanlex_dart/myanlex_dart.dart';

Future<void> main() async {
  final key = Platform.environment['MYANLEX_API_KEY'];
  if (key == null) {
    stderr.writeln('Set MYANLEX_API_KEY in your server environment.');
    exitCode = 1;
    return;
  }
  final client = MyanLex(
    apiKey: key,
    baseUrl:
        Platform.environment['MYANLEX_API_URL'] ?? 'http://localhost:3001/v1',
  );
  try {
    final result = await client.syllabify(text: 'မြန်မာစာ');
    for (final segment in result.segments) {
      stdout.writeln('${segment.start}..${segment.end}: ${segment.text}');
    }
  } on MyanLexApiException catch (error) {
    stderr.writeln('HTTP ${error.status}: ${error.code}');
    exitCode = 1;
  } on MyanLexRequestException catch (error) {
    stderr.writeln(error);
    exitCode = 1;
  } finally {
    client.close();
  }
}
