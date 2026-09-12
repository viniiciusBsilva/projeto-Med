'use client';

// Campo de hora em 24 h (00:00–23:59). O <input type="time"> nativo segue o
// idioma do navegador — num navegador em inglês aparecia AM/PM. Aqui o formato
// é sempre o brasileiro, venha de onde vier o acesso.

import * as React from 'react';
import { cn } from '@/lib/utils';

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

interface TimeInputProps {
  /** 'HH:MM'; vazio = sem valor. */
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  /** Passo dos minutos. Um valor já salvo fora do passo continua aparecendo. */
  minuteStep?: number;
  disabled?: boolean;
  'aria-label'?: string;
}

export function TimeInput({
  value,
  onChange,
  id,
  className,
  minuteStep = 5,
  disabled,
  'aria-label': ariaLabel,
}: TimeInputProps) {
  const [hour, minute] = /^\d{2}:\d{2}$/.test(value) ? value.split(':') : ['', ''];

  const minutes = React.useMemo(() => {
    const list = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) =>
      String(i * minuteStep).padStart(2, '0'),
    );
    if (minute && !list.includes(minute)) list.push(minute);
    return list.sort();
  }, [minuteStep, minute]);

  // color-scheme faz a lista nativa acompanhar o tema (senão fica branca no escuro).
  const selectClass =
    'h-full cursor-pointer appearance-none rounded-sm bg-transparent px-1 text-center tabular-nums outline-none [color-scheme:light] focus:bg-accent disabled:cursor-not-allowed dark:[color-scheme:dark]';

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex h-10 items-center rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
        disabled && 'opacity-50',
        className,
      )}
    >
      <select
        id={id}
        value={hour}
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel} — hora` : 'Hora'}
        onChange={(e) => onChange(`${e.target.value}:${minute || '00'}`)}
        className={selectClass}
      >
        {!hour && (
          <option value="" disabled>
            --
          </option>
        )}
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground">:</span>
      <select
        value={minute}
        disabled={disabled}
        aria-label={ariaLabel ? `${ariaLabel} — minutos` : 'Minutos'}
        onChange={(e) => onChange(`${hour || '00'}:${e.target.value}`)}
        className={selectClass}
      >
        {!minute && (
          <option value="" disabled>
            --
          </option>
        )}
        {minutes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
