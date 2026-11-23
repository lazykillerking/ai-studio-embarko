import React, { useState } from 'react';

export const NameCardOverlay: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90000,
        background: 'rgba(7, 10, 20, 0.85)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.25s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'linear-gradient(145deg, #131c38, #0b1020)',
          border: '2px solid #38bdf8',
          borderRadius: '16px',
          padding: '32px 24px',
          textAlign: 'center',
          boxShadow: '0 0 50px rgba(56, 189, 248, 0.35), inset 0 0 20px rgba(56, 189, 248, 0.1)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: '999px',
            background: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid #38bdf8',
            color: '#38bdf8',
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '9px',
            marginBottom: '16px',
            letterSpacing: '1px',
          }}
        >
          STUDENT BUILDER
        </div>

        <h1
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '28px',
            fontWeight: 800,
            letterSpacing: '2px',
            margin: '0 0 8px 0',
            color: '#f8fafc',
            textShadow: '0 0 20px rgba(56, 189, 248, 0.6)',
          }}
        >
          SWASTIK ARORA
        </h1>

        <div
          style={{
            fontSize: '13px',
            color: '#94a3b8',
            fontWeight: 600,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            marginBottom: '20px',
          }}
        >
          BUILT FOR THE EMBARKO CHALLENGE
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '11px', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)' }}>
            🎮 BRAINPRINT ARCADE
          </span>
          <span style={{ padding: '6px 12px', background: 'rgba(167, 139, 250, 0.15)', borderRadius: '6px', fontSize: '11px', color: '#c084fc', border: '1px solid #a78bfa' }}>
            #DeployWithEmbarko
          </span>
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: '24px',
            background: '#38bdf8',
            color: '#070a14',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 24px',
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '10px',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          ENTER APP ▶
        </button>
      </div>
    </div>
  );
};

export const EmbarkoPromptStepOverlay: React.FC<{ onClose: () => void; onNext: () => void }> = ({ onClose, onNext }) => {
  const [copied, setCopied] = useState(false);
  const promptText = `Build a high-velocity, 16-bit GTA VI Leonida-inspired social sync psychometrics arcade app called BRAINPRINT with Daily Solo Mode and Crew Social Sync. Host live instantly on Embarko!`;

  const copyPrompt = () => {
    navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90000,
        background: 'rgba(7, 10, 20, 0.88)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'linear-gradient(145deg, #141a33, #0b1020)',
          border: '2px solid #a78bfa',
          borderRadius: '16px',
          padding: '28px 24px',
          boxShadow: '0 0 50px rgba(167, 139, 250, 0.35)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ font: "9px 'Press Start 2P', monospace", color: '#a78bfa', letterSpacing: '1px' }}>
            STEP 1: GET THE EMBARKO PROMPT
          </span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
        </div>

        <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 10px', color: '#f8fafc' }}>
          Embarko Challenge Portal
        </h2>
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 18px', lineHeight: 1.4 }}>
          "He grabbed the starter prompt straight from the Embarko challenge page."
        </p>

        <div
          style={{
            background: 'rgba(0, 0, 0, 0.6)',
            border: '1px solid rgba(167, 139, 250, 0.3)',
            borderRadius: '10px',
            padding: '16px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '12px',
            color: '#e2e8f0',
            lineHeight: 1.5,
            marginBottom: '18px',
            position: 'relative',
          }}
        >
          {promptText}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={copyPrompt}
            style={{
              flex: 1,
              background: copied ? '#34d399' : '#a78bfa',
              color: '#070a14',
              border: 'none',
              borderRadius: '8px',
              padding: '12px',
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '10px',
              cursor: 'pointer',
              fontWeight: 700,
              transition: 'all 0.2s ease',
            }}
          >
            {copied ? '✓ COPIED PROMPT!' : '📋 COPY PROMPT'}
          </button>
          <button
            onClick={onNext}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#f8fafc',
              borderRadius: '8px',
              padding: '12px 16px',
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            NEXT: DEPLOY ➔
          </button>
        </div>
      </div>
    </div>
  );
};

export const EmbarkoDeployStepOverlay: React.FC<{ onClose: () => void; onNext: () => void }> = ({ onClose, onNext }) => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90000,
        background: 'rgba(7, 10, 20, 0.88)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'linear-gradient(145deg, #101c38, #070a14)',
          border: '2px solid #34d399',
          borderRadius: '16px',
          padding: '28px 24px',
          boxShadow: '0 0 50px rgba(52, 211, 153, 0.35)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ font: "9px 'Press Start 2P', monospace", color: '#34d399', letterSpacing: '1px' }}>
            PART 4: GOING LIVE
          </span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
        </div>

        <h1
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '32px',
            fontWeight: 800,
            letterSpacing: '1px',
            margin: '0 0 4px 0',
            color: '#f8fafc',
          }}
        >
          PASTE. WAIT. LIVE.
        </h1>

        <div
          style={{
            display: 'inline-block',
            padding: '4px 10px',
            borderRadius: '6px',
            background: 'rgba(52, 211, 153, 0.15)',
            border: '1px solid #34d399',
            color: '#34d399',
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '11px',
            fontWeight: 700,
            marginBottom: '20px',
          }}
        >
          HOSTED ON EMBARKO
        </div>

        {/* Mock Terminal / Build Log */}
        <div
          style={{
            background: '#040711',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '10px',
            padding: '14px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            color: '#a3e635',
            lineHeight: 1.6,
            marginBottom: '20px',
            textAlign: 'left',
          }}
        >
          <div>&gt; Receiving prompt from AI Studio...</div>
          <div>&gt; Generating SQLite schema + psychometrics engine...</div>
          <div>&gt; Running tests: 185 calibrated signals passed [OK]</div>
          <div style={{ color: '#38bdf8' }}>&gt; Deploying container to Embarko Edge...</div>
          <div style={{ color: '#34d399', fontWeight: 700 }}>
            ✔ LIVE: https://brainprint-arcade.embarko.app [256MB]
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <a
            href="https://brainprint-arcade.embarko.app"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1,
              textAlign: 'center',
              background: '#34d399',
              color: '#070a14',
              border: 'none',
              borderRadius: '8px',
              padding: '12px',
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '10px',
              textDecoration: 'none',
              fontWeight: 700,
              boxShadow: '0 0 20px rgba(52, 211, 153, 0.5)',
            }}
          >
            OPEN LIVE LINK ↗
          </a>
          <button
            onClick={onNext}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#f8fafc',
              borderRadius: '8px',
              padding: '12px 16px',
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            CREW MODE ➔
          </button>
        </div>
      </div>
    </div>
  );
};

