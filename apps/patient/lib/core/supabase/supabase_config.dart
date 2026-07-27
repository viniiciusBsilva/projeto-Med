import 'package:supabase_flutter/supabase_flutter.dart';

/// Inicialização do Supabase.
///
/// Os fallbacks abaixo são a URL e a chave pública (anon/legacy) do projeto
/// "projeto-med" (ref ktfhmrgwbclewlwbqtag), confirmadas via Supabase MCP.
/// É chave pública, protegida por RLS — pode ficar no client (docs/PROJECT_STANDARDS.md §7).
/// Assim o app roda com `flutter run` puro, sem precisar de flag.
///
/// Para outro ambiente (staging/prod), sobrescreva sem tocar no código:
///   flutter run --dart-define-from-file=dart_define.json
/// (o valor de --dart-define tem precedência sobre o defaultValue).
class SupabaseConfig {
  SupabaseConfig._();

  static const _url = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://ktfhmrgwbclewlwbqtag.supabase.co',
  );
  static const _anonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0Zmhtcmd3YmNsZXdsd2JxdGFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1OTQzNTcsImV4cCI6MjEwMDE3MDM1N30.ZML2Cy0ATta-BZdNO151Jz17_-psdvIkGztpTbpPGvE',
  );

  static Future<void> init() async {
    if (_url.isEmpty || _anonKey.isEmpty) {
      // Sem config ainda: o app sobe mostrando o placeholder. Amarração real vem na fase 1.
      return;
    }
    // ignore: deprecated_member_use — _anonKey é a chave pública (legacy anon) do projeto.
    await Supabase.initialize(url: _url, anonKey: _anonKey);
  }

  static bool get isConfigured => _url.isNotEmpty && _anonKey.isNotEmpty;
}
