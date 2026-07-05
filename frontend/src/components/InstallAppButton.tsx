import React, { useState } from 'react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

/** "Download the app" button — installs as a real home-screen app via the
 *  PWA manifest. iOS has no install prompt API, so it shows the manual
 *  Share-sheet steps instead of silently doing nothing. */
export const InstallAppButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { installed, canPromptInstall, isIos, promptInstall } = useInstallPrompt();
  const [showIosTip, setShowIosTip] = useState(false);

  if (installed || (!canPromptInstall && !isIos)) return null;

  const handleClick = async () => {
    if (canPromptInstall) {
      await promptInstall();
    } else if (isIos) {
      setShowIosTip(true);
    }
  };

  return (
    <>
      <button className={className || 'home-nav-btn ghost'} onClick={handleClick}>
        ⬇ Install App
      </button>

      {showIosTip && (
        <div className="modal-backdrop" onClick={() => setShowIosTip(false)}>
          <div className="modal-card" style={{ maxWidth: 340, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="panel-title">Add to Home Screen</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '.92rem', margin: '.75rem 0 1.25rem' }}>
              iOS doesn't let apps install themselves. In Safari:
            </p>
            <ol style={{ textAlign: 'left', display: 'grid', gap: '.6rem', fontSize: '.92rem', paddingLeft: '1.2rem' }}>
              <li>Tap the <strong>Share</strong> icon (square with an arrow) in the toolbar</li>
              <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
              <li>Tap <strong>Add</strong> — the tracker now opens like any other app</li>
            </ol>
            <button className="btn btn-primary btn-block" style={{ marginTop: '1.5rem' }} onClick={() => setShowIosTip(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