export const EndCardOverlay: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 95000,
        background: 'radial-gradient(circle at center, #131b38 0%, #070a14 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        animation: 'fadeIn 0.3s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'rgba(15, 23, 42, 0.95)',
          border: '3px solid #38bdf8',
          borderRadius: '24px',
          padding: '40px 28px',
          textAlign: 'center',
          boxShadow: '0 0 60px rgba(56, 189, 248, 0.4), inset 0 0 30px rgba(56, 189, 248, 0.15)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            color: '#64748b',
            cursor: 'pointer',
            fontSize: '16px',
          }}
        >
          ✕
        </button>

        <div
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '10px',
            color: '#f43f5e',
            letterSpacing: '2px',
            marginBottom: '16px',
          }}
        >
          TEST IT ON YOUR FRIENDS
        </div>

        <div
          style={{
            background: 'rgba(56, 189, 248, 0.1)',
            border: '2px dashed #38bdf8',
            borderRadius: '12px',
            padding: '16px 12px',
            marginBottom: '20px',
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '20px',
              fontWeight: 800,
              color: '#38bdf8',
              letterSpacing: '0.5px',
              wordBreak: 'break-all',
              textShadow: '0 0 15px rgba(56, 189, 248, 0.7)',
            }}
          >
            brainprint-arcade.embarko.app
          </div>
        </div>

        <div
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '30px',
            fontWeight: 800,
            letterSpacing: '1px',
            color: '#fbbf24',
            marginBottom: '18px',
            textShadow: '0 0 20px rgba(251, 191, 36, 0.5)',
          }}
        >
          #DeployWithEmbarko
        </div>

        <p
          style={{
            fontSize: '14px',
            color: '#cbd5e1',
            margin: '0 0 24px 0',
            fontWeight: 500,
          }}
        >
          Built and hosted on <strong>Embarko</strong>.
          <br />
          <span style={{ color: '#94a3b8', fontSize: '13px' }}>Drop your archetype below 👇</span>
        </p>

        <button
          onClick={onClose}
          style={{
            width: '100%',
            background: 'linear-gradient(90deg, #38bdf8, #a78bfa)',
            color: '#070a14',
            border: 'none',
            borderRadius: '10px',
            padding: '14px',
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '11px',
            cursor: 'pointer',
            fontWeight: 700,
          }}
        >
          REPLAY ARCADE ↺
        </button>
      </div>
    </div>
  );
};
