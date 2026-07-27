import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/supabase/supabase_config.dart';
import 'auth/login_screen.dart';
import 'home/home_shell.dart';
import 'onboarding/onboarding_screen.dart';
import 'splash/splash_screen.dart';

/// Decide a tela raiz: splash -> onboarding (1ª vez) -> login / home (por sessão).
class RootGate extends StatefulWidget {
  const RootGate({super.key});

  @override
  State<RootGate> createState() => _RootGateState();
}

class _RootGateState extends State<RootGate> {
  bool _ready = false;
  bool _onboarded = false;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    final prefs = await SharedPreferences.getInstance();
    _onboarded = prefs.getBool('onboarded') ?? false;
    await Future.delayed(const Duration(milliseconds: 1400)); // tempo mínimo do splash
    if (mounted) setState(() => _ready = true);
  }

  Future<void> _finishOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('onboarded', true);
    if (mounted) setState(() => _onboarded = true);
  }

  @override
  Widget build(BuildContext context) {
    if (!_ready) return const SplashScreen();
    if (!_onboarded) return OnboardingScreen(onDone: _finishOnboarding);
    if (!SupabaseConfig.isConfigured) return const _NotConfigured();

    return StreamBuilder<AuthState>(
      stream: Supabase.instance.client.auth.onAuthStateChange,
      builder: (context, _) {
        final session = Supabase.instance.client.auth.currentSession;
        return session != null ? const HomeShell() : const LoginScreen();
      },
    );
  }
}

class _NotConfigured extends StatelessWidget {
  const _NotConfigured();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Padding(
        padding: EdgeInsets.all(24),
        child: Center(
          child: Text(
            'Supabase não configurado.\nCopie dart_define.example.json → dart_define.json e rode com\nflutter run --dart-define-from-file=dart_define.json',
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}
