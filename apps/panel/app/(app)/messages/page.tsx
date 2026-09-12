'use client';

import * as React from 'react';
import {
  Search,
  Send,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Video,
  Mic,
  Phone,
  MoreVertical,
  Bot,
  CheckCheck,
  Check,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/status-badges';
import type { Patient, Message, Conversation } from '@/lib/types';
import {
  getPatients,
  getMessages,
  getConversations,
  setConversationAiEnabled,
  sendMessage,
  uploadChatAttachment,
  signMessageRow,
  markConversationRead,
} from '@/lib/queries';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type AttachKind = 'image' | 'pdf' | 'video' | 'audio';
const ACCEPT: Record<AttachKind, string> = {
  image: 'image/*',
  pdf: 'application/pdf',
  video: 'video/*',
  audio: 'audio/*',
};

export default function MessagesPage() {
  const [patients, setPatients] = React.useState<Patient[]>([]);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [selectedPatient, setSelectedPatient] = React.useState<Patient | null>(null);
  const [search, setSearch] = React.useState('');
  const [input, setInput] = React.useState('');
  const [uploading, setUploading] = React.useState<AttachKind | null>(null);
  const [togglingAi, setTogglingAi] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const pendingKind = React.useRef<AttachKind | null>(null);
  const selectedPatientRef = React.useRef<Patient | null>(null);
  selectedPatientRef.current = selectedPatient;

  React.useEffect(() => {
    // ?patient=<id> vem da fila de alertas: a equipe clica em "abrir conversa"
    // e já cai no paciente certo, em vez de ter que procurar na lista.
    const wanted = new URLSearchParams(window.location.search).get('patient');
    getPatients().then((p) => {
      setPatients(p);
      setSelectedPatient((cur) => cur ?? p.find((x) => x.id === wanted) ?? p[0] ?? null);
    });
    getConversations().then(setConversations).catch(() => setConversations([]));
  }, []);

  // Carrega só a conversa aberta. Antes a tela baixava TODAS as mensagens da
  // clínica e filtrava no client — com o agente no ar isso não se sustenta.
  React.useEffect(() => {
    if (!selectedPatient) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    getMessages(selectedPatient.id)
      .then((m) => {
        if (!cancelled) setMessages(m);
        // Abrir a conversa é o que conta como "lida" para a equipe.
        markConversationRead(selectedPatient.id).catch(() => {});
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPatient]);

  // Realtime: novas mensagens (de qualquer paciente) entram sem refresh.
  React.useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('messages-panel')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          // Só entra no estado o que for da conversa aberta; do contrário a
          // memória cresce com o tráfego de todos os pacientes.
          if (payload.new.patient_id !== selectedPatientRef.current?.id) return;
          const msg = await signMessageRow(payload.new);
          // Chegou com a conversa aberta na tela: já está sendo lida.
          if (payload.new.sender === 'patient') {
            markConversationRead(payload.new.patient_id).catch(() => {});
          }
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        async (payload) => {
          const row: any = payload.new;
          if (row.patient_id !== selectedPatientRef.current?.id) return;
          // Arquivo do WhatsApp entra como "[Recebendo arquivo…]" e é atualizado
          // com o anexo e a transcrição: a linha inteira é refeita, não só `read`.
          const msg = await signMessageRow(row);
          setMessages((prev) => prev.map((m) => (m.id === row.id ? msg : m)));
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => {
          // A IA pode ser pausada por um alerta no meio do atendimento — o
          // painel precisa refletir isso sem refresh (§7.3).
          getConversations().then(setConversations).catch(() => {});
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // `messages` já vem filtrado por paciente do banco.
  const patientMessages = messages;
  const activeConversation = conversations.find((c) => c.patientId === selectedPatient?.id) ?? null;

  const toggleAi = async () => {
    if (!activeConversation || togglingAi) return;
    const next = !activeConversation.aiEnabled;
    setTogglingAi(true);
    // Otimista: o realtime confirma logo em seguida.
    setConversations((prev) =>
      prev.map((c) => (c.id === activeConversation.id ? { ...c, aiEnabled: next } : c)),
    );
    try {
      await setConversationAiEnabled(activeConversation.id, next);
    } catch {
      setConversations((prev) =>
        prev.map((c) => (c.id === activeConversation.id ? { ...c, aiEnabled: !next } : c)),
      );
    } finally {
      setTogglingAi(false);
    }
  };

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [selectedPatient, messages]);

  const filteredPatients = patients.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !selectedPatient) return;
    setInput('');
    try {
      // O realtime cuida de inserir a mensagem na lista.
      await sendMessage(selectedPatient.id, text);
    } catch {
      setInput(text);
    }
  };

  const openPicker = (kind: AttachKind) => {
    if (!selectedPatient || uploading) return;
    pendingKind.current = kind;
    if (fileInputRef.current) {
      fileInputRef.current.accept = ACCEPT[kind];
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const kind = pendingKind.current;
    const patient = selectedPatientRef.current;
    if (!file || !kind || !patient) return;
    setUploading(kind);
    try {
      const attachment = await uploadChatAttachment(patient.id, file, kind);
      await sendMessage(patient.id, input.trim(), attachment);
      setInput('');
    } catch (err) {
      console.error('Falha ao enviar anexo', err);
    } finally {
      setUploading(null);
      pendingKind.current = null;
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <PageHeader title="Mensagens" description="Chat com pacientes e mensagens automáticas" />

      <Card className="flex flex-1 overflow-hidden">
        {/* Patient List */}
        <div className="hidden w-80 shrink-0 flex-col border-r md:flex">
          <div className="border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar paciente..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {filteredPatients.map((patient) => (
              <button
                key={patient.id}
                onClick={() => setSelectedPatient(patient)}
                className={cn(
                  'flex w-full items-center gap-3 border-b p-3 text-left transition-colors hover:bg-accent/50',
                  selectedPatient?.id === patient.id && 'bg-primary/5'
                )}
              >
                <div className="relative">
                  <Avatar className="h-11 w-11 border">
                    <AvatarImage src={patient.photo} />
                    <AvatarFallback>
                      {patient.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-success" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{patient.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {patient.surgeryType} · Dia {patient.currentDay}
                  </p>
                </div>
                <StatusBadge status={patient.status} />
              </button>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex flex-1 flex-col">
          {/* Chat Header */}
          <div className="flex items-center justify-between border-b p-4">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 border">
                <AvatarImage src={selectedPatient?.photo} />
                <AvatarFallback>
                  {(selectedPatient?.name ?? '?').split(' ').map((n) => n[0]).slice(0, 2).join('')}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold">{selectedPatient?.name ?? 'Selecione um paciente'}</p>
                <p className="text-xs text-muted-foreground">
                  {activeConversation
                    ? `WhatsApp ${activeConversation.phone}`
                    : selectedPatient
                      ? 'Sem conversa no WhatsApp ainda'
                      : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Interruptor do handoff (§7.3): a equipe precisa poder assumir
                  a conversa e devolver para a IA depois. */}
              {activeConversation && (
                <button
                  onClick={toggleAi}
                  disabled={togglingAi}
                  title={
                    activeConversation.aiEnabled
                      ? 'Pausar o agente e assumir a conversa'
                      : activeConversation.handoffReason ?? 'Reativar o agente'
                  }
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    activeConversation.aiEnabled
                      ? 'border-success/30 bg-success/10 text-success hover:bg-success/20'
                      : 'border-warning/30 bg-warning/10 text-warning hover:bg-warning/20',
                    togglingAi && 'opacity-60',
                  )}
                >
                  <Bot className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                  {activeConversation.aiEnabled ? 'IA ativa' : 'IA pausada'}
                </button>
              )}
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Phone className="h-4 w-4" style={{ width: 16, height: 16 }} />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <MoreVertical className="h-4 w-4" style={{ width: 16, height: 16 }} />
              </Button>
            </div>
          </div>

          {activeConversation && !activeConversation.aiEnabled && activeConversation.handoffReason && (
            <div className="border-b bg-warning/10 px-4 py-2 text-xs text-warning">
              Agente pausado: {activeConversation.handoffReason}
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/30 p-4 scrollbar-thin">
            {patientMessages.map((msg) => {
              const isPatient = msg.sender === 'patient';
              const isSystem = msg.sender === 'system';
              const isAi = msg.sender === 'ai';
              // Disparo automático de protocolo: fica centralizado, não é fala
              // de ninguém da equipe.
              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-xs text-muted-foreground">
                      <Bot className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                      {msg.text}
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={msg.id}
                  className={cn('flex animate-fade-in', isPatient ? 'justify-start' : 'justify-end')}
                >
                  <div
                    className={cn(
                      'max-w-[75%] rounded-2xl px-4 py-2.5',
                      isPatient
                        ? 'rounded-bl-sm bg-card border'
                        : isAi
                          // A IA fala pela clínica, mas quem leu precisa saber
                          // que não foi uma pessoa que escreveu.
                          ? 'rounded-br-sm border border-primary/30 bg-primary/10 text-foreground'
                          : 'rounded-br-sm bg-primary text-primary-foreground'
                    )}
                  >
                    {isAi && (
                      <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-primary">
                        <Bot className="h-3 w-3" style={{ width: 12, height: 12 }} />
                        Agente
                      </div>
                    )}
                    <MessageAttachment msg={msg} isPatient={isPatient} />
                    {msg.text && <p className="text-sm leading-relaxed">{msg.text}</p>}
                    <div
                      className={cn(
                        'mt-1 flex items-center justify-end gap-1 text-xs',
                        isPatient || isAi ? 'text-muted-foreground' : 'text-primary-foreground/60'
                      )}
                    >
                      {msg.time}
                      {!isPatient && (msg.read ? (
                        <CheckCheck className="h-3 w-3" style={{ width: 12, height: 12 }} />
                      ) : (
                        <Check className="h-3 w-3" style={{ width: 12, height: 12 }} />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input */}
          <div className="border-t p-3">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChosen}
            />
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => openPicker('image')}
                disabled={!selectedPatient || !!uploading}
              >
                <Paperclip className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
              </Button>
              <Input
                placeholder="Digite uma mensagem..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
                disabled={!selectedPatient}
                className="flex-1"
              />
              <Button size="icon" className="shrink-0" onClick={handleSend} disabled={!selectedPatient}>
                <Send className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
              </Button>
            </div>
            <div className="mt-2 flex items-center gap-1">
              <span className="text-xs text-muted-foreground">
                {uploading ? 'Enviando anexo…' : 'Anexar:'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => openPicker('image')}
                disabled={!selectedPatient || !!uploading}
              >
                <ImageIcon className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                Imagem
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => openPicker('pdf')}
                disabled={!selectedPatient || !!uploading}
              >
                <FileText className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                PDF
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => openPicker('video')}
                disabled={!selectedPatient || !!uploading}
              >
                <Video className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                Vídeo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => openPicker('audio')}
                disabled={!selectedPatient || !!uploading}
              >
                <Mic className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                Áudio
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function MessageAttachment({ msg, isPatient }: { msg: Message; isPatient: boolean }) {
  if (msg.type === 'text' || !msg.attachmentUrl) return null;
  const url = msg.attachmentUrl;

  if (msg.type === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img
          src={url}
          alt={msg.attachmentName ?? 'Imagem enviada'}
          className="mb-2 max-h-64 w-full max-w-xs rounded-lg object-cover"
        />
      </a>
    );
  }

  if (msg.type === 'video') {
    return (
      <video src={url} controls className="mb-2 max-h-64 w-full max-w-xs rounded-lg" />
    );
  }

  if (msg.type === 'audio') {
    return <audio src={url} controls className="mb-2 w-56 max-w-full" />;
  }

  // pdf (e fallback)
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        'mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
        isPatient ? 'bg-muted/60' : 'bg-primary-foreground/10',
      )}
    >
      <FileText className="h-4 w-4 shrink-0" style={{ width: 16, height: 16 }} />
      <span className="truncate">{msg.attachmentName ?? 'Documento.pdf'}</span>
    </a>
  );
}
