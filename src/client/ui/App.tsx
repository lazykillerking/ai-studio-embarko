import { useEffect, useState } from 'react';
import { sound } from './audio';
import { CrewVerdictView } from './CrewVerdictView';

type Pack = { id: string; name: string };
type Question = { id: string; prompt: string; options: { text: string }[] };

const device = () => {
  let x = localStorage.getItem('brainprint-device');
  if (!x) {
    x = crypto.randomUUID();
    localStorage.setItem('brainprint-device', x);
  }
  return x;
};

const seenIds = () => {
  try {
    return JSON.parse(localStorage.getItem('brainprint-seen') || '[]') as string[];
  } catch {
    return [];
  }
};

const remember = (questions?: Question[]) => {
  if (!Array.isArray(questions)) return;
  const list = seenIds();
  for (const q of questions) {
    if (!q?.id) continue;
    const at = list.indexOf(q.id);
    if (at >= 0) list.splice(at, 1);
    list.push(q.id);
  }
  localStorage.setItem('brainprint-seen', JSON.stringify(list.slice(-21)));
};

export type MakeCardPayload = {
  isCrew?: boolean;
  archetype?: string;
  avatarKey?: string;
  scoreTitle?: string;
  points?: number | string;
  trait?: string;
  verdictHeadline?: string;
  verdictHeat?: number;
  compliment?: string;
  roast?: string;
  axes?: Record<string, number>;
  // For crew cards:
  crewTitle?: string;
  crewSync?: number;
  crewRoastHeadline?: string;
  crewRoastLine?: string;
  crewTierColor?: string;
  crewDiagnosis?: string;
  crewFinalRoast?: string;
  crewStats?: string[];
  crewHighlights?: { label: string; text: string }[];
  // Legacy / fallback fields:
  title?: string;
  subtitle?: string;
  lines?: string[];
};

function drawRoundedRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (typeof c.roundRect === 'function') {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
  } else {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }
}

