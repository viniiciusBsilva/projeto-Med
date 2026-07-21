import 'package:flutter/material.dart';

import '../../core/supabase/supabase_config.dart';

/// Placeholder inicial. As features do paciente (PRD §6) entram como telas próprias:
/// onboarding, orientation, checkin, messages, appointments.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('PostCare Pro')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.favorite_border, size: 48, color: theme.colorScheme.primary),
              const SizedBox(height: 16),
              Text('Acompanhamento pós-operatório',
                  style: theme.textTheme.titleLarge, textAlign: TextAlign.center),
              const SizedBox(height: 8),
              Text(
                SupabaseConfig.isConfigured
                    ? 'Supabase configurado. Esqueleto pronto para as features do paciente.'
                    : 'Esqueleto inicial. Configure o Supabase via --dart-define para conectar.',
                style: theme.textTheme.bodyMedium,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
