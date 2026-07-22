import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Camada de dados do paciente. Usa a sessão do supabase_flutter (RLS por paciente).
class PatientApi {
  PatientApi._();
  static final PatientApi instance = PatientApi._();

  SupabaseClient get _c => Supabase.instance.client;
  String? get _uid => _c.auth.currentUser?.id;

  // ---------- cadastro ----------
  /// Cria o paciente via Edge Function e faz login em seguida.
  Future<void> signUp({
    required String fullName,
    required String email,
    required String password,
    String? cpf,
    String? birthDate,
    String? phone,
    String? technique,
    String? region,
    int? graftsEstimate,
    String? medications,
    String? allergies,
    String? comorbidities,
    bool smoker = false,
  }) async {
    final res = await _c.functions.invoke('patient-signup', body: {
      'fullName': fullName,
      'email': email,
      'password': password,
      'cpf': cpf,
      'birthDate': birthDate,
      'phone': phone,
      'technique': technique,
      'region': region,
      'graftsEstimate': graftsEstimate,
      'medications': medications,
      'allergies': allergies,
      'comorbidities': comorbidities,
      'smoker': smoker,
    });
    final data = res.data as Map?;
    if (data != null && data['error'] != null) {
      throw Exception(data['error'].toString());
    }
    await _c.auth.signInWithPassword(email: email, password: password);
  }

  Future<void> signIn(String email, String password) =>
      _c.auth.signInWithPassword(email: email, password: password);

  Future<void> signOut() => _c.auth.signOut();

  // ---------- perfil ----------
  Future<String?> currentPatientId() async {
    if (_uid == null) return null;
    final row = await _c.from('profiles').select('patient_id').eq('id', _uid!).maybeSingle();
    return row?['patient_id'] as String?;
  }

  Future<Map<String, dynamic>?> myPatient() async {
    final pid = await currentPatientId();
    if (pid == null) return null;
    return await _c.from('patients').select().eq('id', pid).maybeSingle();
  }

  Future<void> updateProfileName(String name) async {
    final pid = await currentPatientId();
    if (_uid != null) await _c.from('profiles').update({'full_name': name}).eq('id', _uid!);
    if (pid != null) await _c.from('patients').update({'full_name': name}).eq('id', pid);
  }

  // ---------- acompanhamento (Início) ----------
  /// Cirurgia ativa do paciente (base do D+n).
  Future<Map<String, dynamic>?> activeSurgery() async {
    final pid = await currentPatientId();
    if (pid == null) return null;
    final rows = await _c
        .from('surgeries')
        .select('id, date, surgery_type, protocol_id, status')
        .eq('patient_id', pid)
        .order('date', ascending: false)
        .limit(1);
    return (rows as List).isEmpty ? null : rows.first;
  }

  /// Orientação do dia: passo do protocolo para o D+n atual.
  Future<Map<String, dynamic>> orientation() async {
    final surgery = await activeSurgery();
    if (surgery == null) {
      return {'dPos': null, 'title': 'Sem procedimento cadastrado', 'instructions': '', 'surgeryType': null};
    }
    final date = DateTime.parse(surgery['date'] as String);
    final dPos = DateTime.now().difference(date).inDays;
    final steps = await _c
        .from('protocol_steps')
        .select('day_offset, title, instructions')
        .eq('protocol_id', surgery['protocol_id'])
        .order('day_offset', ascending: true);
    Map<String, dynamic>? current;
    for (final s in steps) {
      if ((s['day_offset'] as int) <= dPos) current = s;
    }
    current ??= (steps.isNotEmpty ? steps.first : null);
    return {
      'dPos': dPos,
      'surgeryType': surgery['surgery_type'],
      'title': current?['title'] ?? 'Acompanhamento',
      'instructions': current?['instructions'] ?? '',
    };
  }

  Future<bool> hasCheckinToday() async {
    final pid = await currentPatientId();
    if (pid == null) return false;
    final today = DateTime.now().toIso8601String().substring(0, 10);
    final rows = await _c
        .from('checkins')
        .select('id, created_at')
        .eq('patient_id', pid)
        .gte('created_at', '${today}T00:00:00');
    return rows.isNotEmpty;
  }