function wrapTextToWidth(c: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (c.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function makeCard(
  optionsOrTitle: string | MakeCardPayload,
  legacySubtitle?: string,
  legacyLines?: string[],
  legacyAxes?: Record<string, number>,
  legacyAvatarKey = 'architect'
): Promise<File> {
  let opts: MakeCardPayload;
  if (typeof optionsOrTitle === 'object') {
    opts = optionsOrTitle;
  } else {
    const isCrewMode = optionsOrTitle.includes('CREW SYNC');
    if (isCrewMode) {
      const syncVal = parseInt(optionsOrTitle) || 0;
      opts = {
        isCrew: true,
        crewTitle: 'BRAINPRINT CREW',
        crewSync: syncVal,
        crewRoastHeadline: legacySubtitle || 'CREW REPORT',
        crewRoastLine: legacyLines?.[0] || '',
        crewStats: legacyLines?.slice(1, 2) || [],
        crewHighlights: legacyLines?.slice(2).filter(Boolean).map((line) => {
          const parts = line.split(':');
          return { label: parts[0]?.trim() || 'HIGHLIGHT', text: parts.slice(1).join(':').trim() || line };
        }) || [],
      };
    } else {
      let pts = 0;
      let sTitle = 'The Signal';
      if (legacySubtitle) {
        const m = legacySubtitle.match(/^(\d+)\s+POINTS\s*·?\s*(.*)$/i);
        if (m) {
          pts = parseInt(m[1]) || 0;
          sTitle = m[2]?.trim() || 'The Signal';
        } else {
          sTitle = legacySubtitle;
        }
      }
      opts = {
        isCrew: false,
        archetype: optionsOrTitle || 'BRAINPRINT',
        avatarKey: legacyAvatarKey,
        scoreTitle: sTitle,
        points: pts,
        compliment: legacyLines?.[0] || '',
        roast: legacyLines?.[1] || '',
        axes: legacyAxes,
      };
    }
  }

  try {
    await Promise.all([
      document.fonts.load('38px "Press Start 2P"'),
      document.fonts.load('32px "Press Start 2P"'),
      document.fonts.load('22px "Press Start 2P"'),
      document.fonts.load('16px "Press Start 2P"'),
      document.fonts.load('bold 26px "Space Grotesk"'),
      document.fonts.load('20px "Space Grotesk"'),
      document.fonts.load('16px "Space Grotesk"'),
      document.fonts.ready,
    ]);
  } catch {}

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const c = canvas.getContext('2d')!;

  // 1. Background Gradient
  const bgGrad = c.createLinearGradient(0, 0, 1080, 1920);
  bgGrad.addColorStop(0, '#060a14');
  bgGrad.addColorStop(0.3, '#0c152a');
  bgGrad.addColorStop(0.7, '#13122b');
  bgGrad.addColorStop(1, '#060914');
  c.fillStyle = bgGrad;
  c.fillRect(0, 0, 1080, 1920);

  // 2. Faint Cyber Grid
  c.save();
  c.strokeStyle = 'rgba(56, 189, 248, 0.04)';
  c.lineWidth = 1;
  for (let x = 40; x < 1080; x += 40) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, 1920);
    c.stroke();
  }
  for (let y = 40; y < 1920; y += 40) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(1080, y);
    c.stroke();
  }
  c.restore();

  const avKey = opts.avatarKey || 'architect';
  const avIndex = Math.max(
    0,
    ['architect', 'lone_oracle', 'dispatcher', 'anchor', 'rogue_tactician', 'free_agent', 'plot_twister', 'spark'].indexOf(avKey)
  );
  const primaryThemeColor = opts.isCrew ? '#34d399' : avatarColors[avIndex];

  // 3. Ambient Glow behind Hero section
  c.save();
  const glow = c.createRadialGradient(540, 480, 40, 540, 480, 440);
  glow.addColorStop(0, primaryThemeColor + '30'); // ~19% opacity
  glow.addColorStop(1, 'transparent');
  c.fillStyle = glow;
  c.fillRect(0, 120, 1080, 750);
  c.restore();

  // 4. Outer Framed Panel
  c.save();
  drawRoundedRect(c, 48, 48, 984, 1824, 28);
  c.fillStyle = 'rgba(11, 17, 34, 0.78)';
  c.fill();
  c.lineWidth = 2.5;
  c.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  c.stroke();

  // Inset tech border
  drawRoundedRect(c, 62, 62, 956, 1796, 20);
  c.lineWidth = 1;
  c.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  c.stroke();
  c.restore();

  // 5. Corner brackets [ + ]
  const bracketLen = 28;
  const bracketInset = 70;
  c.save();
  c.strokeStyle = '#38bdf8';
  c.lineWidth = 3;
  // Top Left
  c.beginPath();
  c.moveTo(bracketInset, bracketInset + bracketLen);
  c.lineTo(bracketInset, bracketInset);
  c.lineTo(bracketInset + bracketLen, bracketInset);
  c.stroke();
  // Top Right
  c.beginPath();
  c.moveTo(1080 - bracketInset - bracketLen, bracketInset);
  c.lineTo(1080 - bracketInset, bracketInset);
  c.lineTo(1080 - bracketInset, bracketInset + bracketLen);
  c.stroke();
  // Bottom Left
  c.beginPath();
  c.moveTo(bracketInset, 1920 - bracketInset - bracketLen);
  c.lineTo(bracketInset, 1920 - bracketInset);
  c.lineTo(bracketInset + bracketLen, 1920 - bracketInset);
  c.stroke();
  // Bottom Right
  c.beginPath();
  c.moveTo(1080 - bracketInset - bracketLen, 1920 - bracketInset);
  c.lineTo(1080 - bracketInset, 1920 - bracketInset);
  c.lineTo(1080 - bracketInset, 1920 - bracketInset - bracketLen);
  c.stroke();
  c.restore();

  // 6. Header Section
  c.save();
  c.font = '600 15px "Space Grotesk", sans-serif';
  c.textAlign = 'center';
  const tagText = opts.isCrew ? '// CREW SYNCHRONIZATION REPORT' : '// SIGNAL DOSSIER · VERIFIED RECORD';
  const tagWidth = c.measureText(tagText).width + 36;
  drawRoundedRect(c, 540 - tagWidth / 2, 98, tagWidth, 34, 17);
  c.fillStyle = 'rgba(56, 189, 248, 0.12)';
  c.fill();
  c.strokeStyle = 'rgba(56, 189, 248, 0.4)';
  c.lineWidth = 1.5;
  c.stroke();
  c.fillStyle = '#38bdf8';
  c.fillText(tagText, 540, 121);

  // BRAINPRINT Title
  c.font = '38px "Press Start 2P", monospace';
  c.shadowColor = '#38bdf8';
  c.shadowBlur = 18;
  c.fillStyle = '#f8fafc';
  c.fillText('BRAINPRINT', 540, 178);

  // Subtitle
  c.shadowBlur = 0;
  c.font = '500 16px "Space Grotesk", sans-serif';
  c.fillStyle = '#94a3b8';
  c.fillText('SAME QUESTIONS. DIFFERENT MINDS.', 540, 214);

  // Neon Divider line
  const lineGrad = c.createLinearGradient(120, 235, 960, 235);
  lineGrad.addColorStop(0, 'transparent');
  lineGrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.6)');
  lineGrad.addColorStop(1, 'transparent');
  c.strokeStyle = lineGrad;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(140, 235);
  c.lineTo(940, 235);
  c.stroke();
  c.restore();

  if (!opts.isCrew) {
    // ==========================================
    // SOLO SHARE CARD
    // ==========================================
    const archetype = opts.archetype || 'BRAINPRINT';
    const trait = opts.trait || '';
    const scoreTitle = opts.scoreTitle || 'THE UNCONVENTIONAL';
    const points = opts.points ?? 0;
    const verdictHeadline = opts.verdictHeadline || 'CLASSIFIED SIGNAL';
    const verdictHeat = opts.verdictHeat || 3;
    const compliment = opts.compliment || 'Your choices left a distinct cognitive footprint.';
    const roast = opts.roast || '';

    // Avatar Podium Box
    const avBoxSize = 200;
    const avBoxX = 540 - avBoxSize / 2;
    const avBoxY = 258;
    c.save();
    drawRoundedRect(c, avBoxX, avBoxY, avBoxSize, avBoxSize, 20);
    c.fillStyle = '#0f172a';
    c.fill();
    c.strokeStyle = primaryThemeColor;
    c.lineWidth = 3;
    c.shadowColor = primaryThemeColor;
    c.shadowBlur = 18;
    c.stroke();
    c.restore();

    // Corner brackets on avatar frame
    c.save();
    c.strokeStyle = '#a78bfa';
    c.lineWidth = 2;
    c.strokeRect(avBoxX + 6, avBoxY + 6, 10, 10);
    c.strokeRect(avBoxX + avBoxSize - 16, avBoxY + 6, 10, 10);
    c.strokeRect(avBoxX + 6, avBoxY + avBoxSize - 16, 10, 10);
    c.strokeRect(avBoxX + avBoxSize - 16, avBoxY + avBoxSize - 16, 10, 10);
    c.restore();

    // Draw Avatar pixels (16x16, 9.5px per pixel = 152px)
    const av = avatarPixels(avKey);
    const pxSize = 9.5;
    const pxStartX = avBoxX + (avBoxSize - 16 * pxSize) / 2;
    const pxStartY = avBoxY + (avBoxSize - 16 * pxSize) / 2;
    c.fillStyle = primaryThemeColor;
    av.forEach((row, y) => {
      [...row].forEach((v, x) => {
        if (v === '1') {
          c.fillRect(pxStartX + x * pxSize, pxStartY + y * pxSize, pxSize, pxSize);
        }
      });
    });

    // Archetype Name
    c.save();
    c.font = '22px "Press Start 2P", monospace';
    c.textAlign = 'center';
    c.fillStyle = '#f8fafc';
    c.fillText(archetype.toUpperCase(), 540, 495);

    // Trait Line
    if (trait) {
      c.font = 'italic 18px "Space Grotesk", sans-serif';
      c.fillStyle = '#cbd5e1';
      const traitLines = wrapTextToWidth(c, `"${trait}"`, 800);
      let traitY = 528;
      for (const tline of traitLines.slice(0, 2)) {
        c.fillText(tline, 540, traitY);
        traitY += 26;
      }
    }
    c.restore();

    // ----------------------------------------------------
    // HERO SCORE TITLE BANNER (WORDING BIGGER THAN POINTS)
    // ----------------------------------------------------
    const bannerY = 580;
    const bannerH = 145;
    c.save();
    drawRoundedRect(c, 100, bannerY, 880, bannerH, 20);
    const bannerGrad = c.createLinearGradient(100, bannerY, 980, bannerY + bannerH);
    bannerGrad.addColorStop(0, 'rgba(28, 41, 71, 0.92)');
    bannerGrad.addColorStop(1, 'rgba(14, 22, 41, 0.92)');
    c.fillStyle = bannerGrad;
    c.fill();
    c.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    c.lineWidth = 2;
    c.shadowColor = 'rgba(56, 189, 248, 0.25)';
    c.shadowBlur = 14;
    c.stroke();
    c.restore();

    // Eyebrow
    c.save();
    c.font = '600 13px "Space Grotesk", sans-serif';
    c.textAlign = 'center';
    c.fillStyle = '#94a3b8';
    c.fillText('MIND RARITY CLASSIFICATION', 540, bannerY + 30);

    // THE WORDING (BIGGER THAN POINTS!)
    c.font = '30px "Press Start 2P", monospace';
    c.fillStyle = '#38bdf8';
    c.shadowColor = '#38bdf8';
    c.shadowBlur = 14;
    c.fillText(scoreTitle.toUpperCase(), 540, bannerY + 74);

    // POINTS (Subordinate & elegant)
    c.shadowBlur = 0;
    const ptsPillText = `⚡ ${points} POINTS · RARITY SCORE`;
    c.font = '600 16px "Space Grotesk", sans-serif';
    const ptsW = c.measureText(ptsPillText).width + 30;
    drawRoundedRect(c, 540 - ptsW / 2, bannerY + 95, ptsW, 30, 15);
    c.fillStyle = '#090e1c';
    c.fill();
    c.strokeStyle = 'rgba(56, 189, 248, 0.5)';
    c.lineWidth = 1;
    c.stroke();
    c.fillStyle = '#f8fafc';
    c.fillText(ptsPillText, 540, bannerY + 116);
    c.restore();

    // ----------------------------------------------------
    // COGNITIVE SPECTRUM AXES
    // ----------------------------------------------------
    c.save();
    c.font = '14px "Press Start 2P", monospace';
    c.fillStyle = '#38bdf8';
    c.textAlign = 'left';
    c.fillText('// COGNITIVE SPECTRUM', 105, 762);
    c.restore();

    let axisY = 795;
    const axesData = opts.axes || { plan_chaos: 50, solo_crew: 50, logic_instinct: 50 };
    const axisEntries = Object.entries(axesData);
    const axisNameMap: Record<string, [string, string]> = {
      plan_chaos: ['PLAN', 'CHAOS'],
      solo_crew: ['SOLO', 'CREW'],
      logic_instinct: ['LOGIC', 'INSTINCT'],
    };

    for (const [key, rawVal] of axisEntries) {
      const val = typeof rawVal === 'number' ? rawVal : 50;
      const [leftLabel, rightLabel] = axisNameMap[key.toLowerCase()] || [key.replace('_', ' ').toUpperCase(), ''];
      c.save();
      // Labels
      c.font = 'bold 16px "Space Grotesk", sans-serif';
      c.fillStyle = val <= 50 ? '#38bdf8' : '#64748b';
      c.textAlign = 'left';
      c.fillText(leftLabel, 105, axisY);

      c.fillStyle = val > 50 ? '#e879f9' : '#64748b';
      c.textAlign = 'right';
      c.fillText(rightLabel, 975, axisY);

      // Percentage value in center
      c.font = '11px "Press Start 2P", monospace';
      c.fillStyle = '#f8fafc';
      c.textAlign = 'center';
      c.fillText(`${val}%`, 540, axisY - 2);

      // Track
      const trackY = axisY + 10;
      drawRoundedRect(c, 105, trackY, 870, 14, 7);
      c.fillStyle = '#111a2d';
      c.fill();
      c.strokeStyle = '#253554';
      c.lineWidth = 1;
      c.stroke();

      // Center midline
      c.strokeStyle = '#334155';
      c.beginPath();
      c.moveTo(540, trackY - 2);
      c.lineTo(540, trackY + 16);
      c.stroke();

      // Fill bar
      const fillW = Math.max(6, Math.min(870, (val / 100) * 870));
      drawRoundedRect(c, 105, trackY, fillW, 14, 7);
      const barGrad = c.createLinearGradient(105, trackY, 975, trackY);
      barGrad.addColorStop(0, '#38bdf8');
      barGrad.addColorStop(1, '#e879f9');
      c.fillStyle = barGrad;
      c.fill();

      // Pin indicator
      c.beginPath();
      c.arc(105 + fillW, trackY + 7, 7, 0, Math.PI * 2);
      c.fillStyle = '#ffffff';
      c.shadowColor = '#e879f9';
      c.shadowBlur = 8;
      c.fill();

      c.restore();
      axisY += 66;
    }

    // ----------------------------------------------------
    // VERDICT DOSSIER BOX
    // ----------------------------------------------------
    const verdBoxY = 1010;
    const verdBoxH = 590;
    c.save();
    drawRoundedRect(c, 100, verdBoxY, 880, verdBoxH, 20);
    c.fillStyle = 'rgba(15, 23, 42, 0.9)';
    c.fill();
    c.strokeStyle = '#2d3f63';
    c.lineWidth = 1.5;
    c.stroke();

    // Top bar
    c.font = '14px "Press Start 2P", monospace';
    c.fillStyle = '#38bdf8';
    c.textAlign = 'left';
    c.fillText('// COGNITIVE VERDICT', 130, verdBoxY + 42);

    // Heat flames
    c.textAlign = 'right';
    c.font = '16px "Space Grotesk", sans-serif';
    let heatStr = '';
    for (let h = 1; h <= 5; h++) {
      heatStr += h <= verdictHeat ? '🔥' : '▫️';
    }
    c.fillText(`HEAT: ${heatStr}`, 950, verdBoxY + 42);

    // Headline Stamp
    c.textAlign = 'left';
    c.font = 'bold 23px "Space Grotesk", sans-serif';
    c.fillStyle = '#f8fafc';
    c.fillText(`⚡ ${verdictHeadline}`, 130, verdBoxY + 90);

    // Compliment
    c.font = '19px "Space Grotesk", sans-serif';
    c.fillStyle = '#94a3b8';
    const compLines = wrapTextToWidth(c, compliment, 820);
    let cY = verdBoxY + 130;
    for (const cline of compLines.slice(0, 4)) {
      c.fillText(cline, 130, cY);
      cY += 30;
    }

    // Roast Box
    if (roast) {
      const roastBoxY = Math.max(cY + 20, verdBoxY + 280);
      const roastBoxH = verdBoxH - (roastBoxY - verdBoxY) - 30;
      drawRoundedRect(c, 125, roastBoxY, 830, roastBoxH, 12);
      c.fillStyle = 'rgba(244, 63, 94, 0.08)';
      c.fill();
      c.strokeStyle = '#f43f5e';
      c.lineWidth = 1.5;
      c.stroke();

      c.font = '600 13px "Press Start 2P", monospace';
      c.fillStyle = '#f43f5e';
      c.fillText('🔥 SYSTEM ROAST:', 145, roastBoxY + 34);

      c.font = '19px "Space Grotesk", sans-serif';
      c.fillStyle = '#fecdd3';
      const roastLines = wrapTextToWidth(c, roast, 780);
      let rY = roastBoxY + 70;
      for (const rline of roastLines.slice(0, 4)) {
        c.fillText(rline, 145, rY);
        rY += 28;
      }
    }
    c.restore();
  } else {
    // ==========================================
    // CREW SHARE CARD
    // ==========================================
    const crewTitle = opts.crewTitle || 'YOUR CREW';
    const crewSync = opts.crewSync ?? 0;
    const crewHeadline = opts.crewRoastHeadline || 'CREW SYNCHRONIZATION';
    const crewRoastLine = opts.crewRoastLine || '';
    const crewStats = opts.crewStats || [];
    const highlights = opts.crewHighlights || [];
    const accentColor = opts.crewTierColor || '#34d399';

    // Hero Sync Card Box
    const syncBoxY = 270;
    const syncBoxH = 260;
    c.save();
    drawRoundedRect(c, 100, syncBoxY, 880, syncBoxH, 20);
    c.fillStyle = 'rgba(16, 26, 48, 0.9)';
    c.fill();
    c.strokeStyle = accentColor;
    c.lineWidth = 2.5;
    c.shadowColor = accentColor;
    c.shadowBlur = 18;
    c.stroke();

    c.font = '600 15px "Space Grotesk", sans-serif';
    c.textAlign = 'center';
    c.fillStyle = '#94a3b8';
    c.fillText(`CREW: ${crewTitle.toUpperCase()}`, 540, syncBoxY + 38);

    // Large Sync % & Tier Badge
    c.font = '48px "Press Start 2P", monospace';
    c.fillStyle = accentColor;
    c.fillText(`${crewSync}% SYNC`, 540, syncBoxY + 110);

    c.font = '16px "Press Start 2P", monospace';
    c.fillStyle = '#f8fafc';
    c.fillText(crewHeadline.toUpperCase(), 540, syncBoxY + 152);

    // Sync Bar
    drawRoundedRect(c, 160, syncBoxY + 175, 760, 20, 10);
    c.fillStyle = '#090e1c';
    c.fill();
    c.strokeStyle = '#1e3a34';
    c.stroke();

    const syncFillW = Math.max(10, Math.min(760, (crewSync / 100) * 760));
    drawRoundedRect(c, 160, syncBoxY + 175, syncFillW, 20, 10);
    const syncGrad = c.createLinearGradient(160, syncBoxY + 175, 920, syncBoxY + 175);
    syncGrad.addColorStop(0, '#38bdf8');
    syncGrad.addColorStop(1, accentColor);
    c.fillStyle = syncGrad;
    c.fill();

    // Stats under bar
    c.font = '13px "Press Start 2P", monospace';
    c.fillStyle = '#94a3b8';
    c.fillText(crewStats.join('   //   '), 540, syncBoxY + 230);
    c.restore();

    // Crew Roast Dossier
    const cRoastY = 560;
    const cRoastH = 220;
    c.save();
    drawRoundedRect(c, 100, cRoastY, 880, cRoastH, 20);
    c.fillStyle = 'rgba(244, 63, 94, 0.08)';
    c.fill();
    c.strokeStyle = 'rgba(244, 63, 94, 0.4)';
    c.lineWidth = 1.5;
    c.stroke();

    c.font = '600 15px "Press Start 2P", monospace';
    c.fillStyle = '#fb7185';
    c.textAlign = 'center';
    c.fillText(`🔥 CREW VERDICT & ROAST`, 540, cRoastY + 45);

    c.font = '21px "Space Grotesk", sans-serif';
    c.fillStyle = '#f8fafc';
    const cRoastLines = wrapTextToWidth(c, `"${crewRoastLine}"`, 800);
    let cry = cRoastY + 95;
    for (const line of cRoastLines.slice(0, 3)) {
      c.fillText(line, 540, cry);
      cry += 32;
    }
    c.restore();

    // Squad Highlights Grid
    let highY = 810;
    c.save();
    c.font = '15px "Press Start 2P", monospace';
    c.fillStyle = '#38bdf8';
    c.textAlign = 'left';
    c.fillText('// SQUAD AWARDS & HIGHLIGHTS', 105, highY);
    highY += 30;

    for (const item of highlights.slice(0, 5)) {
      drawRoundedRect(c, 100, highY, 880, 115, 14);
      c.fillStyle = 'rgba(15, 23, 42, 0.9)';
      c.fill();
      c.strokeStyle = '#2d3f63';
      c.lineWidth = 1.5;
      c.stroke();

      c.font = '13px "Press Start 2P", monospace';
      c.fillStyle = '#fde047';
      c.textAlign = 'left';
      c.fillText(item.label, 130, highY + 40);

      c.font = '18px "Space Grotesk", sans-serif';
      c.fillStyle = '#cbd5e1';
      const itemLines = wrapTextToWidth(c, item.text, 820);
      let iy = highY + 75;
      for (const line of itemLines.slice(0, 2)) {
        c.fillText(line, 130, iy);
        iy += 26;
      }

      highY += 135;
    }
    c.restore();
  }

  // 7. Footer Section (Both Solo and Crew)
  c.save();
  // Barcode decoration
  c.fillStyle = 'rgba(56, 189, 248, 0.4)';
  const barStartX = 240;
  for (let b = 0; b < 40; b++) {
    const bw = (b % 3 === 0) ? 6 : (b % 2 === 0) ? 3 : 2;
    c.fillRect(barStartX + b * 15, 1660, bw, 22);
  }

  c.font = '16px "Press Start 2P", monospace';
  c.fillStyle = '#38bdf8';
  c.textAlign = 'center';
  c.fillText('BRAINPRINT.APP', 540, 1724);

  c.font = '15px "Space Grotesk", sans-serif';
  c.fillStyle = '#94a3b8';
  c.fillText('SAME QUESTIONS. DIFFERENT MINDS.', 540, 1758);

  c.font = '13px "Space Grotesk", sans-serif';
  c.fillStyle = '#64748b';
  c.fillText(location.href, 540, 1788);
  c.restore();

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create share card'))), 'image/png')
  );
  return new File([blob], opts.isCrew ? 'brainprint-crew.png' : 'brainprint.png', { type: 'image/png' });
}

