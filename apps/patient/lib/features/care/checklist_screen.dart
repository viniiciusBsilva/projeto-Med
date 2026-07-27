import 'package:flutter/material.dart';

import '../../core/api/patient_api.dart';
import '../../core/theme/app_colors.dart';

/// Checklist de cuidados da fase ativa (pré/pós-operatório), marcável a cada dia.
class ChecklistScreen extends StatefulWidget {
  const ChecklistScreen({super.key, required this.phase});

  final String phase; // 'preop' | 'postop'

  static String phaseLabel(String phase) =>
      phase == 'preop' ? 'pré-operatório' : 'pós-operatório';

  @override
  State<ChecklistScreen> createState() => _ChecklistScreenState();
}

class _ChecklistScreenState extends State<ChecklistScreen> {
  List<Map<String, dynamic>> _items = [];
  Set<String> _done = {};
  bool _loading = true;
  final Set<String> _saving = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => _loading = true);
    try {
      final results = await Future.wait([
        PatientApi.instance.checklistItems(widget.phase),
        PatientApi.instance.todayChecklistDone(),
      ]);
      if (mounted) {
        setState(() {
          _items = results[0] as List<Map<String, dynamic>>;
          _done = results[1] as Set<String>;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggle(String id, bool value) async {
    // Otimista: atualiza a UI e reverte se falhar.
    setState(() {
      _saving.add(id);
      if (value) {
        _done.add(id);
      } else {
        _done.remove(id);
      }
    });
    try {
      await PatientApi.instance.setChecklistItemDone(id, value);
    } catch (_) {
      if (mounted) {
        setState(() {
          if (value) {
            _done.remove(id);
          } else {
            _done.add(id);
          }
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Não foi possível salvar. Tente de novo.')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving.remove(id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final label = ChecklistScreen.phaseLabel(widget.phase);
    final total = _items.length;
    final doneCount = _items.where((i) => _done.contains(i['id'])).length;
    final progress = total == 0 ? 0.0 : doneCount / total;

    return Scaffold(
      appBar: AppBar(title: Text('Checklist $label')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: _items.isEmpty
                  ? ListView(
                      children: const [
                        SizedBox(height: 120),
                        Icon(Icons.checklist_rtl, size: 48, color: AppColors.textMuted),
                        SizedBox(height: 12),
                        Center(
                            child: Text('Nenhum item de checklist para esta fase.',
                                style: TextStyle(color: AppColors.textLight))),
                      ],
                    )
                  : ListView(
                      padding: const EdgeInsets.all(16),
                      children: [
                        // Progresso do dia
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    const Icon(Icons.today_outlined, color: AppColors.primary600),
                                    const SizedBox(width: 8),
                                    Text('Cuidados de hoje',
                                        style: Theme.of(context)
                                            .textTheme
                                            .titleMedium
                                            ?.copyWith(fontWeight: FontWeight.w700)),
                                    const Spacer(),
                                    Text('$doneCount/$total',
                                        style: const TextStyle(
                                            color: AppColors.textLight, fontWeight: FontWeight.w600)),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(999),
                                  child: LinearProgressIndicator(
                                    value: progress,
                                    minHeight: 8,
                                    backgroundColor: AppColors.surface2Light,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 12),
                        // Itens
                        Card(
                          clipBehavior: Clip.antiAlias,
                          child: Column(
                            children: [
                              for (var i = 0; i < _items.length; i++) ...[
                                if (i > 0) const Divider(height: 1),
                                _itemTile(_items[i]),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        const Text(
                          'Marque os cuidados que você seguiu hoje. A lista reinicia a cada dia.',
                          style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                        ),
                      ],
                    ),
            ),
    );
  }

  Widget _itemTile(Map<String, dynamic> item) {
    final id = item['id'] as String;
    final checked = _done.contains(id);
    return CheckboxListTile(
      value: checked,
      onChanged: _saving.contains(id) ? null : (v) => _toggle(id, v ?? false),
      controlAffinity: ListTileControlAffinity.leading,
      title: Text(
        item['text'] as String? ?? '',
        style: TextStyle(
          decoration: checked ? TextDecoration.lineThrough : null,
          color: checked ? AppColors.textMuted : null,
        ),
      ),
    );
  }
}
