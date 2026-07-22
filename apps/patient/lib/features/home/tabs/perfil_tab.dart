import 'package:flutter/material.dart';

import '../../../core/api/patient_api.dart';
import '../../../core/push/push_service.dart';
import '../../../core/theme/app_colors.dart';

class PerfilTab extends StatefulWidget {
  const PerfilTab({super.key});

  @override
  State<PerfilTab> createState() => _PerfilTabState();
}

class _PerfilTabState extends State<PerfilTab> {
  Map<String, dynamic>? _patient;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final p = await PatientApi.instance.myPatient();
      if (mounted) {
        setState(() {
          _patient = p;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _editName() async {
    final controller = TextEditingController(text: _patient?['full_name'] ?? '');
    final novo = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Editar nome'),
        content: TextField(controller: controller, decoration: const InputDecoration(labelText: 'Nome completo')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
          FilledButton(onPressed: () => Navigator.pop(context, controller.text.trim()), child: const Text('Salvar')),
        ],
      ),
    );
    if (novo != null && novo.isNotEmpty) {
      await PatientApi.instance.updateProfileName(novo);
      _load();
    }
  }

  Future<void> _logout() async {
    await PatientApi.instance.signOut();
    // O RootGate volta para o login ao detectar o fim da sessão.
  }

  String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    return parts.take(2).map((p) => p.isNotEmpty ? p[0].toUpperCase() : '').join();
  }

  @override
  Widget build(BuildContext context) {
    final p = _patient;
    return Scaffold(
      appBar: AppBar(title: const Text('Perfil')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Center(
                  child: Column(
                    children: [
                      CircleAvatar(
                        radius: 40,
                        backgroundColor: AppColors.primary600.withValues(alpha: 0.12),
                        child: Text(
                          _initials(p?['full_name'] ?? '?'),
                          style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700, color: AppColors.primary700),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(p?['full_name'] ?? '—',
                          style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                      if (p?['email'] != null)
                        Text(p!['email'], style: const TextStyle(color: AppColors.textLight)),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                Card(
                  child: Column(
                    children: [
                      ListTile(
                        leading: const Icon(Icons.person_outline),
                        title: const Text('Nome'),
                        subtitle: Text(p?['full_name'] ?? '—'),
                        trailing: const Icon(Icons.edit_outlined),
                        onTap: _editName,
                      ),
                      const Divider(height: 1),
                      ListTile(
                        leading: const Icon(Icons.phone_outlined),
                        title: const Text('Telefone'),
                        subtitle: Text(p?['phone'] ?? 'Não informado'),
                      ),
                      const Divider(height: 1),
                      ListTile(
                        leading: const Icon(Icons.badge_outlined),
                        title: const Text('CPF'),
                        subtitle: Text(p?['cpf'] ?? 'Não informado'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Card(
                  child: ListTile(
                    leading: Icon(
                      PushService.available ? Icons.notifications_active_outlined : Icons.notifications_off_outlined,
                      color: PushService.available ? AppColors.success : AppColors.textMuted,
                    ),
                    title: const Text('Notificações push'),
                    subtitle: Text(PushService.available ? 'Ativadas neste dispositivo' : 'Indisponíveis (Firebase não configurado)'),
                  ),
                ),
                const SizedBox(height: 24),
                OutlinedButton.icon(
                  onPressed: _logout,
                  icon: const Icon(Icons.logout, color: AppColors.danger),
                  label: const Text('Sair', style: TextStyle(color: AppColors.danger)),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    side: BorderSide(color: AppColors.danger.withValues(alpha: 0.4)),
                  ),
                ),
              ],
            ),
    );
  }
}
