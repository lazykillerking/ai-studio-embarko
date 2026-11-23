# BRAINPRINT: LEONIDA VIBE CHECK 🌴🕹️

> **Same questions. Different minds.**  
> An unofficial GTA VI / Leonida-inspired personality & social sync arcade game built for mobile screens. Built with the help of Google AI Studio for the **#DeployWithEmbarko Student Challenge**.

🎮 **Live App:** [https://brainprint-arcade.embarko.app](https://brainprint-arcade.embarko.app)  
🚀 **Platform:** Embarko (Permanent claimed app: `brainprint-arcade`)  
📦 **Tech Stack:** React 19 + Tailwind v4 + Express 5 + SQLite (WAL) + Web Audio API  

---

## 📖 Overview

**BRAINPRINT** is not a trivia quiz. It’s an interactive personality and group synchronization experience designed to make players reveal their instincts, ego, social behavior, and quirks without realizing it.

Whether playing alone in the **Daily Solo Vibe Check** or in a room of friends in **Crew Mode**, every question forces a choice between four distinct, punchy quadrants of human behavior.

---

## 🕹️ Game Modes

### 1. Daily Solo Mode
- **7 Questions Daily:** Deterministic daily selection refreshed every 24 hours (UTC midnight).
- **30-Second Shot Clock:** Keeps players moving fast. Lingering triggers an *Overthinker* flag.
- **Contrarian Scoring (10–50 pts):** Unlike trivia where there's a "right" answer, BRAINPRINT rewards uncommon instincts. The rarer your choice across the global population, the more street rep points you score!
- **Instant Crowd Reveal:** After answering each question, players immediately see the global percentage distribution, their highlighted choice, and tap-to-inspect option breakdowns.
- **Post-Quiz Theme Packs:** Completing the daily mix unlocks specialized packs (*Neon Coast*, *Campus Chaos*).

### 2. Crew Mode (Squad Social Sync)
- **Zero Friction Rooms:** Generate a 6-character room code (or instant `/crew/CODE` invite link). No accounts, sign-ups, or app downloads needed.
- **Group Consensus Scoring:** In Crew mode, the objective flips: matching your squad mates' instincts earns higher synchronization scores.
- **Arcade End Screen & Chemistry Matrix:**
  - **Hero Sync Badge:** Overall squad alignment rating (e.g., *78% Synchronized*).
  - **Arcade Leaderboard:** Real-time squad rank with points and archetype titles.
  - **Squad Awards:**
    - 👯 **Mind Twins:** Pair with the highest identical choices.
    - 🤝 **Common Ground:** The question where the whole room agreed most.
    - ⚔️ **Civil War:** The question that completely split the squad.
    - 🐺 **Lone Signal:** The player who consistently took the contrarian route.
    - 🎯 **Perfect Sync:** Unlocked when the squad unanimously agrees on an answer.
  - **Pairwise Chemistry Matrix:** An interactive $N \times N$ matrix displaying exact percentage alignment between every pair of players.

---

## 🧠 The Personality Engine & 8 Archetypes

Every answer maps to a 3-dimensional personality vector in the range $[-2, +2]$:

| Axis | Pole (-2 / -1) | Pole (+1 / +2) |
| :---: | :--- | :--- |
| **0** | **PLAN** (Calculated, careful, mapped out) | **CHAOS** (Wildcard, impulsive, spontaneous) |
| **1** | **SOLO** (Independent, lone operator, private) | **CREW** (Squad-first, collaborative, social) |
| **2** | **LOGIC** (Analytical, evidence, strategic) | **INSTINCT** (Gut feeling, vibes, emotional) |

### The 8 Player Archetypes
The vector sums resolve deterministically into one of eight distinct personalities:

1. 🏛️ **THE ARCHITECT** `[Plan + Solo + Logic]`  
   *“Blueprints every exit before entering the room.”*
2. 🔮 **THE LONE ORACLE** `[Plan + Solo + Instinct]`  
   *“Quietly predicts the plot twist three scenes early.”*
3. 📋 **THE DISPATCHER** `[Plan + Crew + Logic]`  
   *“Turns group chaos into an actual itinerary.”*
4. ⚓ **THE ANCHOR** `[Plan + Crew + Instinct]`  
   *“Reads the room and keeps the squad intact.”*
5. 🎯 **THE ROGUE TACTICIAN** `[Chaos + Solo + Logic]`  
   *“Improvises absurd plans that somehow work.”*
6. 🌪️ **THE FREE AGENT** `[Chaos + Solo + Instinct]`  
   *“Follows pure curiosity off the map.”*
7. 🎭 **THE PLOT TWISTER** `[Chaos + Crew + Logic]`  
   *“Engineers unforgettable group detours on purpose.”*
8. ⚡ **THE SPARK** `[Chaos + Crew + Instinct]`  
   *“First to say 'trust me' before an iconic bad decision.”*

### Street Rep Verdicts
Players receive one of **24 Street Rep Verdicts** (8 archetypes $\times$ 3 score bands: *Low*, *Mid*, *High*) complete with dynamic 1–5 flame heat ratings and pack-specific roasts.

---

## 🎵 16-Bit Chiptune Audio Synthesizer

The app features an in-house Web Audio API synthesizer (`src/client/ui/audio.ts`) with **zero audio asset downloads**:
- **Arpeggiated BGM:** Procedural synthwave/chiptune bassline and melodies running through a 2400Hz low-pass filter.
- **Retro Sound FX:** Procedural frequencies for option select, countdown tick, answer lock, reveal whoosh, and victory chords.
- **Independent Audio Controls:** Top header includes dedicated `🎵 MUSIC` and `🔊 SFX` toggle buttons.

---

## 📚 Question Bank & Content Architecture

Every question follows strict mobile-first constraints:
- **Prompt:** $\le 90$ characters (fast, punchy, immediate readability).
- **Options:** Exactly 4 distinct quadrants.
- **Option Text:** $\le 40$ characters (clean 2-line fit on 320px screens).
- **Axis Balance:** Calibrated via Monte Carlo simulation so that all 8 archetypes are genuinely reachable ($\ge 1.5\%$ occurrence threshold in 20,000 trials).

### Current Library: 85 Validated Questions
1. **THE MIX (`the_mix.json`) — 55 Questions:**
   - Everyday dilemmas, awkward social moments, friendship dynamics, ego, and nightlife.
   - Includes **Batch 02 (Social & Relationships)**: Questions `lv_076` through `lv_115`.
2. **NEON COAST (`neon_coast.json`) — 15 Questions:**
   - Sunset-synthwave coastal vibes, high-roller bets, fast cars, and nightlife ambition.
3. **CAMPUS CHAOS (`campus_chaos.json`) — 15 Questions:**
   - Universal student life, group project disasters, 3 AM exam cramming, and campus survival.

---

## 🛠️ Tech Stack & Systems Architecture

```
┌────────────────────────────────────────────────────────┐
│                   CLIENT (React 19)                    │
│   Tailwind v4 • Lucide Icons • Web Audio Synthesizer   │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / JSON API
┌───────────────────────────▼────────────────────────────┐
│              EXPRESS 5 + TYPESCRIPT SERVER             │
│   Single-process bundled with esbuild into 64KB mjs    │
│   • Proxy-aware rate limiter (60 mutations/min)        │
│   • Anonymous UUID device auth (cookie + localStorage) │
│   • Zod runtime validation on all endpoints            │
│   • Deterministic PRNG Daily Selector (Mulberry32)     │
└───────────────────────────┬────────────────────────────┘
                            │ WAL Mode SQLite
┌───────────────────────────▼────────────────────────────┐
│                   SQLITE (better-sqlite3)              │
│   Stored at ${DATA_DIR || "./data"}/brainprint.db      │
│   • Idempotent migrations                              │
│   • Litestream compatible (_litestream_* safe)         │
│   • Automatic upsert seeding on boot                   │
└────────────────────────────────────────────────────────┘
```

---

## 📋 What Has Been Done

- [x] **Phase 0: Database & Backend Foundations**
  - Express 5 single-process server bundled into `dist-server/server.js`.
  - SQLite with WAL mode, foreign keys, and idempotency migrations in `migrations/001_init.sql`.
  - Memory-safe under Embarko’s 256MB cap (< 65MB runtime footprint).
- [x] **Phase 1: Question Bank Engine & Archetype Math**
  - Vector scoring engine across 3 axes.
  - Automated question validator (`scripts/validate-questions.ts`) checking character limits, Jaccard duplicate overlap, banned words, and Monte Carlo archetype balance.
  - 85 original, PG-rated, personality-revealing questions published.
- [x] **Phase 2: Solo Daily Flow & Contrarian Scoring**
  - Deterministic UTC daily rotation with Mulberry32 PRNG and 3-day exclusion window.
  - Laplacians/smoothed crowd share scoring: rarer answers yield higher scores.
  - Overthinker penalty tracking for answers exceeding 15 seconds.
  - Full Question Reveal card showing player selection and crowd percentage breakdown.
- [x] **Phase 3: Crew Mode & Real-time Squad Sync**
  - Anonymous 6-letter room codes and link sharing.
  - Pairwise chemistry matrix computation.
  - Squad awards (Mind Twins, Common Ground, Civil War, Lone Signal, Perfect Sync).
  - Beautified arcade-style crew results screen.
- [x] **Phase 4: Audio & Mobile UX Polish**
  - Pure Web Audio API 16-bit chiptune synthesizer with separate Music and SFX toggles.
  - Global scrollbar suppression for seamless arcade mobile feel.
  - Solo timer expanded to 30 seconds for comfortable reading.
  - Mixed daily quiz starting directly without premature theme roadblocks.
- [x] **Phase 5: Embarko Cloud Deployment**
  - Configured `embarko.json` and permanent app claim (`brainprint-arcade`).
  - Deploy script using secure deploy tokens via `~/.embarko/credentials`.
  - Live, verified, and healthy at `https://brainprint-arcade.embarko.app`.

---

## 🚀 What Is to Be Done (Roadmap)

- [ ] **Batch 03 — Pop Culture & Internet (50 Questions):**
  - Gaming (GTA, Minecraft, Roblox, Fortnite), anime, Marvel/DC, Bollywood/Hollywood, internet lore, memes, and viral trends.
  - Target IDs: `lv_116` to `lv_165`.
- [ ] **Batch 04 — Moral Dilemmas & Dark Choices (50 Questions):**
  - Betrayal for success, impossible trade-offs, uncomfortable truths, and social hypocrisy.
  - Target IDs: `lv_166` to `lv_215`.
- [ ] **Dynamic Social Share Cards (OG Images):**
  - Generate dynamic 1200x630 share banners rendering the player's avatar icon, archetype title, score, and heat flames for one-tap sharing to Instagram Stories, WhatsApp, and X/Twitter.
- [ ] **Global Daily Leaderboard:**
  - Opt-in nickname leaderboard showing top contrarian scores for the day.
- [ ] **Custom Squad Deck Builder:**
  - Let crew hosts pick 7 specific questions from the bank for custom party challenges.
- [ ] **PWA / Offline Support:**
  - Add Service Worker manifest for instant mobile "Add to Home Screen" experience.

---

## 💻 Local Development & Usage

### Prerequisites
- Node.js $\ge 20$
- npm $\ge 10$

### Setup
```bash
# Clone the repository
git clone https://github.com/your-username/brainprint-arcade.git
cd brainprint-arcade

# Install dependencies
npm install

# Run database migrations and seed packs
npm run seed

# Start Vite dev server for client work
npm run dev
```

### Full Production Build & Local Server
```bash
# Build server and client
npm run build

# Start single-process server (default: http://localhost:3000)
npm start
```

### Testing & Validation Scripts
```bash
# Run unit tests and question schema validation
npm test

# Run standalone question validator & Monte Carlo balance test
npm run validate:questions

# Test score distribution on completed runs
npm run score:distribution
```

---

## 🚢 Deploying to Embarko

The app is deployed to **Embarko** under the registered name `brainprint-arcade`.

### Deployment Steps:
1. Ensure your deploy token is saved in `~/.embarko/credentials`:
   ```bash
   chmod 600 ~/.embarko/credentials
   ```
2. Build client and server bundles:
   ```bash
   npm run build
   ```
3. Package source code:
   ```bash
   tar -czf app.tar.gz --exclude="app.tar.gz" --exclude="node_modules" --exclude=".git" --exclude="*.db*" --exclude="BRAINPRINT-upload.zip" .
   ```
4. Ship to Embarko API:
   ```bash
   $token = (Get-Content "$HOME\.embarko\credentials" -Raw).Trim()
   curl.exe -X POST "https://ship.embarko.ai/apps" \
     -H "Authorization: Bearer $token" \
     -H "X-App-Name: brainprint-arcade" \
     -H "X-Agent-Name: antigravity" \
     -F "source=@app.tar.gz"
   ```
5. Check deployment status:
   ```bash
   curl.exe "https://ship.embarko.ai/apps/brainprint-arcade/status" -H "Authorization: Bearer $token"
   ```

---

## 📄 License
Created for educational and demonstration purposes as part of the Embarko Student Challenge (#DeployWithEmbarko). Unofficial personality experience inspired by pop culture. All rights reserved by respective owners.
