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
import type { Patient, Message } from '@/lib/types';
import { getPatients, getMessages, sendMessage } from '@/lib/queries';
import { cn } from '@/lib/utils';

export default function MessagesPage() {
  const [patients, setPatients] = React.useState<Patient[]>([]);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [selectedPatient, setSelectedPatient] = React.useState<Patient | null>(null);
  const [search, setSearch] = React.useState('');
  const [input, setInput] = React.useState('');
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    getPatients().then((p) => {
      setPatients(p);
      setSelectedPatient((cur) => cur ?? p[0] ?? null);
    });
    getMessages().then(setMessages);
  }, []);

  const patientMessages = messages.filter((m) => m.patientId === selectedPatient?.id);

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
      await sendMessage(selectedPatient.id, text);
      setMessages(await getMessages());
    } catch {
      setInput(text);
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
                <p className="text-xs text-success">{selectedPatient ? 'Conversa' : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Phone className="h-4 w-4" style={{ width: 16, height: 16 }} />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <MoreVertical className="h-4 w-4" style={{ width: 16, height: 16 }} />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/30 p-4 scrollbar-thin">
            {patientMessages.map((msg) => {
              const isPatient = msg.sender === 'patient';
              const isSystem = msg.sender === 'system';
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
                        : 'rounded-br-sm bg-primary text-primary-foreground'
                    )}
                  >
                    {msg.type === 'image' ? (
                      <div>
                        <img
                          src="https://images.pexels.com/photos/4173251/pexels-photo-4173251.jpeg?auto=compress&cs=tinysrgb&w=400"
                          alt="Foto enviada"
                          className="mb-2 h-40 w-56 rounded-lg object-cover"
                        />
                        <p className="text-sm">{msg.text}</p>
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                    )}
                    <div
                      className={cn(
                        'mt-1 flex items-center justify-end gap-1 text-xs',
                        isPatient ? 'text-muted-foreground' : 'text-primary-foreground/60'
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
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="shrink-0">
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
              <span className="text-xs text-muted-foreground">Anexar:</span>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                <ImageIcon className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                Imagem
              </Button>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                <FileText className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                PDF
              </Button>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
                <Video className="h-3.5 w-3.5" style={{ width: 14, height: 14 }} />
                Vídeo
              </Button>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs">
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
