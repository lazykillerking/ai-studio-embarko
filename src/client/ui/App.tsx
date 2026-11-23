import { useEffect, useState } from 'react';
import { sound } from './audio';

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

const remember = (questions: Question[]) => {
  const list = seenIds();
  for (const q of questions) {
    const at = list.indexOf(q.id);
    if (at >= 0) list.splice(at, 1);
    list.push(q.id);
  }
  localStorage.setItem('brainprint-seen', JSON.stringify(list.slice(-21)));
};

async function makeCard(
  title: string,
  subtitle: string,
  lines: string[],
  axes?: Record<string, number>,
  avatarKey = 'architect'
) {
  await document.fonts.load('34px "Press Start 2P"');
  await document.fonts.load('24px "Space Grotesk"');
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#0b1020';
  c.fillRect(0, 0, 1080, 1920);
  c.fillStyle = '#141d31';
  c.fillRect(64, 64, 952, 1792);
  c.strokeStyle = '#38bdf8';
  c.lineWidth = 8;
  c.strokeRect(64, 64, 952, 1792);
  c.fillStyle = '#38bdf8';
  c.font = '36px "Press Start 2P",monospace';
  c.fillText('BRAINPRINT', 110, 170);
  const av = avatarPixels(avatarKey);
  const avIndex = Math.max(
    0,
    ['architect', 'lone_oracle', 'dispatcher', 'anchor', 'rogue_tactician', 'free_agent', 'plot_twister', 'spark'].indexOf(avatarKey)
  );
  av.forEach((row, y) =>
    [...row].forEach((v, x) => {
      if (v === '1') {
        c.fillStyle = avatarColors[avIndex];
        c.fillRect(470 + x * 10, 230 + y * 10, 10, 10);
      }
    })
  );
  c.fillStyle = '#f8fafc';
  c.font = '34px "Press Start 2P",monospace';
  let yy = 470;
  for (const line of [title, subtitle]) {
    for (const part of wrap(line, 29)) {
      c.fillText(part, 110, yy);
      yy += 58;
    }
    yy += 24;
  }
  c.fillStyle = '#38bdf8';
  c.font = '24px "Space Grotesk",Arial,sans-serif';
  for (const line of lines.filter(Boolean)) {
    for (const part of wrap(line, 42)) {
      c.fillText(part, 110, yy);
      yy += 42;
    }
    yy += 25;
  }
  if (axes) {
    yy += 28;
    for (const [name, val] of Object.entries(axes)) {
      c.fillStyle = '#f8fafc';
      c.fillText(name.replace('_', ' / ').toUpperCase(), 110, yy);
      c.fillStyle = '#263149';
      c.fillRect(110, yy + 18, 850, 24);
      c.fillStyle = '#e879f9';
      c.fillRect(110, yy + 18, Math.max(0, Math.min(100, val)) * 8.5, 24);
      yy += 100;
    }
  }
  c.fillStyle = '#9ba5ba';
  c.font = '24px "Space Grotesk",Arial,sans-serif';
  wrap(location.href, 52).forEach((line, i) => c.fillText(line, 110, 1770 + i * 30));
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create share card'))), 'image/png')
  );
  return new File([blob], 'brainprint.png', { type: 'image/png' });
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

