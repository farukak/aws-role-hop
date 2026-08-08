import type { ReactNode } from 'react';
import { AlertTriangle, Inbox } from 'lucide-react';

interface StatusCardProps {
  title: string;
  description: string;
  action?: ReactNode;
  tone?: 'empty' | 'error';
}

export function StatusCard({ title, description, action, tone = 'empty' }: StatusCardProps) {
  const Icon = tone === 'error' ? AlertTriangle : Inbox;
  return (
    <section className="status-card" role={tone === 'error' ? 'alert' : undefined}>
      <span className="status-card__icon">
        <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </section>
  );
}
