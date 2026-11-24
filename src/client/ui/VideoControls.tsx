import React, { useState } from 'react';

export interface VideoControlsProps {
  currentScene: string;
  onSelectScene: (scene: string) => void;
  showLiveBadge: boolean;
  setShowLiveBadge: (v: boolean) => void;
  nameCardVisible: boolean;
  setNameCardVisible: (v: boolean) => void;
  endCardVisible: boolean;
  setEndCardVisible: (v: boolean) => void;
  onReset: () => void;
}

export const VideoControls: React.FC<VideoControlsProps> = ({
  currentScene,
  onSelectScene,
  showLiveBadge,
  setShowLiveBadge,
  nameCardVisible,
  setNameCardVisible,
  endCardVisible,
  setEndCardVisible,
  onReset,
}) => {
  const [minimized, setMinimized] = useState(false);

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        style={{
          position: 'fixed',
          bottom: '12px',
          right: '12px',
          zIndex: 99999,
          background: 'rgba(239, 68, 68, 0.9)',
          color: '#fff',
          border: '1px solid #fecaca',
          borderRadius: '20px',
          padding: '6px 12px',
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: '11px',
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
        🎬 VIDEO DIRECTOR [OPEN]
      </button>
    );
  }

  const scenes = [
    { id: 'hook', label: '🔥 HOOK: Awards / WALKING RED FLAG', desc: '0:00 - Peter red flag roast' },
    { id: 'part1', label: '👤 PART 1: Name Card & Home', desc: '0:05 - Swastik Arora & 30s read' },
    { id: 'part2_play', label: '⏱️ PART 2: 30s Shot Clock (Play)', desc: '0:11 - Rapid questions' },
    { id: 'part2_reveal', label: '📊 PART 2: Crowd % Reveal', desc: '0:14 - Rarity & percentages' },
    { id: 'part2_spark', label: '⚡ PART 2: "THE SPARK" & Sliders', desc: '0:17 - The Spark slamming in' },
    { id: 'part3', label: '🧠 PART 3: Embarko Prompt Copy', desc: '0:20 - Step 1: Get Embarko prompt' },
    { id: 'part4', label: '🚀 PART 4: Paste · Wait · Live', desc: '0:26 - AI pasting & deploy' },
    { id: 'part5_setup', label: '👥 PART 5: Create Crew (Stewie)', desc: '0:32 - Griffin Squad setup' },
    { id: 'part5_lobby', label: '🔗 PART 5: Room Code & Link', desc: '0:33 - Room code & share link' },
    { id: 'part5_matrix', label: '💥 PART 5: Crew Chemistry (Sync)', desc: '0:35 - Group chat sync & roasts' },
    { id: 'part5_awards', label: '🚩 PART 5: Snap Zoom Red Flag', desc: '0:38 - Peter vs Brian' },
    { id: 'part6', label: '🔗 PART 6: End Card & CTA', desc: '0:41 - #DeployWithEmbarko' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '12px',
        right: '12px',
        width: '320px',
        maxHeight: '85vh',
        overflowY: 'auto',
        zIndex: 99999,
        background: 'rgba(11, 16, 32, 0.95)',
        border: '1px solid rgba(56, 189, 248, 0.4)',
        borderRadius: '12px',
        padding: '12px',
        color: '#f8fafc',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), 0 0 20px rgba(56, 189, 248, 0.2)',
        backdropFilter: 'blur(8px)',
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
          <strong style={{ fontSize: '11px', letterSpacing: '1px', color: '#38bdf8' }}>VIDEO SCRIPT DIRECTOR</strong>
        </div>
        <button
          onClick={() => setMinimized(true)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '12px',
            padding: '2px 6px',
          }}
          title="Minimize"
        >
          ✕ HIDE
        </button>
      </div>

      <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '10px', lineHeight: 1.3 }}>
        Jump to any exact script scene in 1 click for seamless vertical recording.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
        {scenes.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelectScene(s.id)}
            style={{
              textAlign: 'left',
              padding: '6px 8px',
              borderRadius: '6px',
              border: currentScene === s.id ? '1px solid #38bdf8' : '1px solid rgba(255,255,255,0.07)',
              background: currentScene === s.id ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.03)',
              color: currentScene === s.id ? '#38bdf8' : '#e2e8f0',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: currentScene === s.id ? 700 : 500,
              transition: 'all 0.15s ease',
            }}
          >
            <div>{s.label}</div>
            <div style={{ fontSize: '9px', color: '#94a3b8' }}>{s.desc}</div>
          </button>
        ))}
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#a78bfa', textTransform: 'uppercase' }}>Overlays & Badges</div>
        
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showLiveBadge}
            onChange={(e) => setShowLiveBadge(e.target.checked)}
          />
          <span>Corner Badge: <b>Live on Embarko</b></span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={nameCardVisible}
            onChange={(e) => setNameCardVisible(e.target.checked)}
          />
          <span>Overlay: <b>SWASTIK ARORA card</b></span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={endCardVisible}
            onChange={(e) => setEndCardVisible(e.target.checked)}
          />
          <span>Overlay: <b>End Card CTA Screen</b></span>
        </label>
      </div>

      <button
        onClick={onReset}
        style={{
          width: '100%',
          marginTop: '10px',
          padding: '6px',
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          color: '#f87171',
          borderRadius: '6px',
          fontSize: '10px',
          fontWeight: 700,
          cursor: 'pointer',
        }}
      >
        ↺ RESET TO HOME
      </button>
    </div>
  );
};
