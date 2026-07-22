import 'package:flutter/foundation.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Push via FCM. O app funciona SEM Firebase configurado: se a init falhar,
/// o push fica desativado silenciosamente e o restante do app segue normal.
class PushService {
  PushService._();

  static bool available = false;

  static Future<void> init() async {
    try {
      await Firebase.initializeApp();
      available = true;
    } catch (_) {
      available = false; // sem google-services.json / firebase_options -> desativado
    }
  }

  /// Registra o token do dispositivo em device_tokens (chamar após o login).
  static Future<void> registerToken(String patientId) async {
    if (!available) return;
    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();
      final token = await messaging.getToken();
      if (token == null) return;
      final client = Supabase.instance.client;
      await client.from('device_tokens').upsert(
        {
          'user_id': client.auth.currentUser!.id,
          'patient_id': patientId,
          'token': token,
          'platform': kIsWeb ? 'web' : defaultTargetPlatform.name,
          'updated_at': DateTime.now().toIso8601String(),
        },
        onConflict: 'token',
      );
    } catch (_) {
      // silencioso — não bloqueia o app
    }
  }
}
