import { type ReactNode } from 'react';

export interface RowShellProps {
  children: ReactNode;
  // Phase 2+ contract (unused this phase):
  // type: string;
  // color: string;
  // name: string;
  // details: string;
  // infoNode?: ReactNode;
  // removeHandler?: () => void;
  // expanded: boolean;
  // onToggle: () => void;
}

export function RowShell({ children }: RowShellProps) {
  return <>{children}</>;
}
