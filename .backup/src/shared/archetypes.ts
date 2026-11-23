import type { ArchetypeId, AxisResult } from './types';

export interface ArchetypeDef {
  id: ArchetypeId;
  name: string;
  oneLineTrait: string;
  poles: ['PLAN' | 'CHAOS', 'SOLO' | 'CREW', 'LOGIC' | 'INSTINCT'];
  accentColor: string;
  palette: Record<string, string>;
  // 16x16 palette-indexed pixel grid, '.' is transparent
  grid: string[];
}

export const ARCHETYPES: Record<ArchetypeId, ArchetypeDef> = {
  the_architect: {
    id: 'the_architect',
    name: 'THE ARCHITECT',
    oneLineTrait: 'Blueprints every exit before entering the room',
    poles: ['PLAN', 'SOLO', 'LOGIC'],
    accentColor: '#38BDF8',
    palette: {
      a: '#0F172A', // dark outline
      b: '#38BDF8', // blueprint cyan
      c: '#E0F2FE', // bright highlight
      d: '#1E3A8A', // navy visor
      e: '#F8FAFC', // chalk white
      f: '#FBBF24', // compass gold
    },
    grid: [
      '....aaaaaaaa....',
      '...abbbbbbbba...',
      '..abccccccccba..',
      '..abbbbbbbbbba..',
      '..abddddddddba..',
      '..abdeeddeedba..',
      '..abddddddddba..',
      '...abbbbbbbba...',
      '....aaffffaa....',
      '..aabbbbbbbbaa..',
      '.abbccbbbbccbba.',
      '.abbbbbffbbbbba.',
      '.abbbbfccfbBBba.'.toLowerCase(),
      '..aabbbffbbbaa..',
      '...aaabbbbaaa...',
      '...aaa....aaa...',
    ],
  },
  the_lone_oracle: {
    id: 'the_lone_oracle',
    name: 'THE LONE ORACLE',
    oneLineTrait: 'Quietly predicts the plot twist three scenes early',
    poles: ['PLAN', 'SOLO', 'INSTINCT'],
    accentColor: '#C084FC',
    palette: {
      a: '#120824', // dark outline
      b: '#6D28D9', // deep cloak
      c: '#C084FC', // mystic violet
      d: '#FDE047', // third-eye gold
      e: '#F8FAFC', // starlight
      f: '#312E81', // shadow hood
    },
    grid: [
      '.....aaaaaa.....',
      '...aabbbbbbaa...',
      '..abbccccccbba..',
      '.abbcffffffcbba.',
      '.abbfeeeeeeffba.',
      '.abbffddddffbba.',
      '.abbfefddfefbba.',
      '.abbffffffffbba.',
      '..abbcbbbbcbba..',
      '..aabbbbbbbbaa..',
      '.abbbccddccbbba.',
      '.abbccbbbbccbba.',
      '.abbbccccccbbba.',
      '..aabbbbbbbbaa..',
      '...aabbbbbbba...',
      '....aaa..aaa....',
    ],
  },
  the_dispatcher: {
    id: 'the_dispatcher',
    name: 'THE DISPATCHER',
    oneLineTrait: 'Turns group chaos into an actual itinerary',
    poles: ['PLAN', 'CREW', 'LOGIC'],
    accentColor: '#34D399',
    palette: {
      a: '#062019', // dark outline
      b: '#10B981', // signal green
      c: '#6EE7B7', // mint highlight
      d: '#F8FAFC', // headset white
      e: '#FBBF24', // radio amber
      f: '#1E293B', // slate visor
    },
    grid: [
      '....aaaaaaaa....',
      '...adddddddda...',
      '..adbbbbbbbbda..',
      '.aedbffffffbdea.',
      '.aedbfceecfbdea.',
      '.aedbffffffbdea.',
      '.ae.abbbbbba.ea.',
      '....aaabbbba....',
      '..aabbbbbbbbaa..',
      '.abbccccccccbba.',
      '.abbeebbbbeebba.',
      '.abbbbbddbbbbba.',
      '.abbbddddddbbba.',
      '..aabbbbbbbbaa..',
      '...aaabbbbaaa...',
      '...aaa....aaa...',
    ],
  },
  the_anchor: {
    id: 'the_anchor',
    name: 'THE ANCHOR',
    oneLineTrait: 'Reads the room and keeps the squad intact',
    poles: ['PLAN', 'CREW', 'INSTINCT'],
    accentColor: '#60A5FA',
    palette: {
      a: '#0C192C', // dark outline
      b: '#2563EB', // cobalt shield
      c: '#93C5FD', // soft sky
      d: '#F8FAFC', // warm pearl
      e: '#FBBF24', // beacon gold
      f: '#1E3A8A', // deep sea
    },
    grid: [
      '.....aaaaaa.....',
      '....aeeeeeeaa...',
      '...aeeeddeeea...',
      '...aeeeeeeeea...',
      '....aaaffaaa....',
      '..aabbbbbbbbaa..',
      '.abbccccccccbba.',
      '.abbbddddddbbba.',
      '.abbbddeeddbbba.',
      '.abbbddddddbbba.',
      '.abbccbbbbccbba.',
      '..abbbbbbbbbba..',
      '...abbbffbbba...',
      '...aabbbbbbaa...',
      '....aaabbaaa....',
      '.....aaaaaa.....',
    ],
  },
  the_rogue_tactician: {
    id: 'the_rogue_tactician',
    name: 'THE ROGUE TACTICIAN',
    oneLineTrait: 'Improvises absurd plans that somehow work',
    poles: ['CHAOS', 'SOLO', 'LOGIC'],
    accentColor: '#FBBF24',
    palette: {
      a: '#1C1305', // dark outline
      b: '#D97706', // tactical amber
      c: '#FDE047', // flash gold
      d: '#0F172A', // stealth mask
      e: '#F43F5E', // laser eye
      f: '#F8FAFC', // gleam
    },
    grid: [
      '...aa......aa...',
      '..abba....abba..',
      '..abcaaaaaacba..',
      '..abbbbbbbbbba..',
      '.abddddddddddba.',
      '.abddfeddefddba.',
      '.abddddddddddba.',
      '..abccccccccba..',
      '...aabbbbbbaa...',
      '.aaabbbbbbbbaaa.',
      'abbccbbbbbbccbba',
      'abbbbbccccbbbbba',
      '.aabbbccccbbbaa.',
      '..aabbbbbbbbaa..',
      '...aaa....aaa...',
      '..aaaa....aaaa..',
    ],
  },
  the_free_agent: {
    id: 'the_free_agent',
    name: 'THE FREE AGENT',
    oneLineTrait: 'Follows pure curiosity off the map',
    poles: ['CHAOS', 'SOLO', 'INSTINCT'],
    accentColor: '#2DD4BF',
    palette: {
      a: '#071D1E', // dark outline
      b: '#14B8A6', // nomad teal
      c: '#99F6E4', // wind highlight
      d: '#FB7185', // scarf coral
      e: '#F8FAFC', // goggles white
      f: '#FBBF24', // compass sun
    },
    grid: [
      '....aaaaaaaa....',
      '...abccccccba...',
      '..abbffffffbba..',
      '..abbeebbeebba..',
      '..abbeebbeebba..',
      '..abbbbbbbbbba..',
      '...aaddddddaa...',
      '..adddddddddaa..',
      '.adddccccccbbba.',
      '.addabbbbbbbbba.',
      '..aaabbbffbbbba.',
      '...abbbffffbbba.',
      '...abbbbbbbbbba.',
      '...aaabbbbaaa...',
      '...aaa....aaa...',
      '..aaa......aaa..',
    ],
  },
  the_plot_twister: {
    id: 'the_plot_twister',
    name: 'THE PLOT TWISTER',
    oneLineTrait: 'Engineers unforgettable group detours on purpose',
    poles: ['CHAOS', 'CREW', 'LOGIC'],
    accentColor: '#E879F9',
    palette: {
      a: '#1B0726', // dark outline
      b: '#C026D3', // neon magenta
      c: '#F5D0FE', // lilac highlight
      d: '#38BDF8', // electric cyan
      e: '#FDE047', // trickster grin
      f: '#1E1B4B', // dark mask
    },
    grid: [
      '..aa........aa..',
      '.adda......adda.',
      '.addaaaaaaaaada.',
      '..abccccccccba..',
      '..abffffffffba..',
      '..abfdffffdfba..',
      '..abffeffeffba..',
      '..abffeeeefbba..',
      '...abbbbbbbba...',
      '..aabddbbddbaa..',
      '.abbddddddddbba.',
      '.abbbbccccbbbba.',
      '.abbccbbbbccbba.',
      '..aabbbbbbbbaa..',
      '...aaa....aaa...',
      '..aaaa....aaaa..',
    ],
  },
  the_spark: {
    id: 'the_spark',
    name: 'THE SPARK',
    oneLineTrait: 'First to say "trust me" before an iconic bad decision',
    poles: ['CHAOS', 'CREW', 'INSTINCT'],
    accentColor: '#F43F5E',
    palette: {
      a: '#260611', // dark outline
      b: '#F43F5E', // blaze rose
      c: '#FB923C', // orange flare
      d: '#FDE047', // core bolt
      e: '#FFFBEB', // white hot
      f: '#1E1B4B', // shades
    },
    grid: [
      '.......aa.......',
      '......adda......',
      '....aaddddaa....',
      '...abccddccba...',
      '..abbbddddbbba..',
      '.abbffffffffbba.',
      '.abbfeeffeeffba.',
      '.abbffffffffbba.',
      '..abbbccccbbba..',
      '...aabddddbaa...',
      '..abbbdeedbbba..',
      '.abbccdeedccbba.',
      '.abbbbddddbbbba.',
      '..aabbbbbbbbaa..',
      '...aaa....aaa...',
      '...aa......aa...',
    ],
  },
};

