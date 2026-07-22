import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/api/patient_api.dart';
import '../../../core/theme/app_colors.dart';

class MensagensTab extends StatefulWidget {
  const MensagensTab({super.key});

  @override
  State<MensagensTab> createState() => _MensagensTabState();
}

class _MensagensTabState extends State<MensagensTab> {
  List<Map<String, dynamic>> _msgs = [];
  bool _loading = true;
  bool _sending = false;
  bool _uploading = false;
  final _input = TextEditingController();
  final _scroll = ScrollController();
  StreamSubscription? _sub;

  @override
  void initState() {
    super.initState();
    _listen();
  }

  @override
  void dispose() {
    _sub?.cancel();
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  // Realtime: a lista se atualiza sozinha a cada mudança em messages.
  void _listen() {
    _sub = PatientApi.instance.messagesStream().listen(
      (rows) {
        if (!mounted) return;
        setState(() {
          _msgs = rows;
          _loading = false;
        });
        _scrollToEnd();
      },
      onError: (_) {
        if (mounted) setState(() => _loading = false);
      },
    );
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    _input.clear();
    try {
      await PatientApi.instance.sendMessage(text);
    } catch (_) {
      _input.text = text;
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _attach(String type) async {
    if (_uploading) return;
    final FileType ft = switch (type) {
      'image' => FileType.image,
      'video' => FileType.video,
      'audio' => FileType.audio,
      _ => FileType.custom,
    };
    final result = await FilePicker.platform.pickFiles(
      type: ft,
      allowedExtensions: type == 'pdf' ? ['pdf'] : null,
      withData: true,
    );
    final file = result?.files.single;
    final bytes = file?.bytes;
    if (file == null || bytes == null) return;

    setState(() => _uploading = true);
    try {
      final att = await PatientApi.instance.uploadChatAttachment(
        bytes,
        filename: file.name,
        type: type,
      );
      await PatientApi.instance.sendMessage(_input.text.trim(), attachment: att);
      _input.clear();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Falha ao enviar anexo: $e')));
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  void _openAttachSheet() {
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.image_outlined),
              title: const Text('Imagem'),
              onTap: () {
                Navigator.pop(context);
                _attach('image');
              },
            ),
            ListTile(
              leading: const Icon(Icons.picture_as_pdf_outlined),
              title: const Text('PDF'),
              onTap: () {
                Navigator.pop(context);
                _attach('pdf');
              },
            ),
            ListTile(
              leading: const Icon(Icons.videocam_outlined),
              title: const Text('Vídeo'),
              onTap: () {
                Navigator.pop(context);
                _attach('video');
              },
            ),
            ListTile(
              leading: const Icon(Icons.mic_none_outlined),
              title: const Text('Áudio'),
              onTap: () {
                Navigator.pop(context);
                _attach('audio');
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mensagens')),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _msgs.isEmpty
                    ? const Center(
                        child: Text('Sem mensagens. Fale com a clínica.',
                            style: TextStyle(color: AppColors.textLight)))
                    : ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.all(16),
                        itemCount: _msgs.length,
                        itemBuilder: (context, i) => _bubble(_msgs[i]),
                      ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
              child: Row(
                children: [
                  IconButton(
                    onPressed: _uploading ? null : _openAttachSheet,
                    icon: _uploading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.attach_file),
                  ),
                  Expanded(
                    child: TextField(
                      controller: _input,
                      minLines: 1,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        hintText: 'Escreva uma mensagem...',
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    onPressed: _sending ? null : _send,
                    icon: const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _bubble(Map<String, dynamic> m) {
    final mine = m['sender'] == 'patient';
    final dt = DateTime.parse(m['created_at'] as String).toLocal();
    final body = (m['body'] as String?) ?? '';
    final hasAttachment = m['attachment_path'] != null;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints:
            BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        decoration: BoxDecoration(
          color: mine ? AppColors.primary600 : AppColors.surface2Light,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(mine ? 16 : 4),
            bottomRight: Radius.circular(mine ? 4 : 16),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (hasAttachment) _attachment(m, mine),
            if (body.isNotEmpty)
              Text(body,
                  style: TextStyle(
                      color: mine ? Colors.white : AppColors.textStrongLight)),
            const SizedBox(height: 2),
            Text(DateFormat('HH:mm').format(dt),
                style: TextStyle(
                    fontSize: 11,
                    color: mine ? Colors.white70 : AppColors.textMuted)),
          ],
        ),
      ),
    );
  }

  Widget _attachment(Map<String, dynamic> m, bool mine) {
    final type = m['attachment_type'] as String?;
    final path = m['attachment_path'] as String;
    final name = (m['attachment_name'] as String?) ?? 'Anexo';

    if (type == 'image') {
      return Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: FutureBuilder<String>(
          future: PatientApi.instance.signedAttachmentUrl(path),
          builder: (context, snap) {
            if (!snap.hasData) {
              return const SizedBox(
                  height: 120,
                  child: Center(child: CircularProgressIndicator(strokeWidth: 2)));
            }
            return ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Image.network(snap.data!,
                  width: 200, fit: BoxFit.cover),
            );
          },
        ),
      );
    }

    final icon = switch (type) {
      'pdf' => Icons.picture_as_pdf_outlined,
      'video' => Icons.videocam_outlined,
      'audio' => Icons.mic_none_outlined,
      _ => Icons.insert_drive_file_outlined,
    };
    final fg = mine ? Colors.white : AppColors.textStrongLight;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        onTap: () async {
          final url = await PatientApi.instance.signedAttachmentUrl(path);
          await launchUrl(Uri.parse(url),
              mode: LaunchMode.externalApplication);
        },
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 20, color: fg),
            const SizedBox(width: 6),
            Flexible(
              child: Text(name,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: fg, decoration: TextDecoration.underline)),
            ),
          ],
        ),
      ),
    );
  }
}