export default function App() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [pack, setPack] = useState('the_mix');
  const [view, setView] = useState<'home' | 'play' | 'reveal' | 'done' | 'crew'>('home');
  const [qs, setQs] = useState<Question[]>([]);
  const [at, setAt] = useState(0);
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
  const [setupMode, setSetupMode] = useState<'themed' | 'mixed' | 'join'>('themed');
  const [nickname, setNickname] = useState('');
  const [crewName, setCrewName] = useState('');

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
      const now = new Date(),
        next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      setResetSeconds(Math.max(0, Math.ceil((next - now.getTime()) / 1000)));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const loadCrew = async (code: string, nick = '') => {
    await fetch(`/api/crews/${code}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deviceId: device(), nickname: nick }),
    });
    const r = await fetch(`/api/crews/${code}?deviceId=${device()}`),
      d = await r.json();
    if (!r.ok) throw Error(d.error || 'Could not open crew');
    remember(d.crew.questions);
    setCrew(d);
    setCrewCode(code);
    setCrewAt(d.progress || 0);
    setPack(d.crew.packId);
    setView('crew');
  };

  useEffect(() => {
    const match = location.pathname.match(/^\/crew\/([A-Z0-9]{6})$/i);
    if (match) {
      setCrewCode(match[1].toUpperCase());
      setSetupMode('join');
      setCrewSetup(true);
    }
  }, []);

  useEffect(() => {
    if (view !== 'crew' || !crewCode) return;
    const t = setInterval(() => loadCrew(crewCode).catch(() => { }), 5000);
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

  const startWithPack = async (packIdToUse: string) => {
    sound.playSelect();
    setErr('');
    setBusy(true);
    try {
      const r = await fetch('/api/solo/daily?packId=' + packIdToUse + '&deviceId=' + device());
      const d = await r.json();
      if (!r.ok) throw Error(d.error || 'Could not start');
      setQs(d.questions);
      const isDone = Boolean(d.completed || d.resume?.completed_at);
      const resData = d.finalResult || d.result || null;
      setAt(d.answerRecords?.length || d.resume?.answer_records?.length || 0);
      if (isDone && resData) {
        setResult(resData);
        setView('done');
        sound.playFanfare();
      } else {
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

    try {
      const r = await fetch('/api/solo/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          deviceId: device(),
          packId: pack,
          date: new Date().toISOString().slice(0, 10),
          questionId: currentQ.id,
          optionIndex,
          overthinker: seconds === 0,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || 'Could not save answer');
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
  };

  const submitCrewSetup = async () => {
    sound.playSelect();
    setBusy(true);
    setErr('');
    try {
      if (setupMode === 'join') {
        setCrewSetup(false);
        await loadCrew(crewCode, nickname);
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
          nickname,
          exclude_question_ids: seenIds(),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || 'Could not create crew');
      history.pushState({}, '', `/crew/${d.code}`);
      setCrewSetup(false);
      await loadCrew(d.code, nickname);
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
      const question = crew.crew.questions[crewAt],
        r = await fetch(`/api/crews/${crewCode}/answer`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ deviceId: device(), questionId: question.id, optionIndex }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error || 'Could not save answer');
      setCrewAt(d.progress);
      await loadCrew(crewCode);
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
      for (let i = 0; i < crew.crew.questions.length; i++) {
        const r = await fetch(`/api/crews/${crewCode}/answer`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ deviceId: friend, nickname: 'Friend 2', questionId: crew.crew.questions[i].id, optionIndex: i % 4 }),
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
    const title = result?.scoreTitle || result?.score_title || '';
    const text = `My BRAINPRINT is ${result?.archetype?.name || 'still forming'} — ${pts} points. Same questions. Different minds.`;
    const cardAxes = result?.axisResult?.sliders
      ? {
          plan_chaos: result.axisResult.sliders[0],
          solo_crew: result.axisResult.sliders[1],
          logic_instinct: result.axisResult.sliders[2],
        }
      : result?.axes;
    const file = await makeCard(
      result?.archetype?.name || 'BRAINPRINT',
      `${pts} POINTS · ${title}`,
      [result?.verdict?.compliment || '', result?.verdict?.roast || ''],
      cardAxes,
      result?.archetype?.id
    );
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
    const title = result?.scoreTitle || result?.score_title || '';
    const cardAxes = result?.axisResult?.sliders
      ? {
          plan_chaos: result.axisResult.sliders[0],
          solo_crew: result.axisResult.sliders[1],
          logic_instinct: result.axisResult.sliders[2],
        }
      : result?.axes;
    const file = await makeCard(
      result?.archetype?.name || 'BRAINPRINT',
      `${pts} POINTS · ${title}`,
      [result?.verdict?.compliment || '', result?.verdict?.roast || ''],
      cardAxes,
      result?.archetype?.id
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const crewCardFile = async () => {
    const b = crew?.board;
    return b
      ? makeCard(`${b.sync}% CREW SYNC`, b.roast.headline, [
        b.roast.line,
        `${b.members.length} PLAYERS · ${b.questions.length} SIGNALS`,
        b.mindTwins ? `MIND TWINS: ${b.mindTwins.map((p: any) => p.names.join(' + ')).join(', ')}` : '',
        b.commonGround ? `COMMON GROUND: ${b.commonGround.map((q: any) => q.prompt).join(', ')}` : '',
        b.civilWar?.length ? `CIVIL WAR: ${b.civilWar.map((q: any) => q.prompt).join(', ')}` : '',
        b.perfectSync?.length ? `PERFECT SYNC: ${b.perfectSync.length} signals` : '',
        b.loneSignal ? `LONE SIGNAL: ${b.loneSignal.member?.nickname || 'Solo Player'}` : '',
      ])
      : null;
  };

  const shareCrew = async () => {
    sound.playSelect();
    const file = await crewCardFile();
    if (!file) return;
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: 'BRAINPRINT Crew Board', text: `Our crew synced at ${crew.board.sync}%.`, files: [file] });
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
          <span className="brand">BRAINPRINT</span>
          <span className="tag">SAME QUESTIONS. DIFFERENT MINDS.</span>
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
                UTC RESET{' '}
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
          <>
            <div className="eyebrow">YOUR SIGNAL PROFILE</div>
            <h1>{result?.archetype?.name || 'BRAINPRINT'}</h1>
            {result?.archetype?.id && <PixelAvatar id={result.archetype.id} />}
            <div className="score">
              {result?.totalPoints ?? result?.total_points ?? '—'}
              <small> POINTS</small>
            </div>
            <p className="hook">{result?.scoreTitle || result?.score_title || 'The Signal'}</p>
            {(result?.archetype?.oneLineTrait || result?.archetype?.trait) && <p>{result.archetype.oneLineTrait || result.archetype.trait}</p>}
            {(() => {
              const sliders = result?.axisResult?.sliders || result?.sliders;
              const axesObj = result?.axes;
              if (sliders && sliders.length === 3) {
                const labels = ['PLAN / CHAOS', 'SOLO / CREW', 'LOGIC / INSTINCT'];
                return labels.map((lbl, idx) => (
                  <div className="axis" key={lbl}>
                    <span>{lbl}</span>
                    <input type="range" min="0" max="100" value={sliders[idx]} readOnly />
                  </div>
                ));
              }
              if (axesObj) {
                return Object.entries(axesObj).map(([k, v]: any) => (
                  <div className="axis" key={k}>
                    <span>{k.replace('_', ' / ').toUpperCase()}</span>
                    <input type="range" min="0" max="100" value={v} readOnly />
                  </div>
                ));
              }
              return null;
            })()}
            <blockquote>
              <strong>{result?.verdict?.headlineStamp || result?.verdict?.headline}</strong>
              <div className="heat" aria-label={`Heat ${result?.verdict?.heat} out of 5`}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <i className={i <= (result?.verdict?.heat || 0) ? 'hot' : ''} key={i} />
                ))}
              </div>
              {result?.verdict?.compliment || 'Your choices left a distinct signal.'}
              <br />
              <br />
              {result?.verdict?.roast}
            </blockquote>
            {(result?.packLine || result?.pack_line) && <p className="fine">{result.packLine || result.pack_line}</p>}
            <button className="primary" onClick={share}>
              SHARE BRAINPRINT
            </button>
            <button className="secondary" onClick={downloadSolo}>
              DOWNLOAD SHARE CARD
            </button>
            <button className="secondary" onClick={() => createCrew('themed')}>
              PLAY WITH CREW
            </button>

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
                      startWithPack(p.id);
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
          </>
        )}

        {view === 'crew' && crew && (
          <>
            <div className="eyebrow">
              <span>CREW SIGNAL // {crewCode}</span>
              <span>{crew.crew.packId.replace('_', ' ').toUpperCase()}</span>
            </div>
            <h1>{crew.crew.name || 'YOUR CREW'}</h1>
            <p className="fine">
              {crew.memberCount} of 12 Players Joined · Room Code: <strong>{crewCode}</strong>
            </p>

            {import.meta.env.DEV && (
              <button className="textbtn" onClick={testFriend} disabled={busy}>
                TEST AS FRIEND #2
              </button>
            )}

            {!crew.completed && crewAt < 7 && (
              <>
                <div className="eyebrow">SIGNAL {crewAt + 1} / 7</div>
                <h2>{crew.crew.questions[crewAt]?.prompt}</h2>
                <div className="options">
                  {crew.crew.questions[crewAt]?.options.map((o: any, i: number) => (
                    <button key={i} onClick={() => crewAnswer(i)} disabled={busy}>
                      <b>0{i + 1}</b>
                      {o.text}
                    </button>
                  ))}
                </div>
              </>
            )}

            {!crew.completed && crewAt >= 7 && (
              <>
                <h2>WAITING FOR CREW ({crew.completedCount} completed)</h2>
                <p className="fine">Your answers are sealed until you finish all seven signals.</p>
                <button className="secondary" onClick={() => navigator.clipboard.writeText(location.href)}>
                  COPY INVITE LINK
                </button>
              </>
            )}

            {crew.completed && crew.completedCount < 2 && (
              <>
                <h2>WAITING FOR CREW ({crew.completedCount} joined)</h2>
                <p className="fine">Your answers stay private until another player finishes.</p>
                <button className="secondary" onClick={() => navigator.clipboard.writeText(location.href)}>
                  COPY INVITE LINK
                </button>
                <button
                  className="primary"
                  onClick={() =>
                    window.open('https://wa.me/?text=' + encodeURIComponent('Join my BRAINPRINT crew: ' + location.href), '_blank', 'noopener')
                  }
                >
                  SHARE ON WHATSAPP
                </button>
              </>
            )}

            {/* BEAUTIFIED CREW BOARD END SCREEN */}
            {crew.board && (
              <>
                {/* 1. Hero Sync Card */}
                <div className="crew-hero-card">
                  <div className="crew-sync-badge">
                    <span className="crew-sync-num">{crew.board.sync}%</span>
                    <span className="crew-sync-label">CREW SYNCHRONIZATION</span>
                  </div>
                  <div className="crew-sync-bar">
                    <div className="crew-sync-fill" style={{ width: `${crew.board.sync}%` }} />
                  </div>
                  <div className="crew-roast-box">
                    <div className="crew-roast-badge">🔥 {crew.board.roast.headline}</div>
                    <p className="crew-roast-text">"{crew.board.roast.line}"</p>
                  </div>
                </div>

                {/* 2. Squad Leaderboard */}
                <div className="crew-section">
                  <div className="eyebrow">
                    <span>SQUAD LEADERBOARD</span>
                    <span>{crew.completedCount} FINISHED</span>
                  </div>
                  <div className="crew-leaderboard">
                    {crew.board.members
                      ?.slice()
                      .sort((a: any, b: any) => b.score - a.score)
                      .map((m: any, rank: number) => (
                        <div key={m.deviceId} className={`crew-member-row ${m.deviceId === device() ? 'is-me' : ''}`}>
                          <span className="crew-rank">#{rank + 1}</span>
                          <div className="crew-member-info">
                            <div className="crew-member-name">
                              {m.nickname}
                              {m.deviceId === device() && <span className="you-chip">YOU</span>}
                            </div>
                            <div className="crew-member-bar-track">
                              <div className="crew-member-bar-fill" style={{ width: `${Math.min(100, (m.score / 700) * 100)}%` }} />
                            </div>
                          </div>
                          <span className="crew-member-score">
                            {m.score} <small>PTS</small>
                          </span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* 3. Squad Awards & Badges */}
                {(crew.board.mindTwins?.length > 0 ||
                  crew.board.commonGround?.length > 0 ||
                  crew.board.civilWar?.length > 0 ||
                  crew.board.loneSignal ||
                  crew.board.perfectSync?.length > 0) && (
                    <div className="crew-section">
                      <div className="eyebrow">SQUAD BADGES & HIGHLIGHTS</div>
                      <div className="crew-awards-grid">
                        {crew.board.mindTwins?.map((pair: any, i: number) => (
                          <div key={i} className="crew-award-card mind-twins">
                            <div className="crew-award-title">👯 MIND TWINS</div>
                            <div className="crew-award-desc">
                              <strong>{pair.names.join(' & ')}</strong> matched on {pair.matches} of 7 signals!
                            </div>
                          </div>
                        ))}

                        {crew.board.perfectSync?.length > 0 && (
                          <div className="crew-award-card common-ground">
                            <div className="crew-award-title">🌟 PERFECT SYNC ({crew.board.perfectSync.length} SIGNALS)</div>
                            <div className="crew-award-desc">
                              Unanimous squad choices: {crew.board.perfectSync.map((q: any) => `"${q.prompt}"`).join(', ')}
                            </div>
                          </div>
                        )}

                        {crew.board.commonGround?.length > 0 && !crew.board.perfectSync?.length && (
                          <div className="crew-award-card common-ground">
                            <div className="crew-award-title">🤝 COMMON GROUND</div>
                            <div className="crew-award-desc">
                              High consensus on: {crew.board.commonGround.map((q: any) => `"${q.prompt}"`).join(', ')}
                            </div>
                          </div>
                        )}

                        {crew.board.civilWar?.length > 0 && (
                          <div className="crew-award-card civil-war">
                            <div className="crew-award-title">⚔️ CIVIL WAR</div>
                            <div className="crew-award-desc">
                              Biggest disagreement: "{crew.board.civilWar[0]?.prompt}"
                            </div>
                          </div>
                        )}

                        {crew.board.loneSignal && (
                          <div className="crew-award-card lone-signal">
                            <div className="crew-award-title">🐺 LONE SIGNAL</div>
                            <div className="crew-award-desc">
                              <strong>{crew.board.loneSignal.member?.nickname || 'A rebel player'}</strong> took the solo route {crew.board.loneSignal.soloChoices} times.
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                {/* 4. Pairwise Matrix */}
                {crew.board.pairs?.length > 0 && (
                  <div className="crew-section">
                    <div className="eyebrow">PAIRWISE SYNC MATRIX</div>
                    <div className="crew-pairs-grid">
                      {crew.board.pairs.map((pair: any, i: number) => (
                        <div key={i} className="crew-pair-card">
                          <div className="crew-pair-names">{pair.names.join(' + ')}</div>
                          <div className="crew-pair-meter">
                            <div className="crew-pair-fill" style={{ width: `${pair.percent}%` }} />
                          </div>
                          <div className="crew-pair-stat">
                            <span>{pair.matches}/7 MATCHES</span>
                            <span>{pair.percent}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 5. Question Breakdown */}
                {crew.board.questions?.length > 0 && (
                  <div className="crew-section">
                    <div className="eyebrow">SIGNAL BREAKDOWN</div>
                    <div className="crew-questions-list">
                      {crew.board.questions.map((q: any, i: number) => {
                        const isPerfect = q.agreement === 100;
                        return (
                          <div key={q.questionId || i} className="crew-q-card">
                            <div className="crew-q-header">
                              <span className="crew-q-num">SIGNAL {i + 1}</span>
                              <span className={`crew-q-agreement ${isPerfect ? 'perfect' : ''}`}>
                                {isPerfect ? '🌟 PERFECT SYNC' : `${q.agreement}% SYNC`}
                              </span>
                            </div>
                            <div className="crew-q-prompt">{q.prompt}</div>
                            <div className="crew-q-counts">
                              Choices distribution: {q.counts.join(' / ')}
                            </div>
                          </div>
                        );
                      })}
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
                <button className="secondary" onClick={() => createCrew(crew.crew.mode)}>
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
              <label>
                CREW NAME <span>OPTIONAL · 24 MAX</span>
                <input value={crewName} maxLength={24} onChange={(e) => setCrewName(e.target.value)} placeholder="Name your crew" />
              </label>
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
