import 'package:flutter/material.dart';

import '../../../core/api/patient_api.dart';
import '../../../core/theme/app_colors.dart';

class NotificacoesTab extends StatefulWidget {
  const NotificacoesTab({super.key});

  @override
  State<NotificacoesTab> createState() => _NotificacoesTabState();
}

class _NotificacoesTabState extends State<NotificacoesTab> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final rows = await PatientApi.instance.notifications();
      if (mounted) {
        setState(() {
          _items = rows;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  (Color, IconData) _style(String severity) => switch (severity) {
        'critical' => (AppColors.danger, Icons.warning_amber_rounded),
        'warning' => (AppColors.warning, Icons.info_outline),
        _ => (AppColors.primary600, Icons.notifications_none),
      };

  String _ago(DateTime dt) {
    final d = DateTime.now().difference(dt);
    if (d.inMinutes < 1) return 'agora';
    if (d.inMinutes < 60) return '${d.inMinutes} min atrás';
    if (d.inHours < 24) return '${d.inHours} h atrás';
    return '${d.inDays} d atrás';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notificações')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: _items.isEmpty
                  ? ListView(
                      children: const [
                        SizedBox(height: 120),
                        Icon(Icons.notifications_off_outlined, size: 48, color: AppColors.textMuted),
                        SizedBox(height: 12),
                        Center(child: Text('Nenhuma notificação.', style: TextStyle(color: AppColors.textLight))),
                      ],
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: _items.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, i) {
                        final n = _items[i];
                        final (color, icon) = _style(n['severity'] as String? ?? 'info');
                        final read = n['read'] == true;
                        final dt = DateTime.parse(n['created_at'] as String).toLocal();
                        return Card(
                          child: ListTile(
                            onTap: read
                                ? null
                                : () async {
                                    await PatientApi.instance.markNotificationRead(n['id'] as String);
                                    _load();
                                  },
                            leading: CircleAvatar(
                              backgroundColor: color.withValues(alpha: 0.12),
                              child: Icon(icon, color: color),
                            ),
                            title: Text(n['title'] ?? '',
                                style: TextStyle(fontWeight: read ? FontWeight.w500 : FontWeight.w700)),
                            subtitle: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (n['description'] != null) Text(n['description']),
                                const SizedBox(height: 2),
                                Text(_ago(dt), style: const TextStyle(fontSize: 11, color: AppColors.textMuted)),
                              ],
                            ),
                            trailing: read ? null : const Icon(Icons.circle, size: 10, color: AppColors.primary600),
                          ),
                        );
                      },
                    ),
            ),
    );
  }
}
