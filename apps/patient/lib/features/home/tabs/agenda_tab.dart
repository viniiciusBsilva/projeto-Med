import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../core/api/patient_api.dart';
import '../../../core/theme/app_colors.dart';

class AgendaTab extends StatefulWidget {
  const AgendaTab({super.key});

  @override
  State<AgendaTab> createState() => _AgendaTabState();
}

class _AgendaTabState extends State<AgendaTab> {
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    try {
      final rows = await PatientApi.instance.appointments();
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

  String _typeLabel(String t) => switch (t) {
        'return' => 'Retorno',
        'consultation' => 'Consulta',
        'surgery' => 'Procedimento',
        _ => 'Alerta',
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Agenda')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: _items.isEmpty
                  ? ListView(
                      children: const [
                        SizedBox(height: 120),
                        Icon(Icons.event_available_outlined, size: 48, color: AppColors.textMuted),
                        SizedBox(height: 12),
                        Center(child: Text('Nenhum agendamento ainda.', style: TextStyle(color: AppColors.textLight))),
                      ],
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: _items.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (context, i) {
                        final a = _items[i];
                        final dt = DateTime.parse(a['scheduled_at'] as String).toLocal();
                        return Card(
                          child: Padding(
                            padding: const EdgeInsets.all(14),
                            child: Row(
                              children: [
                                Container(
                                  width: 52,
                                  height: 52,
                                  decoration: BoxDecoration(
                                    color: AppColors.primary600.withValues(alpha: 0.1),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text(DateFormat('dd').format(dt),
                                          style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary700)),
                                      Text(DateFormat('MMM', 'pt_BR').format(dt),
                                          style: const TextStyle(fontSize: 11, color: AppColors.primary700)),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(a['title'] ?? _typeLabel(a['type']),
                                          style: const TextStyle(fontWeight: FontWeight.w600)),
                                      const SizedBox(height: 2),
                                      Text('${DateFormat('HH:mm').format(dt)} · ${_typeLabel(a['type'])}'
                                          '${a['professional'] != null ? ' · ${a['professional']}' : ''}',
                                          style: const TextStyle(color: AppColors.textLight, fontSize: 13)),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
    );
  }
}