function wrap(text: string, max: number) {
  const words = text.split(/\s+/),
    out: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > max && line) {
      out.push(line);
      line = word;
    } else line = (line + ' ' + word).trim();
  }
  if (line) out.push(line);
  return out;
}

function avatarPixels(key: string) {
  const ids = ['architect', 'lone_oracle', 'dispatcher', 'anchor', 'rogue_tactician', 'free_agent', 'plot_twister', 'spark'],
    i = Math.max(0, ids.indexOf(key)),
    rows: string[] = [];
  for (let y = 0; y < 16; y++) {
    let row = '';
    for (let x = 0; x < 16; x++) {
      const headWidth = [4, 2, 3, 4, 3, 2, 4, 3][i],
        bodyWidth = [5, 3, 5, 6, 4, 3, 6, 4][i],
        head = y >= 2 && y <= 6 && Math.abs(x - 7.5) <= headWidth,
        body = y >= 7 && y <= 14 && Math.abs(x - 7.5) <= bodyWidth + (i === 4 && y > 9 ? 1 : 0),
        detail =
          (i === 0 && y === 12 && x === 11) ||
          (i === 1 && y === 1 && x === 8) ||
          (i === 2 && y === 7 && (x === 2 || x === 13)) ||
          (i === 3 && y === 14 && (x === 4 || x === 11)) ||
          (i === 4 && y === 6 && (x === 3 || x === 12)) ||
          (i === 5 && y === 1 && x === 7) ||
          (i === 6 && y === 8 && x === 2) ||
          (i === 7 && y === 2 && (x === 4 || x === 11));
      row += head || body || detail ? '1' : '0';
    }
    rows.push(row);
  }
  return rows;
}

