import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'core/push/push_service.dart';
import 'core/supabase/supabase_config.dart';
import 'core/theme/app_theme.dart';
import 'features/root_gate.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('pt_BR', null);
  await SupabaseConfig.init();
  await PushService.init();
  runApp(const PostCareApp());
}

class PostCareApp extends StatelessWidget {
  const PostCareApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PostCare Pro',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      home: const RootGate(),
    );
  }
}
