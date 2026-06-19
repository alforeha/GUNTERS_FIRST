import { type ReactNode, type MouseEvent, type KeyboardEvent } from 'react';

export interface RowShellProps {
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
  onToggle: () => void;
  onRowClick?: () => void;
  role?: string;
  tabIndex?: number;
  onKeyDown?: (ev: KeyboardEvent<HTMLDivElement>) => void;
}

export function RowShell({ className, style, children, onToggle, onRowClick, role, tabIndex, onKeyDown }: RowShellProps) {
  const handleClick = (ev: MouseEvent<HTMLDivElement>) => {
    const target = ev.target as HTMLElement;
    if (!target.closest('button, input, select, label')) {
      if (onRowClick) onRowClick();
      onToggle();
    }
  };

  return (
    <div className={className} style={style} onClick={handleClick} role={role} tabIndex={tabIndex} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}