const avatarColors = ['#38bdf8', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#e879f9', '#fb7185', '#f43f5e'];

function PixelAvatar({ id }: { id: string }) {
  const i = Math.max(
    0,
    ['architect', 'lone_oracle', 'dispatcher', 'anchor', 'rogue_tactician', 'free_agent', 'plot_twister', 'spark'].indexOf(id)
  );
  const pixels = avatarPixels(id);
  return (
    <svg className="pixel-avatar" viewBox="0 0 16 16" role="img" aria-label={`${id.replace('_', ' ')} pixel avatar`} shapeRendering="crispEdges">
      <rect width="16" height="16" fill="#111a2d" />
      {pixels.flatMap((row, y) =>
        [...row].map((v, x) => (v === '1' ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={avatarColors[i]} /> : null))
      )}
    </svg>
  );
}

const getIstDateString = (date = new Date()): string => {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
};

export default function App() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [pack, setPack] = useState('the_mix');
  const [view, setView] = useState<'home' | 'play' | 'reveal' | 'done' | 'crew'>('home');
  const [qs, setQs] = useState<Question[]>([]);
  const [at, setAt] = useState(0);
  const [challengeDate, setChallengeDate] = useState<string>('');
  const [reveal, setReveal] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [seconds, setSeconds] = useState(30);
  const [resetSeconds, setResetSeconds] = useState(0);
  const [crewCode, setCrewCode] = useState('');
  const [crew, setCrew] = useState<any>(null);
  const [crewAt, setCrewAt] = useState(0);
  const [crewSetup, setCrewSetup] = useState(false);
  const [crewInQuiz, setCrewInQuiz] = useState(false);
  const [copiedType, setCopiedType] = useState<'code' | 'link' | null>(null);
  const [setupMode, setSetupMode] = useState<'themed' | 'mixed' | 'join'>('themed');
  const [nickname, setNickname] = useState(() => {
    try {
      return localStorage.getItem('brainprint-nickname') || '';
    } catch {
      return '';
    }
  });
  const [crewName, setCrewName] = useState('');

  const copyCrewCode = () => {
    sound.playSelect();
    navigator.clipboard.writeText(crewCode);
    setCopiedType('code');
    setTimeout(() => setCopiedType(null), 2500);
  };

  const copyCrewLink = () => {
    sound.playSelect();
    const link = `${window.location.origin}/crew/${crewCode}`;
    navigator.clipboard.writeText(link);
    setCopiedType('link');
    setTimeout(() => setCopiedType(null), 2500);
  };

  // Track answered question and user choice for reveal screen inspection
  const [lastAnsweredQ, setLastAnsweredQ] = useState<Question | null>(null);
  const [lastChosenIndex, setLastChosenIndex] = useState<number | null>(null);
  const [inspectedOptionIndex, setInspectedOptionIndex] = useState<number | null>(null);

  // Audio mute states
  const [musicMuted, setMusicMuted] = useState(sound.getMusicMuted());
  const [sfxMuted, setSfxMuted] = useState(sound.getSfxMuted());

  // Initialize audio on first user gesture
  useEffect(() => {
    const handleFirstGesture = () => {
      sound.init();
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };
    window.addEventListener('pointerdown', handleFirstGesture);
    window.addEventListener('keydown', handleFirstGesture);
    return () => {
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
    };
  }, []);

  useEffect(() => {
    fetch('/api/packs?deviceId=' + device())
      .then((r) => r.json())
      .then((d) => setPacks(d.packs || []))
      .catch(() => { });
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      // Indian Standard Time (IST) is UTC + 5:30 (19,800,000 ms)
      const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(now.getTime() + IST_OFFSET_MS);
      // Next midnight IST converted back to absolute time:
      const nextMidnightIstUtcTime =
        Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() + 1, 0, 0, 0) -
        IST_OFFSET_MS;
      setResetSeconds(Math.max(0, Math.ceil((nextMidnightIstUtcTime - now.getTime()) / 1000)));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const loadCrew = async (code: string, nick = '') => {
    const activeNick = (nick || nickname || localStorage.getItem('brainprint-nickname') || '').trim();
    if (activeNick) {
      try {
        localStorage.setItem('brainprint-nickname', activeNick);
      } catch { }
    }
    await fetch(`/api/crews/${code}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: device(), nickname: activeNick || undefined }),
    }).catch(() => { });
    const r = await fetch(`/api/crews/${code}?deviceId=${device()}`),
      d = await r.json();
    if (!r.ok) throw Error(d.error || 'Could not open crew');
    const crewQuestions = (d.crew?.questions || d.questions || []) as Question[];
    remember(crewQuestions);
    setCrew({
      ...d,
      completed: d.completed ?? d.crew?.completed ?? d.me?.completed ?? false,
      memberCount: d.memberCount ?? d.crew?.memberCount ?? d.members?.length ?? 0,
      completedCount: d.completedCount ?? d.crew?.completedCount ?? 0,
      questions: crewQuestions,
      members: d.members || [],
      crew: {
        ...d.crew,
        questions: crewQuestions,
        packId: d.crew?.packId || 'the_mix',
      },
    });
    setCrewCode(code);
    setCrewAt(d.me?.answeredCount ?? d.progress ?? 0);
    setPack(d.crew?.packId || 'the_mix');
    setView('crew');
  };

  useEffect(() => {
    const match = location.pathname.match(/^\/crew\/([A-Z0-9]{6})$/i);
    if (match) {
      setCrewCode(match[1].toUpperCase());
      setSetupMode('join');
      setCrewSetup(true);
      setCrewInQuiz(false);
    }
  }, []);

  useEffect(() => {
    if (view !== 'crew' || !crewCode) return;
    const t = setInterval(() => loadCrew(crewCode).catch(() => { }), 3000);
    return () => clearInterval(t);
  }, [view, crewCode]);

  // 30-second Solo countdown timer
  useEffect(() => {
    if (view !== 'play') return;
    setSeconds(30);
    const t = setInterval(() => {
      setSeconds((s) => {
        if (s <= 5 && s > 1) {
          sound.playTick();
        }
        return Math.max(0, s - 1);
      });
    }, 1000);
    return () => clearInterval(t);
  }, [view, at]);

  const startWithPack = async (packIdToUse: string, replay = false) => {
    sound.playSelect();
    setErr('');
    setBusy(true);
    try {
      const url =
        '/api/solo/daily?packId=' +
        packIdToUse +
        '&deviceId=' +
        device() +
        (replay ? '&replay=true' : '');
      const r = await fetch(url);
      const d = await r.json();
      if (!r.ok) throw Error(d.error || 'Could not start');
      setQs(d.questions);
      setChallengeDate(d.date || getIstDateString());
      const isDone = !replay && Boolean(d.completed || d.resume?.completed_at);
      const resData = d.finalResult || d.result || null;
      setAt(replay ? 0 : d.answerRecords?.length || d.resume?.answer_records?.length || 0);
      if (isDone && resData) {
        setResult(resData);
        setView('done');
        sound.playFanfare();
      } else {
        setResult(null);
        setView('play');
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const startDaily = () => {
    setPack('the_mix');
    startWithPack('the_mix');
  };

  const answer = async (optionIndex: number) => {
    if (busy) return;
    sound.playAnswer();
    setBusy(true);
    setErr('');

    const currentQ = qs[at];
    setLastAnsweredQ(currentQ);
    setLastChosenIndex(optionIndex);
    setInspectedOptionIndex(optionIndex);

    const sendDate = challengeDate || getIstDateString();
    try {
      const r = await fetch('/api/solo/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deviceId: device(),
          packId: pack,
          date: sendDate,
          questionId: currentQ.id,
          optionIndex,
          overthinker: seconds === 0,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (r.status === 409 || d.error?.includes('reset')) {
          setErr('Daily set reset for the new IST day. Reloading today’s questions...');
          await startWithPack(pack);
          return;
        }
        throw Error(d.error || 'Could not save answer');
      }
      const revealPayload = d.reveal || d;
      setReveal(revealPayload);
      if (d.finalResult || d.result) {
        setResult(d.finalResult || d.result);
      }
      setView('reveal');
      sound.playReveal();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    sound.playSelect();
    setInspectedOptionIndex(null);
    if (at >= 6 || (reveal && (reveal.completed || result))) {
      setView('done');
      sound.playFanfare();
    } else {
      setAt((i) => i + 1);
      setView('play');
    }
  };

  const createCrew = (mode: 'themed' | 'mixed' = 'themed') => {
    sound.playSelect();
    setSetupMode(mode);
    setCrewName('');
    setNickname('');
    setCrewSetup(true);
    setCrewInQuiz(false);
  };

  const submitCrewSetup = async () => {
    sound.playSelect();
    setBusy(true);
    setErr('');
    try {
      const activeNick = nickname.trim();
      if (activeNick) {
        try {
          localStorage.setItem('brainprint-nickname', activeNick);
        } catch { }
      }
      if (setupMode === 'join') {
        setCrewSetup(false);
        setCrewInQuiz(false);
        await loadCrew(crewCode, activeNick);
        return;
      }
      const r = await fetch('/api/crews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deviceId: device(),
          packId: pack,
          mode: setupMode,
          name: crewName,
          nickname: activeNick || undefined,
          exclude_question_ids: seenIds(),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || 'Could not create crew');
      history.pushState({}, '', `/crew/${d.code}`);
      setCrewSetup(false);
      setCrewInQuiz(false);
      await loadCrew(d.code, activeNick);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const crewAnswer = async (optionIndex: number) => {
    if (busy || !crew) return;
    sound.playAnswer();
    setBusy(true);
    try {
      const questions = (crew.crew?.questions || crew.questions || []) as Question[];
      const question = questions[crewAt];
      if (!question) throw new Error('Question not found');
      const activeNick = (nickname || localStorage.getItem('brainprint-nickname') || '').trim();
      const r = await fetch(`/api/crews/${crewCode}/answer`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            deviceId: device(),
            questionId: question.id,
            optionIndex,
            nickname: activeNick || undefined,
          }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error || 'Could not save answer');
      setCrewAt(d.progress ?? (crewAt + 1));
      await loadCrew(crewCode, activeNick);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const testFriend = async () => {
    if (!crew) return;
    setBusy(true);
    try {
      const friend = crypto.randomUUID();
      await fetch(`/api/crews/${crewCode}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId: friend, nickname: 'Friend 2' }),
      });
      const questions = (crew.crew?.questions || crew.questions || []) as Question[];
      for (let i = 0; i < questions.length; i++) {
        const r = await fetch(`/api/crews/${crewCode}/answer`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ deviceId: friend, nickname: 'Friend 2', questionId: questions[i].id, optionIndex: i % 4 }),
        });
        if (!r.ok) throw Error('Friend simulation could not finish');
      }
      await loadCrew(crewCode);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    sound.playSelect();
    const pts = result?.totalPoints ?? result?.total_points ?? 0;
    const scoreTitle = result?.scoreTitle || result?.score_title || 'The Unconventional';
    const archetype = result?.archetype?.name || 'BRAINPRINT';
    const avatarKey = result?.archetype?.id || 'architect';
    const trait = result?.archetype?.oneLineTrait || result?.archetype?.trait || '';
    const verdictHeadline = result?.verdict?.headlineStamp || result?.verdict?.headline || 'CLASSIFIED SIGNAL';
    const verdictHeat = result?.verdict?.heat || 0;
    const compliment = result?.verdict?.compliment || 'Your choices left a distinct signal.';
    const roast = result?.verdict?.roast || '';
    const text = `My BRAINPRINT is ${archetype} — ${pts} points. Same questions. Different minds.`;
    const cardAxes = result?.axisResult?.sliders
      ? {
          plan_chaos: result.axisResult.sliders[0],
          solo_crew: result.axisResult.sliders[1],
          logic_instinct: result.axisResult.sliders[2],
        }
      : result?.axes;
    const file = await makeCard({
      isCrew: false,
      archetype,
      avatarKey,
      scoreTitle,
      points: pts,
      trait,
      verdictHeadline,
      verdictHeat,
      compliment,
      roast,
      axes: cardAxes,
    });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: 'My BRAINPRINT', text, files: [file] });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };

  const downloadSolo = async () => {
    sound.playSelect();
    const pts = result?.totalPoints ?? result?.total_points ?? 0;
    const scoreTitle = result?.scoreTitle || result?.score_title || 'The Unconventional';
    const archetype = result?.archetype?.name || 'BRAINPRINT';
    const avatarKey = result?.archetype?.id || 'architect';
    const trait = result?.archetype?.oneLineTrait || result?.archetype?.trait || '';
    const verdictHeadline = result?.verdict?.headlineStamp || result?.verdict?.headline || 'CLASSIFIED SIGNAL';
    const verdictHeat = result?.verdict?.heat || 0;
    const compliment = result?.verdict?.compliment || 'Your choices left a distinct signal.';
    const roast = result?.verdict?.roast || '';
    const cardAxes = result?.axisResult?.sliders
      ? {
          plan_chaos: result.axisResult.sliders[0],
          solo_crew: result.axisResult.sliders[1],
          logic_instinct: result.axisResult.sliders[2],
        }
      : result?.axes;
    const file = await makeCard({
      isCrew: false,
      archetype,
      avatarKey,
      scoreTitle,
      points: pts,
      trait,
      verdictHeadline,
      verdictHeat,
      compliment,
      roast,
      axes: cardAxes,
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const crewCardFile = async () => {
    const b = crew?.board;
    if (!b) return null;
    const highlights: { label: string; text: string }[] = [];
    const verdict = b.verdict;

    if (verdict?.awards?.length) {
      for (const aw of verdict.awards.slice(0, 4)) {
        highlights.push({
          label: `${aw.icon} ${aw.title.toUpperCase()}`,
          text: `${aw.winnerNicknames.join(' & ')} · ${aw.explanation}`,
        });
      }
    } else {
      const twoPlayer = b.twoPlayerSummary;
      if (twoPlayer?.perfectSyncQuestions?.length) {
        highlights.push({
          label: '🌟 PERFECT SYNC',
          text: `${twoPlayer.perfectSyncQuestions.length} signals matched unanimously!`,
        });
      }
      if (twoPlayer?.splitDecisionQuestions?.length) {
        highlights.push({
          label: '⚔️ SPLIT DECISIONS',
          text: `${twoPlayer.splitDecisionQuestions.length} signals diverged between players.`,
        });
      }
      if (b.mindTwins?.length) {
        highlights.push({
          label: '👯 MIND TWINS',
          text: b.mindTwins.map((p: any) => `${(p.names || [p.memberAName, p.memberBName]).join(' & ')} (${p.matches}/7 matches)`).join(', '),
        });
      }
      if (b.commonGround?.length) {
        highlights.push({
          label: '🤝 COMMON GROUND',
          text: b.commonGround.map((q: any) => q.prompt).join(' · '),
        });
      }
      if (b.civilWar?.length) {
        highlights.push({
          label: '⚔️ CIVIL WAR',
          text: b.civilWar.map((q: any) => q.prompt).join(' · '),
        });
      }
    }

    const syncPct = b.crewSyncPercent ?? b.sync ?? 0;
    const roastHeadline = verdict?.tier.title || b.roast?.title || b.roast?.headline || 'CREW VERDICT';
    const roastLine = verdict?.tier.verdictLine || b.roast?.line || '';
    const playerCount = b.completedCount || b.members?.length || 0;
    const signalCount = (b.questionBreakdowns || b.questions)?.length || 7;

    return makeCard({
      isCrew: true,
      crewTitle: crew?.crew?.name || 'YOUR CREW',
      crewSync: syncPct,
      crewRoastHeadline: roastHeadline,
      crewRoastLine: roastLine,
      crewTierColor: verdict?.tier.badgeColor,
      crewStats: [
        `${playerCount} PLAYERS`,
        `${signalCount} SIGNALS`,
        `CODE: ${crewCode}`,
      ],
      crewHighlights: highlights,
    });
  };

  const shareCrew = async () => {
    sound.playSelect();
    const file = await crewCardFile();
    if (!file) return;
    const syncPct = crew.board?.crewSyncPercent ?? crew.board?.sync ?? 0;
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: 'BRAINPRINT Crew Board', text: `Our crew synced at ${syncPct}%.`, files: [file] });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = 'brainprint-crew.png';
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };

  const downloadCrew = async () => {
    sound.playSelect();
    const file = await crewCardFile();
    if (!file) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = 'brainprint-crew.png';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const currentRevealQ = lastAnsweredQ || qs[at];

  return (
    <main data-theme={pack}>
      <div className="scene" aria-hidden="true">
        <div className="sun" />
        <div className="grid" />
      </div>
      <header>
        <div className="brand-group">
          {view !== 'home' && (
            <button
              type="button"
              className="home-nav-btn"
              onClick={() => {
                sound.playSelect();
                setView('home');
              }}
              title="Return to Home"
            >
              ◀ HOME
            </button>
          )}
          <div className="brand-text">
            <span className="brand">BRAINPRINT</span>
            <span className="tag">SAME QUESTIONS. DIFFERENT MINDS.</span>
          </div>
        </div>
        <div className="audio-controls">
          <button
            type="button"
            className={`audio-btn ${musicMuted ? 'muted' : 'active'}`}
            onClick={() => setMusicMuted(sound.toggleMusic())}
            title={musicMuted ? 'Unmute Music' : 'Mute Music'}
          >
            {musicMuted ? '🔇 MUSIC' : '🎵 MUSIC'}
          </button>
          <button
            type="button"
            className={`audio-btn ${sfxMuted ? 'muted' : 'active'}`}
            onClick={() => setSfxMuted(sound.toggleSfx())}
            title={sfxMuted ? 'Unmute SFX' : 'Mute SFX'}
          >
            {sfxMuted ? '🔇 SFX' : '🔊 SFX'}
          </button>
        </div>
      </header>

      <section className="game">
        {view === 'home' && (
          <>
            <div className="eyebrow">
              <span>DAILY SIGNAL</span>
              <span>
                IST RESET{' '}
                {String(Math.floor(resetSeconds / 3600)).padStart(2, '0')}:
                {String(Math.floor(resetSeconds / 60) % 60).padStart(2, '0')}:
                {String(resetSeconds % 60).padStart(2, '0')}
              </span>
            </div>
            <h1>
              WHAT’S YOUR
              <br />
              <em>BRAINPRINT?</em>
            </h1>
            <p className="hook">
              Solo: Think Rare.
              <br />
              Crew: Think Alike.
            </p>
            <p className="honesty">
              Answer honestly. Your Brainprint is built from how you really think. Points measure how uncommon an answer is, never
              intelligence, morality or worth.
            </p>
            <button className="primary" onClick={startDaily} disabled={busy}>
              ▶ PLAY DAILY SIGNAL
            </button>
            <button className="secondary" onClick={() => createCrew('themed')} disabled={busy}>
              ✦ PLAY WITH CREW
            </button>
            <button className="secondary" onClick={() => createCrew('mixed')} disabled={busy}>
              ✦ MIXED CREW
            </button>
            <div className="footnote">7 SIGNALS · NO SIGNUP · 30 SECONDS · JUST YOUR INSTINCTS</div>
          </>
        )}

        {view === 'play' && qs[at] && (
          <>
            <div className="eyebrow">
              SIGNAL {at + 1} / 7{' '}
              <span className={`timer ${seconds <= 5 ? 'timer-danger' : ''}`}>
                {seconds === 0 ? 'OVERTHINKER' : `00:${String(seconds).padStart(2, '0')}`}
              </span>
            </div>
            <div className="pulse">
              <i style={{ width: `${(seconds / 30) * 100}%` }} />
            </div>
            {at === 0 && (
              <p className="fine">
                Answer honestly. Your Brainprint is built from how you really think. Points measure how uncommon an answer is, never
                intelligence, morality or worth.
              </p>
            )}
            <h2>{qs[at].prompt}</h2>
            <div className="options">
              {qs[at].options.map((o, i) => (
                <button key={i} disabled={busy} onClick={() => answer(i)}>
                  <b>0{i + 1}</b>
                  {o.text}
                </button>
              ))}
            </div>

          </>
        )}

        {/* ENHANCED SOLO REVEAL SCREEN: PERCENTAGES + HIGHLIGHTS + CLICKABLE OPTIONS */}
        {view === 'reveal' && reveal && (
          <>
            <div className="reveal-question-context">
              <div className="eyebrow">
                <span>SIGNAL {at + 1} // CROWD READ</span>
                <span className="timer">{reveal.tier}</span>
              </div>
              {currentRevealQ && (
                <div className="reveal-question-prompt">
                  "{currentRevealQ.prompt}"
                </div>
              )}
            </div>

            <div className="tier-box">
              <div className="eyebrow" style={{ margin: 0, justifyContent: 'center' }}>
                <span>RARITY TIER</span>
              </div>
              <div className="tier">{reveal.tier}</div>
              <div className="tier-points">
                +{reveal.points} <small>POINTS</small>
              </div>
              <p className="fine" style={{ margin: '8px 0 0' }}>
                {reveal.overthinker && '⏱ OVERTHINKER · '}
                Based on {reveal.sampleSize || 1} {reveal.sampleSize === 1 ? 'player' : 'players'}
              </p>
            </div>

            <div className="eyebrow">
              <span>HOW PLAYERS ANSWERED</span>
              <span>TAP OPTION TO INSPECT</span>
            </div>

            <div className="reveal-options-list">
              {currentRevealQ?.options.map((opt, i) => {
                const bar = reveal.bars?.[i];
                const rawVotes = bar ? bar.votes : (reveal.voteCounts?.[i] ?? (i === lastChosenIndex ? 1 : 0));
                const totalVotes =
                  (reveal.bars?.reduce((sum: number, b: any) => sum + (b.votes || 0), 0)) ||
                  (reveal.voteCounts?.[0] || 0) +
                  (reveal.voteCounts?.[1] || 0) +
                  (reveal.voteCounts?.[2] || 0) +
                  (reveal.voteCounts?.[3] || 0) ||
                  reveal.sampleSize ||
                  1;
                const pct =
                  reveal.distribution?.[i] !== undefined
                    ? reveal.distribution[i]
                    : Math.round((rawVotes / Math.max(1, totalVotes)) * 100);

                const isChosen = i === lastChosenIndex;
                const isInspected = i === inspectedOptionIndex;
                const votesCount = bar ? bar.votes : (reveal.voteCounts?.[i] ?? (i === lastChosenIndex ? 1 : 0));

                return (
                  <button
                    key={i}
                    type="button"
                    className={`reveal-option-card ${isChosen ? 'is-chosen' : ''} ${isInspected ? 'is-inspected' : ''}`}
                    onClick={() => {
                      sound.playSelect();
                      setInspectedOptionIndex(isInspected && !isChosen ? null : i);
                    }}
                  >
                    <div className="reveal-opt-top">
                      <div className="reveal-opt-left">
                        <span className="reveal-opt-num">0{i + 1}</span>
                        <span className="reveal-opt-text">{opt.text}</span>
                      </div>
                      <div className="reveal-opt-right">
                        <span className="reveal-opt-pct">{pct}%</span>
                        {isChosen && <span className="your-choice-pill">YOUR CHOICE ✓</span>}
                      </div>
                    </div>

                    <div className="reveal-bar-track">
                      <div
                        className={`reveal-bar-fill ${isChosen ? 'chosen-fill' : ''}`}
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>

                    {isInspected && (
                      <div className="reveal-opt-detail">
                        <span>{votesCount} {votesCount === 1 ? 'player' : 'players'} picked this</span>
                        {isChosen ? <span>★ Your signal choice</span> : <span>Tap to collapse</span>}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {reveal.verdict && (
              <blockquote>
                {reveal.verdict}
              </blockquote>
            )}

            <button className="primary" onClick={next}>
              {at === 6 ? 'LOCK BRAINPRINT →' : 'NEXT SIGNAL →'}
            </button>
          </>
        )}

        {view === 'done' && (
          <div className="result-dossier-card">
            <div className="dossier-header-bar">
              <span className="dossier-badge">// SIGNAL DOSSIER // DECLASSIFIED</span>
              <span className="dossier-status-dot">● LOCKED</span>
            </div>

            {/* SCORE TITLE WORDING (BIGGER THAN POINTS) */}
            <div className="score-title-banner">
              <span className="score-tier-label">MIND RARITY CLASSIFICATION</span>
              <h1 className="score-title-wording">{result?.scoreTitle || result?.score_title || 'THE UNCONVENTIONAL'}</h1>
              <div className="score-points-badge">
                <span className="score-points-icon">⚡</span>
                <span className="score-points-val">{result?.totalPoints ?? result?.total_points ?? 0}</span>
                <span className="score-points-unit">POINTS · RARITY SCORE</span>
              </div>
            </div>

            {/* ARCHETYPE SHOWCASE */}
            <div className="archetype-hero-box">
              <div className="avatar-pedestal">
                <div className="pedestal-corner top-left" />
                <div className="pedestal-corner top-right" />
                <div className="pedestal-corner bottom-left" />
                <div className="pedestal-corner bottom-right" />
                {result?.archetype?.id ? <PixelAvatar id={result.archetype.id} /> : <div className="avatar-placeholder" />}
              </div>
              <div className="archetype-info">
                <span className="archetype-tag">PRIMARY ARCHETYPE</span>
                <h2 className="archetype-name">{result?.archetype?.name || 'THE SIGNAL'}</h2>
                {(result?.archetype?.oneLineTrait || result?.archetype?.trait) && (
                  <p className="archetype-trait">
                    "{result.archetype.oneLineTrait || result.archetype.trait}"
                  </p>
                )}
              </div>
            </div>

            {/* COGNITIVE SPECTRUM AXES */}
            {(() => {
              const sliders = result?.axisResult?.sliders || result?.sliders;
              const axesObj = result?.axes;
              let items: { label: string; left: string; right: string; val: number }[] = [];
              if (sliders && sliders.length === 3) {
                items = [
                  { label: 'PLAN_CHAOS', left: 'PLAN', right: 'CHAOS', val: sliders[0] },
                  { label: 'SOLO_CREW', left: 'SOLO', right: 'CREW', val: sliders[1] },
                  { label: 'LOGIC_INSTINCT', left: 'LOGIC', right: 'INSTINCT', val: sliders[2] },
                ];
              } else if (axesObj) {
                const mapKeys: Record<string, [string, string]> = {
                  plan_chaos: ['PLAN', 'CHAOS'],
                  solo_crew: ['SOLO', 'CREW'],
                  logic_instinct: ['LOGIC', 'INSTINCT'],
                };
                items = Object.entries(axesObj).map(([k, v]: any) => {
                  const pair = mapKeys[k.toLowerCase()] || [k.toUpperCase(), ''];
                  return { label: k, left: pair[0], right: pair[1], val: v };
                });
              }

              if (!items.length) return null;

              return (
                <div className="axis-hud">
                  <div className="axis-hud-title">
                    <span>// COGNITIVE SPECTRUM</span>
                    <span className="axis-hud-sub">BALANCED RATIOS</span>
                  </div>
                  {items.map((it) => (
                    <div className="axis-meter" key={it.label}>
                      <div className="axis-meter-labels">
                        <span className={`axis-side ${it.val <= 50 ? 'active' : ''}`}>{it.left}</span>
                        <span className="axis-meter-val">{it.val}%</span>
                        <span className={`axis-side ${it.val > 50 ? 'active' : ''}`}>{it.right}</span>
                      </div>
                      <div className="axis-track">
                        <div className="axis-midline" />
                        <div className="axis-fill" style={{ width: `${Math.max(0, Math.min(100, it.val))}%` }} />
                        <div className="axis-pin" style={{ left: `${Math.max(0, Math.min(100, it.val))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* VERDICT & ROAST DOSSIER */}
            <div className="verdict-dossier">
              <div className="verdict-header">
                <span className="verdict-stamp">⚡ {result?.verdict?.headlineStamp || result?.verdict?.headline || 'CLASSIFIED SIGNAL'}</span>
                <div className="heat" aria-label={`Heat ${result?.verdict?.heat} out of 5`}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <i className={i <= (result?.verdict?.heat || 0) ? 'hot' : ''} key={i} />
                  ))}
                </div>
              </div>
              <div className="verdict-section compliment">
                <span className="verdict-tag">💡 COGNITIVE SIGNAL</span>
                <p className="verdict-text">{result?.verdict?.compliment || 'Your choices left a distinct signal.'}</p>
              </div>
              {result?.verdict?.roast && (
                <div className="verdict-section roast">
                  <span className="verdict-tag">🔥 THE ROAST</span>
                  <p className="verdict-text">{result.verdict.roast}</p>
                </div>
              )}
            </div>

            {(result?.packLine || result?.pack_line) && <p className="fine pack-line-note">{result.packLine || result.pack_line}</p>}

            {/* --------------------------------------------------------
                SIGNAL LOG: ALL 7 QUESTIONS, CHOSEN ANSWER, & POINTS FOR OTHER OPTIONS
                -------------------------------------------------------- */}
            {(() => {
              const breakdown: any[] = result?.questionBreakdown || (qs && qs.length ? qs.map((q, idx) => {
                const rec = (result?.answerRecords || []).find((r: any) => r.question_id === q.id) || result?.answerRecords?.[idx];
                const chosenIdx = rec ? rec.option_index : 0;
                return {
                  questionId: q.id,
                  prompt: q.prompt,
                  chosenIndex: chosenIdx,
                  chosenPoints: rec?.points ?? 20,
                  chosenTier: rec?.tier ?? 'UNUSUAL',
                  options: q.options.map((opt, oIdx) => ({
                    optionIndex: oIdx,
                    text: opt.text,
                    points: oIdx === chosenIdx ? (rec?.points ?? 20) : (oIdx % 2 === 0 ? 5 : 45),
                    tier: oIdx === chosenIdx ? (rec?.tier ?? 'UNUSUAL') : (oIdx % 2 === 0 ? 'FAMILIAR' : 'OUTLIER'),
                    percentage: oIdx === chosenIdx ? 28 : 24,
                    isChosen: oIdx === chosenIdx,
                  })),
                };
              }) : []);

              if (!breakdown.length) return null;

              return (
                <div className="signals-breakdown-section">
                  <div className="breakdown-header">
                    <div>
                      <span className="eyebrow">// SIGNAL LOG · 7 SIGNALS</span>
                      <h3 className="breakdown-title">CHOICES & POINT POTENTIAL</h3>
                    </div>
                    <span className="breakdown-tag">THINK RARE</span>
                  </div>

                  {/* Think Rare scoring explainer */}
                  <div className="think-rare-explainer">
                    <div className="explainer-icon">⚡</div>
                    <div className="explainer-content">
                      <div className="explainer-heading">HOW POINTS WORK: "THINK RARE"</div>
                      <p className="explainer-desc">
                        Solo mode rewards rare instincts! The more unique your answer was compared to other players, the more points you scored.
                      </p>
                      <div className="tier-pills-row">
                        <span className="tier-pill wildcard">WILDCARD &lt;12% · 80 PTS</span>
                        <span className="tier-pill outlier">OUTLIER 12-22% · 45 PTS</span>
                        <span className="tier-pill unusual">UNUSUAL 22-35% · 20 PTS</span>
                        <span className="tier-pill familiar">FAMILIAR &gt;35% · 5 PTS</span>
                      </div>
                    </div>
                  </div>

                  {/* List of 7 Signal Cards */}
                  <div className="signal-cards-list">
                    {breakdown.map((item, qIdx) => (
                      <div className="signal-review-card" key={item.questionId || qIdx}>
                        <div className="signal-review-header">
                          <span className="signal-num-badge">SIGNAL 0{qIdx + 1}</span>
                          <span className={`signal-earned-pill tier-${item.chosenTier?.toLowerCase()}`}>
                            EARNED +{item.chosenPoints} PTS · {item.chosenTier}
                          </span>
                        </div>
                        <h4 className="signal-review-prompt">{item.prompt}</h4>

                        <div className="signal-options-list">
                          {item.options.map((opt: any, optIdx: number) => {
                            const isChosen = opt.isChosen || optIdx === item.chosenIndex;
                            return (
                              <div
                                key={optIdx}
                                className={`signal-opt-row ${isChosen ? 'is-user-choice' : ''}`}
                              >
                                <div className="signal-opt-main">
                                  <span className="signal-opt-index">0{optIdx + 1}</span>
                                  <span className="signal-opt-text">{opt.text}</span>
                                  {isChosen && <span className="your-choice-tag">YOUR PICK</span>}
                                </div>

                                <div className="signal-opt-stat">
                                  <span className={`opt-points-tag tier-${opt.tier?.toLowerCase()}`}>
                                    {isChosen ? `+${opt.points} PTS` : `IF PICKED: +${opt.points} PTS`}
                                  </span>
                                  {opt.percentage != null && (
                                    <span className="opt-crowd-pct">
                                      {opt.percentage}% OF MINDS
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ACTION BUTTONS */}
            <div className="result-actions">
              <button className="primary share-btn" onClick={share}>
                <span className="btn-icon">⚡</span> SHARE BRAINPRINT
              </button>
              <button className="secondary download-btn" onClick={downloadSolo}>
                <span className="btn-icon">⬇</span> DOWNLOAD SHARE CARD (HD)
              </button>
              <button className="secondary crew-btn" onClick={() => createCrew('themed')}>
                <span className="btn-icon">👥</span> PLAY WITH CREW
              </button>
            </div>

            {/* Post-quiz Theme Pack Selection */}
            <div className="theme-packs-section">
              <div className="eyebrow">EXPLORE THEME PACKS</div>
              <p className="fine">
                Daily signal locked! Now try our specialized theme packs to see how your instincts hold up:
              </p>
              <div className="theme-pack-grid">
                {packs.map((p) => (
                  <button
                    key={p.id}
                    className={`theme-card ${pack === p.id ? 'active' : ''}`}
                    onClick={() => {
                      setPack(p.id);
                      startWithPack(p.id, true);
                    }}
                  >
                    <span className="theme-card-tag">
                      {p.id === 'the_mix' ? 'SHUFFLED' : p.id === 'neon_coast' ? 'NIGHTLIFE' : 'CAMPUS'}
                    </span>
                    <b>{p.name}</b>
                    <span className="theme-card-desc">
                      {p.id === 'the_mix'
                        ? 'General chaos, everyday dilemmas, and unexpected cross-roads.'
                        : p.id === 'neon_coast'
                          ? 'Midnight drives, clubs, neon streets, and after-hours decisions.'
                          : 'Dorm life, dining halls, late-night cram sessions, and campus survival.'}
                    </span>
                    <span className="theme-card-play">PLAY PACK →</span>
                  </button>
                ))}
              </div>
            </div>

            <button className="textbtn" onClick={() => setView('home')}>
              ← BACK TO HOME
            </button>
          </div>
        )}

        {view === 'crew' && crew && (
          <>
            {/* If Crew Board is not yet unlocked */}
            {!crew.board && (
              <>
                {/* STATE A: CURRENT PLAYER HAS NOT COMPLETED ALL 7 QUESTIONS */}
                {!((crew.completed ?? crew.crew?.completed ?? crew.me?.completed ?? false) || crewAt >= 7) && (
                  <>
                    {!crewInQuiz ? (
                      /* A1. CREW ROOM / LOBBY WINDOW */
                      <div className="crew-room-window">
                        <div className="crew-room-topbar">
                          <div className="crew-counter-badge" title="Connected Players">
                            <span className="crew-counter-icon">👥</span>
                            <span className="crew-counter-val">
                              {(crew.members?.length ?? crew.memberCount ?? 1)}/12
                            </span>
                          </div>
                          <div className="crew-theme-badge">
                            {(crew.crew?.packId || 'the_mix').replace('_', ' ').toUpperCase()}
                          </div>
                        </div>

                        <div className="eyebrow">
                          <span>CREW ROOM // {crewCode}</span>
                          <span>LOBBY</span>
                        </div>
                        <h1>{crew.crew?.name || 'YOUR CREW'}</h1>

                        {/* Room Join Code Card */}
                        <div className="crew-room-code-card">
                          <div className="crew-room-code-header">
                            <span className="crew-room-code-label">ROOM JOIN CODE</span>
                            <span className="crew-room-hint">Share this code or copy the invite link below</span>
                          </div>
                          <div className="crew-room-code-box">
                            <span className="crew-room-code-digits">{crewCode}</span>
                            <button
                              type="button"
                              className="crew-code-copy-btn"
                              onClick={copyCrewCode}
                            >
                              {copiedType === 'code' ? '✓ COPIED' : 'COPY CODE'}
                            </button>
                          </div>
                        </div>

                        {/* Share / Copy Link Actions */}
                        <div className="crew-room-actions">
                          <button
                            type="button"
                            className="secondary crew-copy-link-btn"
                            onClick={copyCrewLink}
                          >
                            {copiedType === 'link' ? '✓ LINK COPIED TO CLIPBOARD' : '🔗 COPY INVITE LINK'}
                          </button>
                          <button
                            type="button"
                            className="secondary crew-wa-btn"
                            onClick={() =>
                              window.open(
                                'https://wa.me/?text=' +
                                  encodeURIComponent(
                                    `Join my BRAINPRINT crew! Room Code: ${crewCode}\n${window.location.origin}/crew/${crewCode}`
                                  ),
                                '_blank',
                                'noopener'
                              )
                            }
                          >
                            💬 SHARE ON WHATSAPP
                          </button>
                        </div>

                        {/* Connected Players Section */}
                        <div className="crew-connected-card">
                          <div className="crew-connected-header">
                            <span className="crew-connected-title">CONNECTED PLAYERS</span>
                            <span className="crew-connected-count">
                              {(crew.members?.length ?? crew.memberCount ?? 1)} / 12
                            </span>
                          </div>
                          <div className="crew-connected-list">
                            {(crew.members || []).map((m: any, idx: number) => {
                              const isHost = idx === 0;
                              return (
                                <div
                                  key={m.memberId || idx}
                                  className={`crew-connected-item ${m.isMe ? 'is-me' : ''}`}
                                >
                                  <div className="crew-connected-avatar">
                                    {(m.nickname || 'P').slice(0, 2).toUpperCase()}
                                  </div>
                                  <div className="crew-connected-info">
                                    <div className="crew-connected-name-row">
                                      <span className="crew-connected-name">{m.nickname}</span>
                                      {m.isMe && <span className="crew-badge-you">YOU</span>}
                                      {isHost && <span className="crew-badge-host">HOST</span>}
                                    </div>
                                    <div className="crew-connected-status">
                                      {m.completed ? (
                                        <span className="status-done">✓ Finished (7/7)</span>
                                      ) : (
                                        <span className="status-ready">● Connected</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Independent Start Quiz Panel */}
                        <div className="crew-start-panel">
                          <button
                            type="button"
                            className="primary crew-start-btn"
                            onClick={() => {
                              sound.playSelect();
                              setCrewInQuiz(true);
                            }}
                          >
                            {crewAt > 0 ? `▶ CONTINUE MY QUIZ (${crewAt + 1}/7)` : '▶ START MY QUIZ'}
                          </button>
                          <p className="crew-start-explainer">
                            ⚡ <strong>Independent Start:</strong> You can start whenever you want. Your start won't force or start the quiz for other players, and vice versa.
                          </p>
                        </div>

                        {import.meta.env.DEV && (
                          <button className="textbtn" onClick={testFriend} disabled={busy}>
                            TEST AS FRIEND #2
                          </button>
                        )}
                      </div>
                    ) : (
                      /* A2. ACTIVE CREW QUIZ VIEW */
                      <>
                        <div className="crew-quiz-header">
                          <div className="crew-counter-badge" title="Connected Players">
                            <span className="crew-counter-icon">👥</span>
                            <span className="crew-counter-val">
                              {(crew.members?.length ?? crew.memberCount ?? 1)}/12
                            </span>
                          </div>
                          <button
                            type="button"
                            className="textbtn crew-lobby-toggle-btn"
                            onClick={() => {
                              sound.playSelect();
                              setCrewInQuiz(false);
                            }}
                          >
                            👥 CREW ROOM ({crewCode})
                          </button>
                        </div>

                        <div className="eyebrow">SIGNAL {crewAt + 1} / 7</div>
                        <h2>{(crew.crew?.questions || crew.questions)?.[crewAt]?.prompt}</h2>
                        <div className="options">
                          {(crew.crew?.questions || crew.questions)?.[crewAt]?.options?.map((o: any, i: number) => (
                            <button key={i} onClick={() => crewAnswer(i)} disabled={busy}>
                              <b>0{i + 1}</b>
                              {o.text}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* STATE B: CURRENT PLAYER HAS COMPLETED ALL 7 QUESTIONS, WAITING FOR BOARD UNLOCK */}
                {Boolean((crew.completed ?? crew.crew?.completed ?? crew.me?.completed ?? false) || crewAt >= 7) && (
                  <div className="crew-room-window">
                    <div className="crew-room-topbar">
                      <div className="crew-counter-badge" title="Connected Players">
                        <span className="crew-counter-icon">👥</span>
                        <span className="crew-counter-val">
                          {(crew.members?.length ?? crew.memberCount ?? 1)}/12
                        </span>
                      </div>
                      <div className="crew-theme-badge">
                        {(crew.crew?.packId || 'the_mix').replace('_', ' ').toUpperCase()}
                      </div>
                    </div>

                    <div className="eyebrow">
                      <span>CREW SIGNAL // {crewCode}</span>
                      <span>WAITING FOR CREW</span>
                    </div>
                    <h1>WAITING FOR CREW</h1>
                    <p className="fine">
                      You've finished all 7 signals! ({crew.completedCount ?? crew.crew?.completedCount ?? 1} of {(crew.members?.length ?? crew.memberCount ?? 1)} completed). Your answers stay sealed until another player finishes.
                    </p>

                    {/* Room Join Code Card */}
                    <div className="crew-room-code-card">
                      <div className="crew-room-code-header">
                        <span className="crew-room-code-label">ROOM JOIN CODE</span>
                        <span className="crew-room-hint">Invite friends to unlock the squad verdict</span>
                      </div>
                      <div className="crew-room-code-box">
                        <span className="crew-room-code-digits">{crewCode}</span>
                        <button
                          type="button"
                          className="crew-code-copy-btn"
                          onClick={copyCrewCode}
                        >
                          {copiedType === 'code' ? '✓ COPIED' : 'COPY CODE'}
                        </button>
                      </div>
                    </div>

                    {/* Share / Copy Link Actions */}
                    <div className="crew-room-actions">
                      <button
                        type="button"
                        className="secondary crew-copy-link-btn"
                        onClick={copyCrewLink}
                      >
                        {copiedType === 'link' ? '✓ LINK COPIED TO CLIPBOARD' : '🔗 COPY INVITE LINK'}
                      </button>
                      <button
                        type="button"
                        className="primary crew-wa-btn"
                        onClick={() =>
                          window.open(
                            'https://wa.me/?text=' +
                              encodeURIComponent(
                                `Join my BRAINPRINT crew! Room Code: ${crewCode}\n${window.location.origin}/crew/${crewCode}`
                              ),
                            '_blank',
                            'noopener'
                          )
                        }
                      >
                        💬 SHARE ON WHATSAPP
                      </button>
                    </div>

                    {/* Connected Players Section */}
                    <div className="crew-connected-card">
                      <div className="crew-connected-header">
                        <span className="crew-connected-title">CONNECTED PLAYERS</span>
                        <span className="crew-connected-count">
                          {(crew.members?.length ?? crew.memberCount ?? 1)} / 12
                        </span>
                      </div>
                      <div className="crew-connected-list">
                        {(crew.members || []).map((m: any, idx: number) => {
                          const isHost = idx === 0;
                          return (
                            <div
                              key={m.memberId || idx}
                              className={`crew-connected-item ${m.isMe ? 'is-me' : ''}`}
                            >
                              <div className="crew-connected-avatar">
                                {(m.nickname || 'P').slice(0, 2).toUpperCase()}
                              </div>
                              <div className="crew-connected-info">
                                <div className="crew-connected-name-row">
                                  <span className="crew-connected-name">{m.nickname}</span>
                                  {m.isMe && <span className="crew-badge-you">YOU</span>}
                                  {isHost && <span className="crew-badge-host">HOST</span>}
                                </div>
                                <div className="crew-connected-status">
                                  {m.completed ? (
                                    <span className="status-done">✓ Finished (7/7)</span>
                                  ) : (
                                    <span className="status-ready">⏳ Answering...</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {import.meta.env.DEV && (
                      <button className="textbtn" onClick={testFriend} disabled={busy}>
                        TEST AS FRIEND #2
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {/* BEAUTIFIED CREW BOARD END SCREEN & CREW VERDICT SYSTEM */}
            {crew.board && (
              <>
                {crew.board.verdict ? (
                  <CrewVerdictView
                    verdict={crew.board.verdict}
                    myNickname={crew.me?.nickname}
                    myDeviceId={device()}
                    onShare={shareCrew}
                    onDownload={downloadCrew}
                    onCopyLink={() => {
                      sound.playSelect();
                      navigator.clipboard.writeText(location.href);
                    }}
                    onPlayAgain={() => createCrew(crew.crew?.mode || 'mixed')}
                    onHome={() => setView('home')}
                  />
                ) : (
                  <>
                    {/* Fallback 1. Hero Sync Card */}
                    <div className="crew-hero-card">
                      <div className="crew-sync-badge">
                        <span className="crew-sync-num">
                          {crew.board.crewSyncPercent ?? crew.board.sync ?? 0}%
                        </span>
                        <span className="crew-sync-label">CREW SYNCHRONIZATION</span>
                      </div>
                      <div className="crew-sync-bar">
                        <div
                          className="crew-sync-fill"
                          style={{ width: `${crew.board.crewSyncPercent ?? crew.board.sync ?? 0}%` }}
                        />
                      </div>
                      <div className="crew-roast-box">
                        <div className="crew-roast-badge">
                          🔥 {crew.board.roast?.title || crew.board.roast?.headline || 'SQUAD VERDICT'}
                        </div>
                        <p className="crew-roast-text">"{crew.board.roast?.line || ''}"</p>
                      </div>
                    </div>
                  </>
                )}

                {/* Question Breakdown: Who Chose What (Available below verdict) */}
                {((crew.board.questionBreakdowns?.length > 0) || (crew.board.questions?.length > 0)) && (
                  <div className="crew-section" style={{ marginTop: '20px' }}>
                    <div className="eyebrow">
                      <span>SIGNAL BREAKDOWN</span>
                      <span>WHO CHOSE WHAT</span>
                    </div>
                    <div className="crew-questions-list">
                      {(crew.board.questionBreakdowns || crew.board.questions).map(
                        (q: any, i: number) => {
                          const agreement = q.agreementPercent ?? q.agreement ?? 0;
                          const isPerfect = q.isPerfectSync || agreement === 100;

                          // Find what I chose and what others chose for the quick summary
                          let myChoiceText = '';
                          const otherChoices: { nickname: string; text: string }[] = [];
                          q.options?.forEach((opt: any) => {
                            opt.voters?.forEach((v: any) => {
                              const voterIsMe = v.isMe || v.deviceId === device();
                              if (voterIsMe) {
                                myChoiceText = opt.text;
                              } else {
                                otherChoices.push({
                                  nickname: v.nickname || 'Player',
                                  text: opt.text,
                                });
                              }
                            });
                          });

                          return (
                            <div key={q.questionId || i} className="crew-q-card">
                              <div className="crew-q-header">
                                <span className="crew-q-num">SIGNAL 0{i + 1}</span>
                                <span className={`crew-q-agreement ${isPerfect ? 'perfect' : ''}`}>
                                  {isPerfect ? '🌟 PERFECT SYNC' : `${agreement}% SYNC`}
                                </span>
                              </div>
                              <h4 className="crew-q-prompt">{q.prompt}</h4>

                              {/* Quick Decision Banner */}
                              {myChoiceText && otherChoices.length > 0 && (
                                <div className={`crew-choice-summary-pill ${isPerfect ? 'is-sync' : 'is-split'}`}>
                                  {isPerfect ? (
                                    <span>
                                      🤝 <strong>Unanimous:</strong> Everyone chose "{myChoiceText}"
                                    </span>
                                  ) : (
                                    <span>
                                      ⚔️ <strong>You:</strong> "{myChoiceText}" ·{' '}
                                      {otherChoices.map((oc, ocIdx) => (
                                        <span key={ocIdx}>
                                          <strong>{oc.nickname}:</strong> "{oc.text}"{ocIdx < otherChoices.length - 1 ? ' · ' : ''}
                                        </span>
                                      ))}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* All 4 Options List */}
                              {q.options?.length > 0 && (
                                <div className="crew-q-options-breakdown">
                                  {q.options.map((opt: any, optIdx: number) => {
                                    const voters = opt.voters || [];
                                    const count = opt.count ?? voters.length ?? 0;
                                    const hasMe = voters.some((v: any) => v.isMe || v.deviceId === device());
                                    const otherVoters = voters.filter((v: any) => !v.isMe && v.deviceId !== device());
                                    const isSyncMatch = hasMe && otherVoters.length > 0;

                                    let rowClass = 'crew-q-opt-row';
                                    if (count === 0) rowClass += ' no-votes';
                                    else if (isSyncMatch) rowClass += ' is-sync-match';
                                    else if (hasMe) rowClass += ' is-my-choice';
                                    else rowClass += ' is-peer-choice';

                                    return (
                                      <div key={optIdx} className={rowClass}>
                                        <div className="crew-q-opt-header">
                                          <div className="crew-q-opt-main">
                                            <span className="signal-opt-index">0{optIdx + 1}</span>
                                            <span className="crew-q-opt-text">{opt.text}</span>
                                          </div>
                                          {hasMe && (
                                            <span className={`your-choice-tag ${isSyncMatch ? 'sync-match' : ''}`}>
                                              {isSyncMatch ? '🌟 SYNC MATCH' : 'YOUR PICK'}
                                            </span>
                                          )}
                                          {!hasMe && otherVoters.length > 0 && (
                                            <span className="peer-choice-tag">
                                              {otherVoters.map((v: any) => v.nickname || 'Friend').join(', ')}'S PICK
                                            </span>
                                          )}
                                        </div>

                                        {voters.length > 0 && (
                                          <div className="crew-q-voter-chips">
                                            <span className="voter-label">Voted by:</span>
                                            {voters.map((v: any, vIdx: number) => {
                                              const voterIsMe = v.isMe || v.deviceId === device();
                                              return (
                                                <span
                                                  key={vIdx}
                                                  className={`voter-chip ${voterIsMe ? 'is-me' : ''}`}
                                                >
                                                  {v.nickname || 'Player'}
                                                  {voterIsMe ? ' (YOU)' : ''}
                                                </span>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}

                {/* 6. Action Buttons */}
                <button className="primary" onClick={shareCrew}>
                  SHARE CREW CARD
                </button>
                <button className="secondary" onClick={downloadCrew}>
                  DOWNLOAD CREW CARD
                </button>
                <button className="secondary" onClick={() => navigator.clipboard.writeText(location.href)}>
                  COPY CREW LINK
                </button>
                <button className="secondary" onClick={() => createCrew(crew.crew?.mode || 'mixed')}>
                  ▶ RUN IT BACK (NEW 7)
                </button>
              </>
            )}
          </>
        )}

        {err && (
          <p className="error" role="alert">
            {err}
          </p>
        )}
      </section>

      <footer>ORIGINAL ARCADE // YOUR BRAIN, YOUR BUSINESS</footer>

      {crewSetup && (
        <div className="modal-shade">
          <section className="setup-dialog" role="dialog" aria-modal="true" aria-labelledby="crew-setup-title">
            <div className="eyebrow">{setupMode === 'join' ? 'JOIN SIGNAL' : 'CREW SETUP'}</div>
            <h2 id="crew-setup-title">{setupMode === 'join' ? `JOIN ${crewCode}` : setupMode === 'mixed' ? 'MIXED CREW' : 'NEW CREW'}</h2>
            {setupMode !== 'join' && (
              <>
                {setupMode === 'themed' && packs.length > 0 && (
                  <label>
                    CREW THEME <span>CHOOSE PACK</span>
                    <select
                      value={pack}
                      onChange={(e) => setPack(e.target.value)}
                      style={{
                        display: 'block',
                        width: '100%',
                        marginTop: '8px',
                        minHeight: '48px',
                        padding: '10px',
                        background: '#0b1020',
                        border: '1px solid #47536d',
                        color: '#fff',
                        font: '16px "Space Grotesk", Arial, sans-serif',
                      }}
                    >
                      {packs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  CREW NAME <span>OPTIONAL · 24 MAX</span>
                  <input value={crewName} maxLength={24} onChange={(e) => setCrewName(e.target.value)} placeholder="Name your crew" />
                </label>
              </>
            )}
            <label>
              NICKNAME <span>OPTIONAL · 18 MAX</span>
              <input value={nickname} maxLength={18} onChange={(e) => setNickname(e.target.value)} placeholder="How friends see you" />
            </label>
            <p className="fine">No account or personal details. Your answers stay private until you finish.</p>
            <button className="primary" disabled={busy} onClick={submitCrewSetup}>
              {setupMode === 'join' ? 'JOIN CREW' : 'CREATE CREW'}
            </button>
            <button className="textbtn" disabled={busy} onClick={() => setCrewSetup(false)}>
              MAYBE LATER
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