export const ARCHETYPE_LIST: ArchetypeDef[] = Object.values(ARCHETYPES);

export function resolveArchetypeId(
  pPole: 'PLAN' | 'CHAOS',
  sPole: 'SOLO' | 'CREW',
  lPole: 'LOGIC' | 'INSTINCT'
): ArchetypeId {
  if (pPole === 'PLAN' && sPole === 'SOLO' && lPole === 'LOGIC') return 'the_architect';
  if (pPole === 'PLAN' && sPole === 'SOLO' && lPole === 'INSTINCT') return 'the_lone_oracle';
  if (pPole === 'PLAN' && sPole === 'CREW' && lPole === 'LOGIC') return 'the_dispatcher';
  if (pPole === 'PLAN' && sPole === 'CREW' && lPole === 'INSTINCT') return 'the_anchor';
  if (pPole === 'CHAOS' && sPole === 'SOLO' && lPole === 'LOGIC') return 'the_rogue_tactician';
  if (pPole === 'CHAOS' && sPole === 'SOLO' && lPole === 'INSTINCT') return 'the_free_agent';
  if (pPole === 'CHAOS' && sPole === 'CREW' && lPole === 'LOGIC') return 'the_plot_twister';
  return 'the_spark';
}

/**
 * Computes 3-axis totals, slider positions (0..100), and archetype with deterministic tie-break:
 * - raw < 0 -> left pole (PLAN / SOLO / LOGIC)
 * - raw > 0 -> right pole (CHAOS / CREW / INSTINCT)
 * - raw === 0 -> sign of Question 7 weight on that axis; if also 0 -> right pole.
 */
