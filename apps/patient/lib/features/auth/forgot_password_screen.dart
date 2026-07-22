import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../core/theme/app_colors.dart';

/// Recuperação de senha em 3 etapas (reusa as Edge Functions do backend):
/// e-mail -> código (valida) -> nova senha.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  int _step = 0; // 0 email, 1 código, 2 senha, 3 pronto
  bool _loading = false;
  String? _error;

  final _email = TextEditingController();
  final _code = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  SupabaseClient get _c => Supabase.instance.client;

  @override
  void dispose() {
    _email.dispose();
    _code.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _error = null;
      _loading = true;
    });
    try {
      await action();
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _requestCode() => _run(() async {
        await _c.functions.invoke('password-reset-request',
            body: {'email': _email.text.trim().toLowerCase()});
        setState(() => _step = 1);
      });

  Future<void> _verifyCode() => _run(() async {
        final res = await _c.functions.invoke('password-reset-verify',
            body: {'email': _email.text.trim().toLowerCase(), 'code': _code.text.trim()});
        final err = (res.data as Map?)?['error'];
        if (err != null) throw Exception(err.toString());
        setState(() => _step = 2);
      });

  Future<void> _reset() => _run(() async {
        if (_password.text.length < 8) throw Exception('A senha deve ter ao menos 8 caracteres.');
        if (_password.text != _confirm.text) throw Exception('As senhas não conferem.');
        final res = await _c.functions.invoke('password-reset-confirm', body: {
          'email': _email.text.trim().toLowerCase(),
          'code': _code.text.trim(),
          'newPassword': _password.text,
        });
        final err = (res.data as Map?)?['error'];
        if (err != null) throw Exception(err.toString());
        setState(() => _step = 3);
      });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Recuperar senha')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: _buildStep(context),
          ),
        ),
      ),
    );
  }

  Widget _buildStep(BuildContext context) {
    if (_step == 3) {
      return Column(children: [
        const SizedBox(height: 24),
        const Icon(Icons.check_circle_outline, size: 56, color: AppColors.success),
        const SizedBox(height: 16),
        Text('Senha redefinida',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        const Text('Você já pode entrar com a nova senha.'),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          child: FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Ir para o login')),
        ),
      ]);
    }

    final List<Widget> fields;
    final String title, subtitle, button;
    final Future<void> Function() onPressed;

    if (_step == 0) {
      title = 'Recuperar senha';
      subtitle = 'Informe seu e-mail. Enviaremos um código.';
      button = 'Enviar código';
      onPressed = _requestCode;
      fields = [
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          decoration: const InputDecoration(labelText: 'E-mail', prefixIcon: Icon(Icons.mail_outline)),
        ),
      ];
    } else if (_step == 1) {
      title = 'Digite o código';
      subtitle = 'Enviamos um código para ${_email.text}. Expira em 15 minutos.';
      button = 'Verificar código';
      onPressed = _verifyCode;
      fields = [
        TextField(
          controller: _code,
          keyboardType: TextInputType.number,
          maxLength: 6,
          decoration: const InputDecoration(labelText: 'Código de verificação', prefixIcon: Icon(Icons.vpn_key_outlined)),
        ),
      ];
    } else {
      title = 'Nova senha';
      subtitle = 'Código confirmado. Defina sua nova senha.';
      button = 'Redefinir senha';
      onPressed = _reset;
      fields = [
        TextField(
          controller: _password,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Nova senha', prefixIcon: Icon(Icons.lock_outline)),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _confirm,
          obscureText: true,
          decoration: const InputDecoration(labelText: 'Confirmar nova senha', prefixIcon: Icon(Icons.lock_outline)),
        ),
      ];
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(title, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Text(subtitle, style: const TextStyle(color: AppColors.textLight)),
        const SizedBox(height: 24),
        ...fields,
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: const TextStyle(color: AppColors.danger)),
        ],
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _loading ? null : () => onPressed(),
          style: FilledButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 16)),
          child: Text(_loading ? 'Aguarde...' : button),
        ),
      ],
    );
  }
}
