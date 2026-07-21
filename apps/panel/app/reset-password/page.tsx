'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, Mail, Lock, KeyRound, Eye, EyeOff, ArrowRight, ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';

type Step = 'request' | 'confirm' | 'done';

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const [step, setStep] = React.useState<Step>('request');
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.functions.invoke('password-reset-request', {
      body: { email: email.trim().toLowerCase() },
    });
    setLoading(false);
    if (error) {
      setError('Não foi possível enviar o código. Tente novamente.');
      return;
    }
    setStep('confirm');
  };

  const confirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('A nova senha deve ter ao menos 8 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('As senhas não conferem.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('password-reset-confirm', {
      body: { email: email.trim().toLowerCase(), code: code.trim(), newPassword: password },
    });
    setLoading(false);
    // Erros de negócio vêm no corpo (status !=2xx faz o invoke retornar error).
    const bodyError = (data as { error?: string } | null)?.error;
    if (error || bodyError) {
      setError(bodyError ?? 'Código inválido ou expirado.');
      return;
    }
    setStep('done');
  };

  return (
    <div className="flex min-h-screen">
      {/* Left side - Form */}
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <Activity className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight">PostCare</span>
              <span className="ml-1 text-xl font-bold text-primary">Pro</span>
            </div>
          </div>

          {step === 'request' && (
            <>
              <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Recuperar senha</h1>
                <p className="mt-2 text-muted-foreground">
                  Informe seu e-mail. Enviaremos um código para você redefinir a senha.
                </p>
              </div>
              <form onSubmit={requestCode} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      className="pl-10"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>
                {error && <ErrorBox message={error} />}
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? 'Enviando...' : (
                    <span className="flex items-center gap-2">Enviar código <ArrowRight className="h-4 w-4" /></span>
                  )}
                </Button>
              </form>
            </>
          )}

          {step === 'confirm' && (
            <>
              <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Digite o código</h1>
                <p className="mt-2 text-muted-foreground">
                  Enviamos um código para <span className="font-medium text-foreground">{email}</span>. Ele expira em 15 minutos.
                </p>
              </div>
              <form onSubmit={confirmReset} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="code">Código de verificação</Label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="code"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      className="pl-10 tracking-[0.4em]"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Nova senha</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirmar nova senha</Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="confirm"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="pl-10"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>
                {error && <ErrorBox message={error} />}
                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? 'Redefinindo...' : 'Redefinir senha'}
                </Button>
                <button
                  type="button"
                  onClick={() => { setStep('request'); setError(null); }}
                  className="flex w-full items-center justify-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Usar outro e-mail
                </button>
              </form>
            </>
          )}

          {step === 'done' && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-7 w-7 text-success" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Senha redefinida</h1>
              <p className="mt-2 text-muted-foreground">Você já pode entrar com a nova senha.</p>
              <Button className="mt-6 w-full" size="lg" onClick={() => router.replace('/')}>
                Ir para o login
              </Button>
            </div>
          )}

          {step !== 'done' && (
            <Link
              href="/"
              className="mt-8 flex items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para o login
            </Link>
          )}
        </div>
      </div>

      {/* Right side - Image */}
      <div className="relative hidden lg:block lg:w-1/2">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              'url(https://images.pexels.com/photos/4173251/pexels-photo-4173251.jpeg?auto=compress&cs=tinysrgb&w=1200)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/90 via-primary/70 to-secondary/60" />
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <h2 className="text-3xl font-bold leading-tight text-balance">
            Sua conta, sempre segura.
          </h2>
          <p className="mt-4 text-lg text-white/80">
            Recuperação de acesso por código, rápida e protegida.
          </p>
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
