import 'package:supabase_flutter/supabase_flutter.dart';

/// Inicialização do Supabase. Passe as chaves públicas via --dart-define:
///   flutter run --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...
/// Segredos nunca no cliente (ver docs/PROJECT_STANDARDS.md §7).
class SupabaseConfig {
  SupabaseConfig._();

  static const _url = String.fromEnvironment('SUPABASE_URL');
  static const _anonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

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
