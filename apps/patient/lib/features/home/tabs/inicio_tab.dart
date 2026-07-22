import 'package:flutter/material.dart';

import '../../../core/api/patient_api.dart';
import '../../../core/theme/app_colors.dart';

class InicioTab extends StatefulWidget {
  const InicioTab({super.key});

  @override
  State<InicioTab> createState() => _InicioTabState();
}

class _InicioTabState extends State<InicioTab> {
  Map<String, dynamic>? _orientation;
  bool _checkedInToday = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    try {
      final o = await PatientApi.instance.orientation();
      final c = await PatientApi.instance.hasCheckinToday();
      if (mounted) {
        setState(() {
          _orientation = o;
          _checkedInToday = c;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _openCheckin() async {
    final done = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _CheckinSheet(),
    );
    if (done == true) _load();
  }

  @override
  Widget build(BuildContext context) {
    final o = _orientation;
    final dPos = o?['dPos'];
    return Scaffold(
      appBar: AppBar(title: const Text('Início')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Orientação do dia
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                decoration: BoxDecoration(
                                  color: AppColors.primary600.withValues(alpha: 0.1),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  dPos == null ? 'Sem procedimento' : 'Dia D+$dPos',
                                  style: const TextStyle(color: AppColors.primary700, fontWeight: FontWeight.w600, fontSize: 12),
                                ),
                              ),
                              const Spacer(),
                              if (o?['surgeryType'] != null)
                                Text(o!['surgeryType'], style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Text(o?['title'] ?? 'Acompanhamento',
                              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                          const SizedBox(height: 8),
                          Text(o?['instructions'] ?? '', style: const TextStyle(color: AppColors.textLight, height: 1.5)),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  // Check-in do dia
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.fact_check_outlined, color: AppColors.primary600),
                              const SizedBox(width: 8),
                              Text('Check-in diário',
                                  style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _checkedInToday
                                ? 'Você já registrou o check-in de hoje. Obrigado!'
                                : 'Registre como você está para a equipe acompanhar sua evolução.',
                            style: const TextStyle(color: AppColors.textLight),
                          ),
                          const SizedBox(height: 12),
                          SizedBox(
                            width: double.infinity,
                            child: _checkedInToday
                                ? OutlinedButton.icon(
                                    onPressed: null,
                                    icon: const Icon(Icons.check),
                                    label: const Text('Check-in de hoje enviado'),
                                  )
                                : FilledButton.icon(
                                    onPressed: _openCheckin,
                                    icon: const Icon(Icons.add),
                                    label: const Text('Fazer check-in de hoje'),
                                    style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14)),
                                  ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

/// Formulário de check-in (sinais do couro cabeludo).
class _CheckinSheet extends StatefulWidget {
  const _CheckinSheet();

  @override
  State<_CheckinSheet> createState() => _CheckinSheetState();
}

class _CheckinSheetState extends State<_CheckinSheet> {
  double _pain = 0;
  bool _redness = false, _itching = false, _crusts = false, _swelling = false, _bleeding = false, _fever = false;
  String _feeling = 'bem';
  final _notes = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _error = null;
      _saving = true;
    });
    try {
      await PatientApi.instance.submitCheckin(
        pain: _pain.round(),
        redness: _redness,
        itching: _itching,
        crusts: _crusts,
        swelling: _swelling,
        bleeding: _bleeding,
        fever: _fever,
        feeling: _feeling,
        notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
      );
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _saving = false;
      });
    }
  }

  Widget _sign(String label, bool value, ValueChanged<bool> onChanged) {
    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      dense: true,
      title: Text(label),
      value: value,
      onChanged: onChanged,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 4,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Check-in de hoje',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            Text('Dor (0 a 10): ${_pain.round()}'),
            Slider(value: _pain, min: 0, max: 10, divisions: 10, label: _pain.round().toString(),
                onChanged: (v) => setState(() => _pain = v)),
            _sign('Vermelhidão no couro', _redness, (v) => setState(() => _redness = v)),
            _sign('Coceira', _itching, (v) => setState(() => _itching = v)),
            _sign('Crostas', _crusts, (v) => setState(() => _crusts = v)),
            _sign('Edema (inchaço na testa)', _swelling, (v) => setState(() => _swelling = v)),
            _sign('Sangramento', _bleeding, (v) => setState(() => _bleeding = v)),
            _sign('Febre', _fever, (v) => setState(() => _fever = v)),
            const SizedBox(height: 8),
            const Text('Como você se sente?'),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _feeling,
              items: const [
                DropdownMenuItem(value: 'bem', child: Text('Bem')),
                DropdownMenuItem(value: 'regular', child: Text('Regular')),
                DropdownMenuItem(value: 'mal', child: Text('Mal')),
              ],
              onChanged: (v) => setState(() => _feeling = v ?? 'bem'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _notes,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'Observações (opcional)'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: AppColors.danger)),
            ],
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: _saving ? null : _save,
                style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                child: Text(_saving ? 'Enviando...' : 'Enviar check-in'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