export function computePersonality(chosenAxes: [number, number, number][]): AxisResult {
  let r0 = 0;
  let r1 = 0;
  let r2 = 0;
  for (const [a0, a1, a2] of chosenAxes) {
    r0 += a0;
    r1 += a1;
    r2 += a2;
  }

  const q7 = chosenAxes[chosenAxes.length - 1] ?? [0, 0, 0];

  const pickPole = <L extends string, R extends string>(
    raw: number,
    q7Val: number,
    left: L,
    right: R
  ): L | R => {
    if (raw < 0) return left;
    if (raw > 0) return right;
    if (q7Val < 0) return left;
    return right;
  };

  const pPole = pickPole(r0, q7[0], 'PLAN', 'CHAOS');
  const sPole = pickPole(r1, q7[1], 'SOLO', 'CREW');
  const lPole = pickPole(r2, q7[2], 'LOGIC', 'INSTINCT');

  const toSlider = (raw: number) => Math.max(0, Math.min(100, Math.round(((raw + 14) / 28) * 100)));

  return {
    raw: [r0, r1, r2],
    sliders: [toSlider(r0), toSlider(r1), toSlider(r2)],
    poles: [pPole, sPole, lPole],
    archetypeId: resolveArchetypeId(pPole, sPole, lPole),
  };
}
