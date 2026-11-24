import { useState, useEffect } from 'react';
import type { CompleteCrewVerdict } from '../../shared/crewVerdictTypes';
import { ARCHETYPES } from '../../shared/archetypes';

interface CrewVerdictViewProps {
  verdict: CompleteCrewVerdict;
  myNickname?: string;
  myDeviceId?: string;
  tabOverride?: 'overview' | 'roster' | 'chemistry' | 'awards';
  onShare: () => void;
  onDownload: () => void;
  onCopyLink: () => void;
  onPlayAgain: () => void;
  onHome?: () => void;
}

export function CrewVerdictView({
  verdict,
  myNickname,
  tabOverride,
  onShare,
  onDownload,
  onCopyLink,
  onPlayAgain,
  onHome,
}: CrewVerdictViewProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'roster' | 'chemistry' | 'awards'>('overview');
  const [expandedPairIndex, setExpandedPairIndex] = useState<number | null>(null);

  // Sync tabOverride if provided
  useEffect(() => {
    if (tabOverride) {
      setActiveTab(tabOverride);
    }
  }, [tabOverride]);

  const { tier, personalityDynamics, playerAnalyses, pairwiseRelationships, awards, finalCrewRoast } = verdict;

  return (
    <div className="crew-verdict-container">
      {/* 1. HERO VERDICT */}
      <div
        className="crew-verdict-hero"
        style={{
          boxShadow: `0 0 35px ${tier.accentGlow}`,
          borderColor: tier.badgeColor,
        }}
      >
        <div className="crew-verdict-tag" style={{ color: tier.badgeColor }}>
          // VERDICT DOSSIER · {tier.tone.toUpperCase()}
        </div>

        <div className="crew-verdict-sync-display">
          <div className="crew-verdict-sync-big" style={{ color: tier.badgeColor }}>
            {verdict.syncPercent}%
          </div>
          <div className="crew-verdict-tier-badge" style={{ backgroundColor: `${tier.badgeColor}22`, borderColor: tier.badgeColor, color: tier.badgeColor }}>
            {tier.title}
          </div>
        </div>

        <div className="crew-sync-bar" style={{ marginTop: '14px', marginBottom: '18px' }}>
          <div
            className="crew-sync-fill"
            style={{
              width: `${verdict.syncPercent}%`,
              background: `linear-gradient(90deg, #38bdf8, ${tier.badgeColor})`,
            }}
          />
        </div>

        <div className="crew-verdict-punchline">
          "{tier.verdictLine}"
        </div>

        <div className="crew-verdict-diagnosis">
          <div className="crew-diagnosis-header">SQUAD DIAGNOSIS</div>
          <p>{tier.crewDiagnosis}</p>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="crew-verdict-tabs">
        <button
          className={`crew-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          DYNAMICS
        </button>
        <button
          className={`crew-tab-btn ${activeTab === 'roster' ? 'active' : ''}`}
          onClick={() => setActiveTab('roster')}
        >
          MEMBERS ({playerAnalyses.length})
        </button>
        <button
          className={`crew-tab-btn ${activeTab === 'chemistry' ? 'active' : ''}`}
          onClick={() => setActiveTab('chemistry')}
        >
          CHEMISTRY
        </button>
        <button
          className={`crew-tab-btn ${activeTab === 'awards' ? 'active' : ''}`}
          onClick={() => setActiveTab('awards')}
        >
          AWARDS ({awards.length})
        </button>
      </div>

      {/* TAB 1: OVERVIEW & PERSONALITY DYNAMICS */}
      {activeTab === 'overview' && (
        <div className="crew-tab-content">
          {/* Dominant Crew Archetype */}
          <div className="crew-verdict-card">
            <div className="eyebrow">DOMINANT SQUAD TEMPERAMENT</div>
            <div className="crew-dominant-header">
              <span className="crew-dominant-title">{personalityDynamics.dominantCrewArchetype.name}</span>
              <span className="crew-dominant-count">
                {personalityDynamics.dominantCrewArchetype.count} OF {playerAnalyses.length} PLAYERS
              </span>
            </div>
            <p className="crew-dominant-desc">
              "{personalityDynamics.dominantCrewArchetype.description}"
            </p>
          </div>

          {/* 3-Axis Crew Breakdown */}
          <div className="crew-verdict-card">
            <div className="eyebrow">THE 3-AXIS CREW SPECTRUM</div>
            <div className="crew-axes-list">
              {/* Plan vs Chaos */}
              <div className="crew-axis-row">
                <div className="crew-axis-labels">
                  <span className={personalityDynamics.axes.plan_chaos.dominantPole === 'PLAN' ? 'bold-pole' : ''}>
                    PLAN ({personalityDynamics.axes.plan_chaos.leftCount})
                  </span>
                  <span className="crew-axis-name">PLAN vs CHAOS</span>
                  <span className={personalityDynamics.axes.plan_chaos.dominantPole === 'CHAOS' ? 'bold-pole' : ''}>
                    CHAOS ({personalityDynamics.axes.plan_chaos.rightCount})
                  </span>
                </div>
                <div className="crew-axis-track">
                  <div
                    className="crew-axis-indicator"
                    style={{ left: `${personalityDynamics.axes.plan_chaos.crewAverageSlider}%` }}
                  />
                </div>
                <div className="crew-axis-commentary">
                  "{personalityDynamics.axes.plan_chaos.commentary}"
                </div>
              </div>

              {/* Solo vs Crew */}
              <div className="crew-axis-row">
                <div className="crew-axis-labels">
                  <span className={personalityDynamics.axes.solo_crew.dominantPole === 'SOLO' ? 'bold-pole' : ''}>
                    SOLO ({personalityDynamics.axes.solo_crew.leftCount})
                  </span>
                  <span className="crew-axis-name">SOLO vs CREW</span>
                  <span className={personalityDynamics.axes.solo_crew.dominantPole === 'CREW' ? 'bold-pole' : ''}>
                    CREW ({personalityDynamics.axes.solo_crew.rightCount})
                  </span>
                </div>
                <div className="crew-axis-track">
                  <div
                    className="crew-axis-indicator"
                    style={{ left: `${personalityDynamics.axes.solo_crew.crewAverageSlider}%` }}
                  />
                </div>
                <div className="crew-axis-commentary">
                  "{personalityDynamics.axes.solo_crew.commentary}"
                </div>
              </div>

              {/* Logic vs Instinct */}
              <div className="crew-axis-row">
                <div className="crew-axis-labels">
                  <span className={personalityDynamics.axes.logic_instinct.dominantPole === 'LOGIC' ? 'bold-pole' : ''}>
                    LOGIC ({personalityDynamics.axes.logic_instinct.leftCount})
                  </span>
                  <span className="crew-axis-name">LOGIC vs INSTINCT</span>
                  <span className={personalityDynamics.axes.logic_instinct.dominantPole === 'INSTINCT' ? 'bold-pole' : ''}>
                    INSTINCT ({personalityDynamics.axes.logic_instinct.rightCount})
                  </span>
                </div>
                <div className="crew-axis-track">
                  <div
                    className="crew-axis-indicator"
                    style={{ left: `${personalityDynamics.axes.logic_instinct.crewAverageSlider}%` }}
                  />
                </div>
                <div className="crew-axis-commentary">
                  "{personalityDynamics.axes.logic_instinct.commentary}"
                </div>
              </div>
            </div>
          </div>

          {/* Strongest Agreement & Biggest Disagreement */}
          <div className="crew-split-highlight-grid">
            {personalityDynamics.strongestAgreement && (
              <div className="crew-highlight-box agreement">
                <div className="highlight-tag">🤝 STRONGEST CONSENSUS</div>
                <h4>{personalityDynamics.strongestAgreement.axisName}</h4>
                <p>{personalityDynamics.strongestAgreement.description}</p>
              </div>
            )}
            {personalityDynamics.biggestDisagreement && (
              <div className="crew-highlight-box conflict">
                <div className="highlight-tag">⚔️ BIGGEST SPLIT</div>
                <h4>{personalityDynamics.biggestDisagreement.axisName}</h4>
                <p>{personalityDynamics.biggestDisagreement.splitDescription}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: INDIVIDUAL PLAYER CARDS */}
      {activeTab === 'roster' && (
        <div className="crew-tab-content">
          <div className="crew-player-cards-grid">
            {playerAnalyses.map((player) => {
              const archDef = ARCHETYPES[player.archetypeId];
              return (
                <div key={player.memberId} className={`crew-player-card ${player.isMe ? 'is-me-card' : ''}`}>
                  <div className="crew-player-card-header">
                    <div className="crew-player-name-section">
                      <span className="crew-player-name">{player.nickname}</span>
                      {player.isMe && <span className="you-chip">YOU</span>}
                      <span className="crew-player-label-badge">{player.individualLabel.title}</span>
                    </div>
                    <div className="crew-player-sync-stat">
                      <span className="stat-num">{player.averagePairSync}%</span>
                      <span className="stat-label">AVG SYNC</span>
                    </div>
                  </div>

                  <div className="crew-player-archetype-row">
                    <span className="arch-name" style={{ color: archDef?.accentColor || '#38bdf8' }}>
                      {player.archetypeName}
                    </span>
                    <span className="arch-poles">
                      [{player.axisResult.poles.join(' · ')}]
                    </span>
                  </div>

                  <p className="crew-player-obs">
                    {player.observation}
                  </p>

                  {/* Roast & Compliment Box */}
                  <div className="crew-player-roast-box">
                    <div className="roast-row">
                      <span className="roast-icon">🔥</span>
                      <span className="roast-text">"{player.roast}"</span>
                    </div>
                    <div className="compliment-row">
                      <span className="compliment-icon">✨</span>
                      <span className="compliment-text">"{player.compliment}"</span>
                    </div>
                  </div>

                  {/* Chemistry Partner Links */}
                  {player.strongestPartner && (
                    <div className="crew-player-partners">
                      <span className="partner-item best">
                        💚 Best chemistry: <strong>{player.strongestPartner.nickname}</strong> ({player.strongestPartner.percentage}%)
                      </span>
                      {player.weakestPartner && player.weakestPartner.memberId !== player.strongestPartner.memberId && (
                        <span className="partner-item worst">
                          ⚡ Friction with: <strong>{player.weakestPartner.nickname}</strong> ({player.weakestPartner.percentage}%)
                        </span>
                      )}
                    </div>
                  )}

                  {/* Player Awards badges */}
                  {player.awardsReceived.length > 0 && (
                    <div className="crew-player-awards-list">
                      {player.awardsReceived.map((aw) => (
                        <span key={aw.id} className="player-award-pill">
                          {aw.icon} {aw.title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: PAIRWISE CHEMISTRY MATRIX */}
      {activeTab === 'chemistry' && (
        <div className="crew-tab-content">
          <div className="eyebrow" style={{ marginBottom: '10px' }}>
            <span>PAIRWISE SYNCHRONIZATION</span>
            <span>{pairwiseRelationships.length} RELATIONSHIPS</span>
          </div>


          <div className="crew-chemistry-list">
            {pairwiseRelationships.map((pair, pIdx) => {
              const isExpanded = expandedPairIndex === pIdx;
              const tierDef = pair.tierLabel;
              return (
                <div
                  key={`${pair.memberAId}-${pair.memberBId}`}
                  className="crew-chemistry-card"
                  onClick={() => setExpandedPairIndex(isExpanded ? null : pIdx)}
                >
                  <div className="chemistry-card-top">
                    <div className="chemistry-names">
                      <strong>{pair.memberAName}</strong>
                      <span className="vs-sign">⚡</span>
                      <strong>{pair.memberBName}</strong>
                    </div>
                    <div className="chemistry-percent-badge">
                      <span className="pct-num">{pair.percentage}%</span>
                      <span className="pct-matches">{pair.matches}/{pair.total}</span>
                    </div>
                  </div>

                  <div className="crew-pair-meter" style={{ margin: '8px 0' }}>
                    <div
                      className="crew-pair-fill"
                      style={{
                        width: `${pair.percentage}%`,
                        background: pair.percentage >= 70 ? '#34d399' : pair.percentage >= 40 ? '#fbbf24' : '#f43f5e',
                      }}
                    />
                  </div>

                  <div className="chemistry-tier-row">
                    <span className="chemistry-tier-label">{tierDef}</span>
                    <span className="expand-hint">{isExpanded ? '▲ LESS' : '▼ READ RECIEPT'}</span>
                  </div>

                  <div className={`chemistry-commentary-box ${isExpanded ? 'is-open' : ''}`}>
                    <p className="chemistry-commentary-text">"{pair.commentary}"</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: SQUAD AWARDS */}
      {activeTab === 'awards' && (
        <div className="crew-tab-content">
          <div className="eyebrow" style={{ marginBottom: '10px' }}>
            <span>SESSION BADGES & ACCREDITATIONS</span>
            <span>{awards.length} TITLES EARNED</span>
          </div>

          {awards.length === 0 ? (
            <p className="fine" style={{ textAlign: 'center', padding: '24px 0' }}>
              No squad member triggered extreme criteria this round. You are an unusually civil group.
            </p>
          ) : (
            <div className="crew-awards-grid">
              {awards.map((aw) => {
                const isWalkingRedFlag = aw.awardId === 'walking_red_flag' || aw.title.toLowerCase().includes('red flag');
                return (
                  <div
                    key={aw.awardId}
                    className={`crew-award-card full-award ${isWalkingRedFlag ? 'walking-red-flag-card' : ''}`}
                    style={
                      isWalkingRedFlag
                        ? {
                            border: '2px solid #ef4444',
                            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(15, 23, 42, 0.95))',
                            boxShadow: '0 0 30px rgba(239, 68, 68, 0.5)',
                            animation: 'pulseGlow 2s infinite',
                          }
                        : {}
                    }
                  >
                    <div
                      className="crew-award-title"
                      style={isWalkingRedFlag ? { color: '#ef4444', textShadow: '0 0 10px #ef4444' } : {}}
                    >
                      {aw.icon} {aw.title.toUpperCase()}
                    </div>
                    <div
                      className="crew-award-winner-badge"
                      style={isWalkingRedFlag ? { color: '#fca5a5', fontSize: '9px' } : {}}
                    >
                      AWARDED TO: <strong style={{ color: '#fff', fontSize: '11px' }}>{aw.winnerNicknames.join(' & ')}</strong>
                    </div>
                    <div className="crew-award-desc">
                      {aw.explanation}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* FINAL CREW ROAST BANNER */}
      <div className="crew-final-roast-banner">
        <div className="final-roast-tag">FINAL CREW VERDICT // PSYCHOLOGICAL ROAST</div>
        <p className="final-roast-line">"{finalCrewRoast}"</p>
        <div
          style={{
            marginTop: '8px',
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '9px',
            color: '#ef4444',
            letterSpacing: '1px',
            textShadow: '0 0 10px rgba(239, 68, 68, 0.6)',
          }}
        >
          🚩 WALKING RED FLAG IDENTIFIED: PETER
        </div>
      </div>

      {/* ACTION BUTTONS */}
      <div className="crew-verdict-actions">
        <button className="primary" onClick={onShare}>
          SHARE CREW VERDICT
        </button>
        <button className="secondary" onClick={onDownload}>
          DOWNLOAD CARD
        </button>
        <button className="secondary" onClick={onCopyLink}>
          COPY INVITE LINK
        </button>
        <button className="secondary" onClick={onPlayAgain}>
          ▶ RUN IT BACK (NEW 7)
        </button>
        {onHome && (
          <button className="textbtn" onClick={onHome} style={{ width: '100%', marginTop: '6px' }}>
            RETURN TO ARCADE
          </button>
        )}
      </div>
    </div>
  );
}
