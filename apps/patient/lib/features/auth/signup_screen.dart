import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api/patient_api.dart';
import '../../core/push/push_service.dart';
import '../../core/theme/app_colors.dart';

final _emailRegex = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

/// Validação de CPF (dígitos verificadores).
bool _isValidCpf(String value) {
  final d = value.replaceAll(RegExp(r'\D'), '');
  if (d.length != 11) return false;
  if (RegExp(r'^(\d)\1{10}$').hasMatch(d)) return false; // todos iguais
  int check(int len) {
    var sum = 0;
    for (var i = 0; i < len; i++) {
      sum += int.parse(d[i]) * (len + 1 - i);
    }
    final r = (sum * 10) % 11;
    return r == 10 ? 0 : r;
  }

  return check(9) == int.parse(d[9]) && check(10) == int.parse(d[10]);
}

class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _formKey = GlobalKey<FormState>();
  int _step = 0; // 0 pessoais, 1 procedimento, 2 saúde, 3 fotos
  bool _loading = false;
  String? _error;

  // pessoais
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _cpf = TextEditingController();
  final _birth = TextEditingController(); // yyyy-mm-dd
  final _phone = TextEditingController();

  // procedimento
  String _technique = 'FUE';
  String _region = 'frontal';
  final _grafts = TextEditingController();

  // saúde
  final _medications = TextEditingController();
  final _allergies = TextEditingController();
  final _comorbidities = TextEditingController();
  bool _smoker = false;

  // fotos
  final List<XFile> _photos = [];

  @override
  void dispose() {
    for (final c in [_name, _email, _password, _cpf, _birth, _phone, _grafts, _medications, _allergies, _comorbidities]) {
      c.dispose();
    }
    super.dispose();
  }

  bool _validateStep() {
    setState(() => _error = null);
    if (_step == 0) {
      // Validação por campo (mostra o erro embaixo de cada input).
      return _formKey.currentState?.validate() ?? false;
    }
    return true;
  }

  Future<void> _pickBirthDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year - 30),
      firstDate: DateTime(1920),
      lastDate: now,
      helpText: 'Data de nascimento',
    );
    if (picked != null) {
      _birth.text = picked.toIso8601String().substring(0, 10);
      setState(() {});
    }
  }

  Future<void> _pickPhotos() async {
    final picker = ImagePicker();
    final imgs = await picker.pickMultiImage();
    if (imgs.isNotEmpty) setState(() => _photos.addAll(imgs));
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _loading = true;
    });
    try {
      await PatientApi.instance.signUp(
        fullName: _name.text.trim(),
        email: _email.text.trim().toLowerCase(),
        password: _password.text,
        cpf: _cpf.text.trim().isEmpty ? null : _cpf.text.trim(),
        birthDate: _birth.text.trim().isEmpty ? null : _birth.text.trim(),
        phone: _phone.text.trim().isEmpty ? null : _phone.text.trim(),
        technique: _technique,
        region: _region,
        graftsEstimate: int.tryParse(_grafts.text.trim()),
        medications: _medications.text.trim(),
        allergies: _allergies.text.trim(),
        comorbidities: _comorbidities.text.trim(),
        smoker: _smoker,
      );
      // Já logado: envia as fotos ao Storage (bytes — funciona em web e mobile).
      for (var i = 0; i < _photos.length; i++) {
        final bytes = await _photos[i].readAsBytes();
        await PatientApi.instance.uploadHeadPhoto(bytes, filename: _photos[i].name, label: 'foto$i');
      }
      final pid = await PatientApi.instance.currentPatientId();
      if (pid != null) await PushService.registerToken(pid);
      if (mounted) Navigator.of(context).popUntil((r) => r.isFirst); // RootGate -> Home
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _next() {
    if (!_validateStep()) return;
    if (_step < 3) {
      setState(() => _step++);
    } else {
      _submit();
    }
  }

  void _back() {
    if (_step > 0) {
      setState(() => _step--);
    } else {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    const titles = ['Dados pessoais', 'Procedimento', 'Saúde', 'Fotos da cabeça'];
    return Scaffold(
      appBar: AppBar(title: Text('Cadastro · ${titles[_step]}')),
      body: SafeArea(
        child: Column(
          children: [
            LinearProgressIndicator(value: (_step + 1) / 4),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 480),
                  child: _buildStep(),
                ),
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
              ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _loading ? null : _back,
                      style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                      child: Text(_step == 0 ? 'Voltar' : 'Anterior'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      onPressed: _loading ? null : _next,
                      style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
                      child: Text(_loading ? 'Enviando...' : (_step == 3 ? 'Concluir cadastro' : 'Continuar')),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _field(
    TextEditingController c,
    String label, {
    TextInputType? type,
    bool obscure = false,
    int lines = 1,
    String? Function(String?)? validator,
    List<TextInputFormatter>? formatters,
    int? maxLength,
    bool readOnly = false,
    VoidCallback? onTap,
    Widget? suffixIcon,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: TextFormField(
        controller: c,
        keyboardType: type,
        obscureText: obscure,
        maxLines: lines,
        maxLength: maxLength,
        readOnly: readOnly,
        onTap: onTap,
        inputFormatters: formatters,
        validator: validator,
        decoration: InputDecoration(labelText: label, suffixIcon: suffixIcon),
      ),
    );
  }

  Widget _buildStep() {
    switch (_step) {
      case 0:
        return Form(
          key: _formKey,
          autovalidateMode: AutovalidateMode.onUserInteraction,
          child: Column(children: [
            _field(_name, 'Nome completo',
                validator: (v) => (v == null || v.trim().length < 3) ? 'Informe o nome completo.' : null),
            _field(_email, 'E-mail',
                type: TextInputType.emailAddress,
                validator: (v) => (v == null || !_emailRegex.hasMatch(v.trim())) ? 'E-mail inválido.' : null),
            _field(_password, 'Senha (mín. 8)',
                obscure: true,
                validator: (v) => (v == null || v.length < 8) ? 'A senha deve ter ao menos 8 caracteres.' : null),
            _field(_cpf, 'CPF',
                type: TextInputType.number,
                maxLength: 14,
                formatters: [_CpfInputFormatter()],
                validator: (v) {
                  final t = (v ?? '').trim();
                  if (t.isEmpty) return null; // opcional
                  return _isValidCpf(t) ? null : 'CPF inválido.';
                }),
            _field(_birth, 'Nascimento',
                readOnly: true,
                onTap: _pickBirthDate,
                suffixIcon: const Icon(Icons.calendar_today_outlined, size: 18)),
            _field(_phone, 'Telefone',
                type: TextInputType.phone,
                maxLength: 15,
                formatters: [_PhoneInputFormatter()],
                validator: (v) {
                  final digits = (v ?? '').replaceAll(RegExp(r'\D'), '');
                  if (digits.isEmpty) return null; // opcional
                  return digits.length < 10 ? 'Telefone incompleto.' : null;
                }),
          ]),
        );
      case 1:
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Técnica'),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: _technique,
            items: const [
              DropdownMenuItem(value: 'FUE', child: Text('FUE')),
              DropdownMenuItem(value: 'DHI', child: Text('DHI')),
            ],
            onChanged: (v) => setState(() => _technique = v ?? 'FUE'),
          ),
          const SizedBox(height: 16),
          const Text('Região'),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: _region,
            items: const [
              DropdownMenuItem(value: 'frontal', child: Text('Frontal / entradas')),
              DropdownMenuItem(value: 'coroa', child: Text('Coroa')),
              DropdownMenuItem(value: 'completo', child: Text('Completo')),
            ],
            onChanged: (v) => setState(() => _region = v ?? 'frontal'),
          ),
          const SizedBox(height: 16),
          _field(_grafts, 'Número estimado de fios/folículos', type: TextInputType.number),
        ]);
      case 2:
        return Column(children: [
          _field(_medications, 'Medicamentos em uso', lines: 2),
          _field(_allergies, 'Alergias', lines: 2),
          _field(_comorbidities, 'Comorbidades (ex.: diabetes, hipertensão)', lines: 2),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Fumante'),
            value: _smoker,
            onChanged: (v) => setState(() => _smoker = v),
          ),
        ]);
      default:
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Fotos da região da cabeça',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          const SizedBox(height: 4),
          const Text('Frontal, topo, laterais e nuca (doadora). Ajuda a equipe a avaliar sua evolução.',
              style: TextStyle(color: AppColors.textLight)),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: _pickPhotos,
            icon: const Icon(Icons.add_a_photo_outlined),
            label: const Text('Adicionar fotos'),
            style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
          ),
          const SizedBox(height: 16),
          if (_photos.isEmpty)
            const Text('Nenhuma foto adicionada.', style: TextStyle(color: AppColors.textMuted))
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (var i = 0; i < _photos.length; i++)
                  Stack(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: FutureBuilder<Uint8List>(
                          future: _photos[i].readAsBytes(),
                          builder: (context, snap) => snap.hasData
                              ? Image.memory(snap.data!, width: 96, height: 96, fit: BoxFit.cover)
                              : Container(
                                  width: 96,
                                  height: 96,
                                  color: AppColors.surface2Light,
                                  child: const Center(child: CircularProgressIndicator(strokeWidth: 2)),
                                ),
                        ),
                      ),
                      Positioned(
                        top: -8,
                        right: -8,
                        child: IconButton(
                          icon: const Icon(Icons.cancel, color: Colors.black54),
                          onPressed: () => setState(() => _photos.removeAt(i)),
                        ),
                      ),
                    ],
                  ),
              ],
            ),
        ]);
    }
  }
}

/// Máscara de CPF: 000.000.000-00
class _CpfInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final d = digits.length > 11 ? digits.substring(0, 11) : digits;
    final buf = StringBuffer();
    for (var i = 0; i < d.length; i++) {
      if (i == 3 || i == 6) buf.write('.');
      if (i == 9) buf.write('-');
      buf.write(d[i]);
    }
    final text = buf.toString();
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }
}

/// Máscara de telefone BR: (00) 00000-0000 (celular) ou (00) 0000-0000 (fixo)
class _PhoneInputFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final digits = newValue.text.replaceAll(RegExp(r'\D'), '');
    final d = digits.length > 11 ? digits.substring(0, 11) : digits;
    final buf = StringBuffer();
    for (var i = 0; i < d.length; i++) {
      if (i == 0) buf.write('(');
      if (i == 2) buf.write(') ');
      if (d.length > 10 ? i == 7 : i == 6) buf.write('-');
      buf.write(d[i]);
    }
    final text = buf.toString();
    return TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));
  }
}
