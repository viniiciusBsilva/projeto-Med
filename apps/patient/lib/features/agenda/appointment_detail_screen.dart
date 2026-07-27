import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/theme/app_colors.dart';

/// Detalhes de uma consulta/retorno/procedimento da agenda.
class AppointmentDetailScreen extends StatelessWidget {
  const AppointmentDetailScreen({super.key, required this.appointment});

  final Map<String, dynamic> appointment;

  static String typeLabel(String t) => switch (t) {
        'return' => 'Retorno',
        'consultation' => 'Consulta',
        'surgery' => 'Procedimento',
        _ => 'Alerta',
      };

  static (Color, IconData) _typeStyle(String t) => switch (t) {
        'return' => (AppColors.primary600, Icons.replay_rounded),
        'consultation' => (AppColors.success, Icons.medical_services_outlined),
        'surgery' => (AppColors.warning, Icons.local_hospital_outlined),
        _ => (AppColors.danger, Icons.warning_amber_rounded),
      };

  String _relative(DateTime dt) {
    final now = DateTime.now();
    final d0 = DateTime(now.year, now.month, now.day);
    final d1 = DateTime(dt.year, dt.month, dt.day);
    final diff = d1.difference(d0).inDays;
    if (diff == 0) return 'Hoje';
    if (diff == 1) return 'Amanhã';
    if (diff == -1) return 'Ontem';
    if (diff > 1) return 'Em $diff dias';
    return 'Há ${-diff} dias';
  }

  @override
  Widget build(BuildContext context) {
    final type = (appointment['type'] as String?) ?? 'consultation';
    final title = (appointment['title'] as String?) ?? typeLabel(type);
    final professional = appointment['professional'] as String?;
    final dt = DateTime.parse(appointment['scheduled_at'] as String).toLocal();
    final (color, icon) = _typeStyle(type);
    final isPast = dt.isBefore(DateTime.now());

    final dateFull = DateFormat("EEEE, d 'de' MMMM 'de' y", 'pt_BR').format(dt);
    final time = DateFormat('HH:mm').format(dt);

    return Scaffold(
      appBar: AppBar(title: const Text('Detalhes')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Cabeçalho
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: color.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Icon(icon, color: color),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _pill(typeLabel(type), color),
                            const SizedBox(height: 6),
                            Text(title,
                                style: Theme.of(context)
                                    .textTheme
                                    .titleLarge
                                    ?.copyWith(fontWeight: FontWeight.w700)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: (isPast ? AppColors.textMuted : color).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(isPast ? Icons.history : Icons.schedule,
                            size: 16, color: isPast ? AppColors.textMuted : color),
                        const SizedBox(width: 6),
                        Text(_relative(dt),
                            style: TextStyle(
                                color: isPast ? AppColors.textMuted : color,
                                fontWeight: FontWeight.w600,
                                fontSize: 13)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          // Informações
          Card(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Column(
                children: [
                  _row(Icons.event_outlined, 'Data', _cap(dateFull)),
                  const Divider(height: 1),
                  _row(Icons.access_time, 'Horário', time),
                  const Divider(height: 1),
                  _row(Icons.person_outline, 'Profissional', professional ?? 'A definir'),
                  const Divider(height: 1),
                  _row(Icons.category_outlined, 'Tipo', typeLabel(type)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          // Lembrete
          const Card(
            color: AppColors.primary50,
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.info_outline, color: AppColors.primary600, size: 20),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'Chegue com 10 minutos de antecedência. Precisa remarcar? '
                      'Fale com a clínica pela aba Mensagens.',
                      style: TextStyle(color: AppColors.primary700, height: 1.4, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _pill(String text, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(text,
            style: TextStyle(color: color, fontWeight: FontWeight.w600, fontSize: 12)),
      );

  Widget _row(IconData icon, String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(
          children: [
            Icon(icon, size: 20, color: AppColors.textMuted),
            const SizedBox(width: 14),
            Text(label, style: const TextStyle(color: AppColors.textLight)),
            const Spacer(),
            Flexible(
              child: Text(value,
                  textAlign: TextAlign.right,
                  style: const TextStyle(fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      );

  String _cap(String s) => s.isEmpty ? s : '${s[0].toUpperCase()}${s.substring(1)}';
}
