// Header — Sprint 3 (docs/07 Phase 1): title left; About · Privacy · Contact right.
// File / View / Tools are GONE — users are gated through the panels only.
// File-open lives in the left panel top section now (and drag/drop stays global).
import { useEffect, useRef, useState } from 'react';
import styles from './App.module.css';

const INFO: { label: string; body: React.ReactNode }[] = [
  {
    label: 'About',
    body: (
      <>
        <strong>gunters.app · TIN Viewer</strong>
        <p>
          A local-first surface viewer for LandXML TINs. The triangulation you see is the
          triangulation in the file — never silently rebuilt.
        </p>
      </>
    ),
  },
  {
    label: 'Privacy',
    body: (
      <p>
        Everything runs in your browser. Files are parsed locally and never uploaded —
        closing the tab discards all data.
      </p>
    ),
  },
  {
    label: 'Contact',
    body: (
      <p>
        <a href="mailto:contact@gunters.app">contact@gunters.app</a>
      </p>
    ),
  },
];

export function Header() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const close = (ev: PointerEvent) => {
      if (!navRef.current?.contains(ev.target as Node)) setOpenMenu(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [openMenu]);

  return (
    <header className={styles.header}>
      <div className={styles.title}>
        gunters.app <span>· TIN Viewer</span>
      </div>
      <span className={styles.headerSpacer} />
      <nav className={styles.menu} ref={navRef}>
        {INFO.map(({ label, body }) => (
          <div key={label} className={styles.menuWrap}>
            <button
              type="button"
              className={`${styles.menuItem} ${openMenu === label ? styles.menuItemOpen : ''}`}
              onClick={() => setOpenMenu((o) => (o === label ? null : label))}
            >
              {label}
            </button>
            {openMenu === label && (
              <div className={`${styles.menuDropdown} ${styles.menuDropdownRight}`}>
                <div className={styles.infoBody}>{body}</div>
              </div>
            )}
          </div>
        ))}
      </nav>
    </header>
  );
}