  Future<void> submitCheckin({
    int? pain,
    bool fever = false,
    bool bleeding = false,
    bool swelling = false,
    bool redness = false,
    bool itching = false,
    bool crusts = false,
    String? feeling,
    String? notes,
  }) async {
    final surgery = await activeSurgery();
    if (surgery == null) throw Exception('Sem cirurgia ativa para registrar o check-in.');
    await _c.from('checkins').insert({
      'surgery_id': surgery['id'],
      'pain': pain,
      'fever': fever,
      'bleeding': bleeding,
      'swelling': swelling,
      'redness': redness,
      'itching': itching,
      'crusts': crusts,
      'feeling': feeling,
      'notes': notes,
    });
  }

  // ---------- agenda ----------
  Future<List<Map<String, dynamic>>> appointments() async {
    final rows = await _c
        .from('appointments')
        .select('id, title, type, scheduled_at, professional')
        .order('scheduled_at', ascending: true);
    return (rows as List).cast<Map<String, dynamic>>();
  }

  // ---------- mensagens ----------
  static const _chatBucket = 'chat-attachments';

  Future<List<Map<String, dynamic>>> messages() async {
    final rows = await _c
        .from('messages')
        .select(
            'id, sender, body, read, created_at, attachment_path, attachment_type, attachment_name')
        .order('created_at', ascending: true);
    return (rows as List).cast<Map<String, dynamic>>();
  }

  /// Stream em tempo real das mensagens do paciente (ordenadas por data).
  Stream<List<Map<String, dynamic>>> messagesStream() {
    return _c
        .from('messages')
        .stream(primaryKey: ['id'])
        .order('created_at')
        .map((rows) => rows.cast<Map<String, dynamic>>());
  }

  /// Gera uma URL assinada (1h) para exibir/abrir um anexo do bucket privado.
  Future<String> signedAttachmentUrl(String path) {
    return _c.storage.from(_chatBucket).createSignedUrl(path, 60 * 60);
  }

  /// Faz upload de um anexo do chat e devolve os metadados para gravar na mensagem.
  Future<Map<String, String>> uploadChatAttachment(
    Uint8List bytes, {
    required String filename,
    required String type, // image | pdf | video | audio
    String? contentType,
  }) async {
    final pid = await currentPatientId();
    if (pid == null) throw Exception('Paciente não encontrado.');
    final ext = filename.contains('.') ? filename.split('.').last : 'bin';
    final path = '$pid/${type}_${DateTime.now().millisecondsSinceEpoch}.$ext';
    await _c.storage.from(_chatBucket).uploadBinary(
          path,
          bytes,
          fileOptions: FileOptions(contentType: contentType),
        );
    return {'path': path, 'type': type, 'name': filename};
  }

  Future<void> sendMessage(String body, {Map<String, String>? attachment}) async {
    final pid = await currentPatientId();
    final patient = await myPatient();
    if (pid == null || patient == null) throw Exception('Paciente não encontrado.');
    await _c.from('messages').insert({
      'clinic_id': patient['clinic_id'],
      'patient_id': pid,
      'sender': 'patient',
      'body': body.isEmpty ? null : body,
      'read': false,
      'attachment_path': attachment?['path'],
      'attachment_type': attachment?['type'],
      'attachment_name': attachment?['name'],
    });
  }

  // ---------- notificações ----------
  Future<List<Map<String, dynamic>>> notifications() async {
    final rows = await _c
        .from('notifications')
        .select('id, type, title, description, severity, read, created_at')
        .order('created_at', ascending: false);
    return (rows as List).cast<Map<String, dynamic>>();
  }

  Future<void> markNotificationRead(String id) =>
      _c.from('notifications').update({'read': true}).eq('id', id);

  // ---------- fotos ----------
  /// Envia os bytes da foto ao Storage (web e mobile).
  Future<void> uploadHeadPhoto(Uint8List bytes, {required String filename, required String label}) async {
    final pid = await currentPatientId();
    if (pid == null) throw Exception('Paciente não encontrado.');
    final ext = filename.contains('.') ? filename.split('.').last : 'jpg';
    final path = '$pid/${label}_${DateTime.now().millisecondsSinceEpoch}.$ext';
    await _c.storage.from('patient-photos').uploadBinary(path, bytes);
  }
}
