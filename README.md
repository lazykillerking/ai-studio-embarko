# BRAINPRINT: LEONIDA VIBE CHECK 🌴🕹️

> **Same questions. Different minds.**  
> An unofficial GTA VI / Leonida-inspired personality & social sync arcade game built for mobile and desktop screens. Built with the help of Google AI Studio for the **#DeployWithEmbarko Student Challenge**.

🎮 **Live App:** [https://brainprint-arcade.embarko.app](https://brainprint-arcade.embarko.app)  
🚀 **Platform:** Embarko (Permanent claimed app: `brainprint-arcade`)  
📦 **Tech Stack:** React 19 + Tailwind v4 + Express 5 + SQLite (WAL) + Web Audio API  

---

## 📖 Executive Summary & Overview

**BRAINPRINT** is not a trivia quiz. There are no "right" answers, no factual trivia, and no encyclopedic memory tests. Instead, it is an interactive psychometric arcade experience engineered to reveal how players genuinely think, react, prioritize, and clash under pressure.

Whether playing alone in the **Daily Solo Vibe Check** or in a room of friends in **Crew Mode**, every question forces a choice between four distinct, punchy quadrants of human behavior. Every option secretly maps to a calibrated 3-dimensional vector, placing players into one of 8 distinct archetypes, calculating contrarian street rep points, and generating razor-sharp personality diagnoses, roasts, and squad chemistry matrices.

---

## ✨ Everything Good About BRAINPRINT (Key Highlights)

- 🕹️ **Zero-Friction, Instant Play:** No logins, no passwords, no app store downloads, and zero PII collected. Anonymous UUID device authentication runs silently via cookies and local storage.
- 👥 **Viral Squad Social Sync (Crew Mode):** Drop a 6-character room code or one-tap `/crew/CODE` link into a group chat. Friends join instantly, answer 7 blind questions, and unlock an extensive, beautifully roasted sync dossier.
- 🔥 **Contrarian Scoring Engine:** Rewards original, unconventional minds. In Solo mode, the rarer your answer across the global population, the more street rep points you score (10–50 pts/question).
- 🧠 **Mathematically Balanced 3D Psychometrics:** Every question is calibrated across 3 orthogonal axes (Plan vs Chaos, Solo vs Crew, Logic vs Instinct). Verified by 20,000-iteration Monte Carlo simulations so every archetype is legitimately reachable.
- 🎨 **1080×1920 High-Res Share Cards:** Built-in client-side HTML5 Canvas generator produces story-format dossiers with custom pixel avatars, glowing cyber frames, roasts, and stats for 1-tap sharing to Instagram Stories, WhatsApp, and X/Twitter.
- 🎵 **100% Pure Web Audio Synthesizer:** Zero audio asset downloads. Procedural 16-bit synthwave arpeggios, pulsing basslines, and retro SFX synthesized in real-time with discrete Music & SFX toggles.
- ⚡ **Ultra-Lightweight & Production Resilient:** Express 5 single-process server bundled into a ~64KB ESM artifact with SQLite WAL mode, sub-65MB runtime memory footprint (well under Embarko's 256MB limit), and sub-50ms query times.
- 🌐 **Dynamic Social Open Graph (OG) Previews:** Server-side meta tag injection dynamically generates customized preview titles, descriptions, and custom-rendered PNG preview images for social scrapers.

---

## 🕹️ Deep-Dive: Game Modes

### 1. Daily Solo Mode (The Vibe Check)
- **7 Deterministic Daily Questions:** Refreshed every 24 hours at midnight **Indian Standard Time (IST / UTC+5:30)** using a deterministic Mulberry32 PRNG seed with 3-day recency exclusion.
- **Live IST Reset Countdown:** Persistent HUD badge tracks exact hours, minutes, and seconds remaining until the next global question reset.
- **30-Second Shot Clock:** Keeps gameplay fast and instinctual. Taking longer than 15 seconds flags the choice with an *Overthinker* marker.
- **Contrarian Scoring Engine (10–50 pts):**
  $$\text{Score} = \text{round}\left(10 + 40 \times (1 - \text{SmoothedShare})\right)$$
  Using Bayesian Laplace smoothing to avoid cold-start distortions:
  $$\text{SmoothedShare} = \frac{\text{optionVotes} + 1}{\text{totalVotes} + 4}$$
- **Instant Crowd Reveal:** Locking in an answer immediately reveals global vote percentages, highlights your selection, and offers tap-to-inspect breakdowns of why people picked each quadrant.
- **Signal Dossier & Street Rep Verdict:** At the end of 7 questions, players receive their primary Archetype, Street Rep score tier, 1–5 flame heat rating, personalized compliment, razor-sharp roast, 3D axis sliders, and question-by-question review.
- **Replay & Themed Packs:** Players can replay a fresh 7-question set anytime or delve into specific genre packs without waiting for the daily reset.

---

### 2. Crew Mode (Squad Social Sync & Roast System)
In Crew Mode, the game objective flips: **matching your squad's instincts earns maximum synchronization!**

- **Instant Room Creation:** Room codes use an unambiguous 32-character alphabet (strictly omitting confusing characters like `0`, `O`, `1`, `I`).
- **Mixed or Themed Modes:** Host can launch a run using questions from a specific pack or a balanced mixed deck pulling across the entire question library.
- **Real-Time Synchronous / Asynchronous Flow:** Friends can take the quiz simultaneously or join asynchronously throughout the day.
- **Complete Crew Verdict & Personality Roast Dossier (`CrewVerdictView`):**
  Once the squad finishes, BRAINPRINT generates a comprehensive 4-tab dossier:

#### 1. Hero Verdict & Sync Tiers
Displays the squad's overall sync percentage (0–100%) mapped to 1 of 7 customized Sync Tiers:
| Sync % | Tier Title | Tone & Vibe | Squad Diagnosis |
| :---: | :--- | :--- | :--- |
| **90–100%** | **Literally Same Person** | Telepathic / Uncanny | A collective hivemind. Terrifyingly identical instincts. |
| **80–89%** | **Mind Meld** | Deep Connection | High-level frequency match. Finishes each other’s worst ideas. |
| **65–79%** | **One Braincell** | Shared Chaos | Functional squad synergy with just enough chaos to stay interesting. |
| **50–64%** | **Unlikely Alliance** | Volatile Compromise | Different worldviews holding together through pure stubborn loyalty. |
| **35–49%** | **Somehow a Crew** | Controlled Catastrophe | Disagrees on nearly everything, yet somehow orders food together. |
| **20–34%** | **Different Planets** | Polar Opposites | Completely incompatible instincts. Every decision is a debate. |
| **0–19%** | **Hostile Takeover** | Pure Anarchy | Total mutual confusion. An FBI negotiation would be smoother. |

#### 2. The 4 Dossier Exploration Tabs
1. **DYNAMICS Tab:**
   - **Dominant Squad Archetype:** Identifies the overarching personality controlling the room.
   - **3D Axis Dynamic Sliders:** Visualizes the room's group average and consensus score across Plan vs Chaos, Solo vs Crew, and Logic vs Instinct.
   - **Outlier Highlights:** Pinpoints which members pull the group toward chaos, logic, or isolation.
2. **MEMBERS Tab:**
   - Individual member dossier cards displaying player nicknames, Archetype titles, and custom pixel avatars.
   - **Individual Roles:** Contextual labels assigned based on group behavior (*The Human Mirror*, *Crew Glue*, *The Wildcard*, *The Voice of Reason*, *The Diplomat*, *The Chaos Engine*, *The Outsider*).
   - Bespoke roast and compliment tailored to their divergence from the room.
   - Direct links to their strongest and weakest sync partners in the room.
3. **CHEMISTRY Tab ($N \times N$ Matrix):**
   - Interactive pairwise alignment matrix calculating exact percentage agreement between every pair of players.
   - Categorized into relationship dynamics (*Shared Braincell*, *Same Wavelength*, *Decent Chemistry*, *Acquaintances at Best*, *Natural Enemies*, *Unresolved Tension*) with commentary lines.
4. **AWARDS Tab (Squad Superlatives):**
   - 👯 **Mind Twins:** Pair with highest identical choices.
   - 🤝 **Common Ground:** The question where the whole room agreed unanimously.
   - ⚔️ **Civil War:** The question that shattered the group into hostile factions.
   - 🐺 **Lone Signal:** The player who consistently diverged from the majority.
   - 🎯 **Perfect Sync:** Awarded when the entire squad locks in the exact same answer.
   - Plus individual superlatives: *The Human Mirror*, *Walking Red Flag*, *The Voice of Reason*, *The Main Character*, *The Diplomat*, *The Wildcard*, *The Clone*, *The Contrarian*, *The Therapist*, *The Instigator*, *The Lone Wolf*, and *The Glue*.

---

## 🧠 The Personality Engine & The 8 Archetypes

Every answer in the game maps to a calibrated 3-dimensional vector in $[-2, +2]$:

```
                  [PLAN (-)]  ◄─── Axis 0 ───►  [CHAOS (+)]
                  [SOLO (-)]  ◄─── Axis 1 ───►  [CREW (+)]
                 [LOGIC (-)]  ◄─── Axis 2 ───►  [INSTINCT (+)]
```

### The 8 Player Archetypes
The vector sums resolve deterministically into one of eight distinct personalities:

| Archetype | Vector Coordinates | Motto & Cognitive Signature |
| :--- | :---: | :--- |
| 🏛️ **THE ARCHITECT** | `[Plan, Solo, Logic]` | *“Blueprints every exit before entering the room.”* Calculating, strategic, self-sufficient. |
| 🔮 **THE LONE ORACLE** | `[Plan, Solo, Instinct]` | *“Quietly predicts the plot twist three scenes early.”* Intuitive, perceptive, enigmatic loner. |
| 📋 **THE DISPATCHER** | `[Plan, Crew, Logic]` | *“Turns group chaos into an actual itinerary.”* The operational backbone and logistics commander. |
| ⚓ **THE ANCHOR** | `[Plan, Crew, Instinct]` | *“Reads the room and keeps the squad intact.”* Empathetic rock, emotional stabilizer, reliable ally. |
| 🎯 **THE ROGUE TACTICIAN**| `[Chaos, Solo, Logic]` | *“Improvises absurd plans that somehow work.”* High-risk optimizer, unpredictable problem-solver. |
| 🌪️ **THE FREE AGENT** | `[Chaos, Solo, Instinct]` | *“Follows pure curiosity off the map.”* Free spirit, impulsive explorer, allergic to itineraries. |
| 🎭 **THE PLOT TWISTER** | `[Chaos, Crew, Logic]` | *“Engineers unforgettable group detours on purpose.”* Social chess player, agent of entertaining drama. |
| ⚡ **THE SPARK** | `[Chaos, Crew, Instinct]` | *“First to say 'trust me' before an iconic bad decision.”* Catalyst, hype machine, adrenaline core. |

---

## 📚 Question Bank & Content Architecture

The question library contains **185 unique, validated questions** organized into 6 distinct packs, plus **THE MIX**:

| Pack ID | Pack Name | Questions | Theme & Focus |
| :--- | :--- | :---: | :--- |
| `the_mix` | **THE MIX** | *Dynamic* | Balanced cross-pack curation spanning all themes. |
| `everyday_life` | **Everyday Life** | **15** | Daily routines, social friction, food disputes, driving etiquette, grocery habits. |
| `neon_coast` | **Neon Coast** | **15** | GTA / Vice City aesthetics, fast cars, luxury bets, nightlife ambition. |
| `campus_chaos` | **Campus Chaos** | **15** | 3 AM cramming, group project disasters, dorm politics, college survival. |
| `social_circuit` | **Social Circuit** | **40** | Party dynamics, group chat etiquette, dating red flags, wedding drama. |
| `pop_culture` | **Pop Culture** | **50** | Gaming (GTA, Minecraft, Souls), anime, cinema, streaming habits, internet lore. |
| `moral_mayhem` | **Moral Mayhem** | **50** | Uncomfortable truths, loyalty vs ambition, secret-keeping, ethical trade-offs. |
| **TOTAL** | | **185** | **Zero duplicates, zero banned terms, 100% balance-tested.** |

### Microcopy & Quality Standards
Every single question adheres to strict validation rules verified via automated test scripts:
- **Prompt:** $\le 90$ characters (immediate readability on mobile displays).
- **Options:** Exactly 4 distinct quadrants (no overlapping choices).
- **Option Text:** $\le 40$ characters (clean 2-line rendering on 320px screens).
- **Monte Carlo Verification:** 20,000 random runs per pack ensuring all 8 archetypes exceed a minimum 1.5% representation threshold.

---

## 🎵 In-House 16-Bit Web Audio Synthesizer

Rather than burdening mobile users with heavy `.mp3` or `.ogg` asset downloads, BRAINPRINT incorporates an original procedural audio engine built on the **Web Audio API** (`src/client/ui/audio.ts`):
- **Arpeggiated BGM:** Procedural 16-step synthwave arpeggio and bassline running through an Am – F – C – G progression into a 2400Hz low-pass biquad filter.
- **Custom Procedural SFX:**
  - `playSelect()`: High-frequency square wave confirmation ping (540Hz $\to$ 960Hz).
  - `playAnswer()`: Warm triangle lock-in tone (520Hz $\to$ 880Hz).
  - `playReveal()`: 4-note ascending arpeggio (C5, E5, G5, C6).
  - `playTick()`: Crisp triangle countdown warning (420Hz).
  - `playFanfare()`: Multi-note triumph chord sequence celebrating completed runs.
- **Audio Controls:** Independent HUD toggles for `🎵 MUSIC` and `🔊 SFX` saved directly to `localStorage`.

---

## 🎨 Social Share Card Generator & Dynamic OG Previews

### 1. High-Resolution Story Share Cards (1080×1920)
Clicking **SHARE** or **SAVE CARD** renders an arcade-grade high-resolution image directly via client-side Canvas:
- Crisp 16×16 pixel avatars rendered with authentic scanline aesthetics.
- Glowing hero framing with tech brackets (`[ + ]`) and cybernetic badges.
- Formatted metrics: Archetype title, Street Rep score, Heat rating, personalized roast, compliment, and 3D axis sliders.
- Fully supports native mobile sharing via the **Web Share API** (with automatic PNG download fallback).

### 2. Zero-Dependency Server-Side OG Preview Engine
When a room link (`/crew/CODE`) is shared to WhatsApp, iMessage, Discord, or Twitter/X:
- Express dynamically intercepts the crawler request.
- Injects customized Open Graph meta tags into `index.html` (e.g. *"Join Squad X · Code K9W4XP · 4 joined"*).
- Delivers custom 1200×630 preview PNGs generated via a bespoke pure Node.js pixel-buffer generator (`scripts/generate-og-images.ts`), requiring zero external canvas dependencies.

---

## 🛠️ Tech Stack & Systems Architecture

```
┌────────────────────────────────────────────────────────┐
│                   CLIENT (React 19)                    │
│   Tailwind v4 • Space Grotesk & Press Start 2P Fonts   │
│   • 16-Bit Web Audio Engine • HTML5 Canvas Exporter    │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP / JSON REST API
┌───────────────────────────▼────────────────────────────┐
│              EXPRESS 5 + TYPESCRIPT SERVER             │
│   Single-process bundled with esbuild into 64KB mjs    │
│   • Sliding-window rate limiter (60 mutations/min)     │
│   • Anonymous UUID device auth (cookie + localStorage) │
│   • Zod runtime validation on all endpoints            │
│   • Deterministic Mulberry32 PRNG (IST midnight reset) │
│   • Server-side dynamic Open Graph (OG) meta injector  │
└───────────────────────────┬────────────────────────────┘
                            │ WAL Mode SQLite
┌───────────────────────────▼────────────────────────────┐
│                   SQLITE (better-sqlite3)              │
│   Stored at ${DATA_DIR || "./data"}/brainprint.db      │
│   • Idempotent migrations (_bp_migrations)            │
│   • Litestream compatible (_litestream_* safe)         │
│   • Sub-65MB memory footprint (< 256MB Embarko limit)  │
│   • Automatic upsert seeding on boot                   │
└────────────────────────────────────────────────────────┘
```

---

## 📋 Project Status & Verification

- [x] **Complete Database & Backend Infrastructure**
  - Express 5 single-process server bundled into `dist-server/index.mjs`.
  - SQLite with WAL mode, foreign keys, and idempotency migrations.
  - Tested memory-safe under Embarko’s 256MB cap (< 65MB runtime footprint).
- [x] **185-Question Calibrated Bank Across 6 Packs**
  - Fully validated across `everyday_life`, `neon_coast`, `campus_chaos`, `social_circuit`, `pop_culture`, and `moral_mayhem`.
  - Automated question validator (`scripts/validate-questions.ts`) checking character limits, duplicates, and Monte Carlo archetype balance.
- [x] **Solo Daily Flow & Contrarian Scoring**
  - Deterministic IST daily rotation with Mulberry32 PRNG and 3-day exclusion window.
  - Live IST countdown timer on HUD.
  - Bayesian Laplace-smoothed crowd share scoring: rarer answers yield higher street rep.
  - Instant crowd percentage reveal and tap-to-inspect card.
  - 7-question replay capability on themed packs and the mix.
- [x] **Crew Mode & Complete Verdict Roast System**
  - Unambiguous 6-character room codes and instant invite links (`/crew/CODE`).
  - 7 Crew Sync Tiers with bespoke neon styling and squad diagnoses.
  - 4-tab interactive dossier (Dynamics, Members, Chemistry, Awards).
  - $N \times N$ pairwise alignment matrix and 12 distinct squad superlatives.
- [x] **Client-Side High-Res Canvas Share Cards & OG Previews**
  - 1080×1920 social story card generation with pixel-art avatars and custom styling.
  - Web Share API integration.
  - Server-side dynamic crawler meta tag injection.
- [x] **Audio & Mobile UI Polish**
  - Pure Web Audio API 16-bit chiptune synthesizer with independent Music & SFX toggles.
  - Persistent home navigation button across all views.
  - Animated retro grid background with scanline overlays.
- [x] **Production Embarko Cloud Deployment**
  - Registered and live under permanent app name: `brainprint-arcade`.
  - Healthy, verified, and active at [https://brainprint-arcade.embarko.app](https://brainprint-arcade.embarko.app).

---

## 💻 Local Development & Usage

### Prerequisites
- Node.js $\ge 20$
- npm $\ge 10$

### Setup & Development
```bash
# Clone the repository
git clone https://github.com/your-username/brainprint-arcade.git
cd brainprint-arcade

# Install dependencies
npm install

# Run database migrations and seed packs
npm run seed

# Start development server (Vite middleware inside Express)
npm run dev
```

### Production Build & Local Launch
```bash
# Build Vite client and esbuild server bundle
npm run build

# Start production server (default: http://localhost:3000)
npm start
```

### Testing & Validation Scripts
```bash
# Run unit tests (Vitest) and question schema validation
npm test

# Run standalone question validator & Monte Carlo balance simulation
npm run validate

# Test score distribution on completed runs
npm run score-distribution

# Generate standalone static Open Graph preview images
npm run generate-og
```

---

## 🚢 Deploying to Embarko

The app is deployed to **Embarko** under the registered application `brainprint-arcade`.

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
   tar -czf app.tar.gz --exclude="app.tar.gz" --exclude="node_modules" --exclude=".git" --exclude="*.db*" --exclude="dist-server/*.map" .
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

## 📄 License & Attribution
Created for educational and demonstration purposes as part of the Embarko Student Challenge (#DeployWithEmbarko). Unofficial personality and social sync arcade game inspired by modern pop culture and retro gaming aesthetics. All rights reserved by respective owners.
