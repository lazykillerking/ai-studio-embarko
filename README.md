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
- **Contrarian Scoring Engine:** Rewards original, unconventional minds. The rarer your selection across the global player base, the more points you score:

#### Points Awarded Per Question (Based on Crowd Rarity)

| Points | Rarity Tier | When Awarded | Words & Taglines Used |
| :---: | :--- | :--- | :--- |
| **5 pts** | **FAMILIAR** | Chosen by **> 40%** of players (the crowd favorite) | *"Right on the main frequency. Plenty of minds took this exact turn."*<br>*"Classic instinct. You and the crowd share a well-paved shortcut."*<br>*"High-traffic choice. Reliable signal with zero friction."* |
| **20 pts** | **UNUSUAL** | Chosen by **20% – 40%** of players | *"Nice detour. You stepped off the default path without going off-grid."*<br>*"Distinctive call. Most players walked right past that door."*<br>*"Sharp side-channel pick. Definitely not the autopilot answer."* |
| **45 pts** | **OUTLIER** | Chosen by **12% – 20%** of players | *"Rare frequency detected. Only a sliver of minds went this route."*<br>*"Bold zig while the lobby zagged. Certified contrarian radar."*<br>*"Deep-cut decision. Almost nobody saw that line coming."* |
| **80 pts** | **WILDCARD** | Chosen by **< 12%** of players (extreme contrarian) | *"Total anomaly! Barely anyone on Earth pressed that button."*<br>*"Off-the-charts signal. You practically own this wavelength solo."*<br>*"Pure wildcard energy. You broke away from the entire crowd."* |
| **20 pts** | **PROVISIONAL** | When fewer than 5 people have answered the question | *"Early beacon locked. You are calibrating this signal for the next wave."* |

#### Total Score Titles (Out of 560 Max Points over 7 Questions)

| Total Points Range | Score Title | Rarity Band |
| :---: | :--- | :---: |
| **0 – 95 pts** | **The Familiar Mind** | Low |
| **96 – 165 pts** | **The Steady Signal** | Low |
| **166 – 245 pts** | **The Unconventional** | Mid |
| **246 – 335 pts** | **The Maverick** | High |
| **336+ pts** | **The Wildcard Mind** | High |

- **Instant Crowd Reveal:** Locking in an answer immediately reveals global vote percentages, highlights your selection, and offers tap-to-inspect breakdowns of why people picked each quadrant.
- **Signal Dossier & Street Rep Verdict:** At the end of 7 questions, players receive their primary Archetype, Street Rep score tier, 1–5 flame heat rating, personalized compliment, razor-sharp roast, 3D axis sliders, and question-by-question review.
- **Replay & Themed Packs:** Players can replay a fresh 7-question set anytime or delve into specific genre packs without waiting for the daily reset.

---

### 2. Crew Mode (Squad Social Sync & Roast System)
In Crew Mode, the game objective flips: **matching your squad's instincts earns maximum synchronization!**

- **Crew Room / Lobby Window**:
  - **Live Top-Left Counter**: Displays connected players live (e.g., `👥 2/12`).
  - **Room Join Code & 1-Tap Copy**: Prominently features the 6-character room code with a dedicated `COPY CODE` button.
  - **Direct Invite Link & WhatsApp Sharing**: Features a `COPY INVITE LINK` button with clipboard feedback and direct WhatsApp sharing.
  - **Connected Players Roster**: Shows all connected members in real-time, tagging `YOU` and `HOST`, and showing live status (`Connected` or `Finished 7/7`).
  - **Independent Quiz Start**: Each player starts whenever they are ready. **The host's start does not force anyone else to start, and vice versa.** Players can also toggle between their active quiz and the crew room at any point.
- **Mixed or Themed Modes:** Host can launch a run using questions from a specific pack or a balanced mixed deck pulling across the entire question library.
- **Real-Time Synchronous / Asynchronous Flow:** Friends can take the quiz simultaneously or join asynchronously throughout the day.
- **Complete Crew Verdict & Personality Roast Dossier (`CrewVerdictView`):**
  Once at least 2 squad members finish, BRAINPRINT unlocks a comprehensive 4-tab dossier:

#### 1. Hero Verdict & Overall Crew Sync Tiers (0% – 100%)
Displays the squad's overall sync percentage (0–100%) mapped to 1 of 7 customized Sync Tiers:

| Sync % | Tier Title | Tone & Vibe | Words & Squad Diagnosis |
| :---: | :--- | :--- | :--- |
| **0% – 24%** | **The Hostile Takeover** | Savage / Chaotic | *"Pure anarchy. Nobody agreed on anything, and that was probably deliberate."*<br>*"You didn’t form a squad. You signed an open-ended mutual restraining order."*<br>*"This friendship is held together exclusively by screenshots and spite."* |
| **25% – 39%** | **Different Planets** | Heavy Teasing | *"You share a group chat, but your brains live in different solar systems."*<br>*"Conversations require three layers of translation; deciding where to eat takes 45 minutes and a poll."*<br>*"Your synchronisation is like intermittent Bluetooth in an underground car park."* |
| **40% – 54%** | **Somehow a Crew** | Playful Roasting | *"Chaotic equilibrium. Half the room plans, the other half improvise."*<br>*"Somehow functional, completely unhinged, and miraculously intact."*<br>*"A group project where one person wrote the bibliography and three gave the presentation."* |
| **55% – 69%** | **The Unlikely Alliance** | Balanced | *"Solid chemistry with just enough friction to stay interesting."*<br>*"You think alike on major instincts without becoming an echo chamber."*<br>*"Capable of pulling off a heist, provided everyone gets their choice of snack."* |
| **70% – 84%** | **One Braincell, Shared** | Complimentary | *"Dangerous telepathy. You reach the same conclusions before the question finishes."*<br>*"One braincell passed around like a shared hot potato."*<br>*"The kind of sync where eye contact across a crowded room counts as a full monologue."* |
| **85% – 94%** | **Mind Meld** | Strong Praise | *"Subconscious cloning. You are operating off a single central nervous system."*<br>*"Terrifyingly in sync. You are one matching jacket away from being a syndicate."*<br>*"A frequency lock so clean it makes twin telepathy look amateur."* |
| **95% – 100%** | **Literally the Same Person** | Legendary / Suspicious | *"Statistically suspicious. Are you sure you didn’t pass one phone around?"*<br>*"Two bodies, one identical operating system. Unsettling and magnificent."*<br>*"The rarest frequency in BRAINPRINT history. Uncanny, illegal, and iconic."* |

#### 2. Pairwise Chemistry Tiers (Between Any Two Players)

| Pair Sync % | Relationship Label | Commentary Line |
| :---: | :--- | :--- |
| **0% – 24%** | **Natural Enemies** | *"Please do not put these two in charge of anything requiring consensus."* |
| **25% – 39%** | **Unresolved Tension** | *"They agree just often enough to make the next disagreement sting even more."* |
| **40% – 54%** | **Acquaintances at Best** | *"They share about half a braincell, but neither has custody this weekend."* |
| **55% – 69%** | **Decent Chemistry** | *"They disagree on the seasoning, but they both like the meal."* |
| **70% – 84%** | **Same Wavelength** | *"Dangerous co-op energy. They validate each other’s worst impulses instantly."* |
| **85% – 94%** | **Shared Braincell** | *"Basically operating as a dual-core processor in two separate bodies."* |
| **95% – 100%** | **Suspicious Connection** | *"A cosmic glitch where two minds downloaded the exact same save file."* |

#### 3. Complete Crew Superlatives & Awards Bank

| Award | Icon | Tagline | Criteria / Description |
| :--- | :---: | :--- | :--- |
| **The Human Mirror** | 🪞 | Highest Pairwise Sync | Highest match percentage with another player in the session. |
| **Walking Red Flag** | 🚩 | Most Extreme Answers | Picked the most anomalous, high-risk, or rare options. |
| **The Voice of Reason** | 🧠 | Plan & Logic Focused | Highest combined score on Plan and Logic poles. |
| **The Main Character** | 👑 | Most Distinctive Profile | Furthest distance from the crew's average personality vector. |
| **The Diplomat** | 🕊️ | Closest to Crew Mean | Nearest to the center of the crew's collective average. |
| **The Wildcard** | 🃏 | Most Unpredictable Profile | Highest variance across choices and poles. |
| **The Clone** | 🧬 | Strongest Similarity | Nearly identical 3-axis slider profile to a teammate. |
| **The Contrarian** | ⚡ | Most Disagreements | Voted against the majority pick more than anyone else. |
| **The Therapist** | ☕ | Most Balanced | Centered closest to 0 across all 3 personality axes. |
| **The Instigator** | 🧨 | Extreme Tendencies | Leaned heavily into Chaos and Instinct on almost every turn. |
| **The Lone Wolf** | 🐺 | Strongest Solo Tendency | Leaned furthest toward the Solo pole in the squad. |
| **The Glue** | 🧲 | High Sync & Crew Focus | Combined strong crew orientation with high average pairwise agreement. |

#### 4. The 4 Dossier Exploration Tabs
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
   - Plus the 12 squad superlatives listed in the table above.

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

| Archetype | Vector Coordinates | Accent Color & Visual Theme | Motto & Cognitive Signature |
| :--- | :---: | :---: | :--- |
| 🏛️ **THE ARCHITECT** | `[Plan, Solo, Logic]` | `#38BDF8` (Blueprint Cyan & Compass Gold) | *“Blueprints every exit before entering the room.”* Calculating, strategic, self-sufficient. |
| 🔮 **THE LONE ORACLE** | `[Plan, Solo, Instinct]` | `#C084FC` (Mystic Violet & Third-Eye Gold) | *“Quietly predicts the plot twist three scenes early.”* Intuitive, perceptive, enigmatic loner. |
| 📋 **THE DISPATCHER** | `[Plan, Crew, Logic]` | `#34D399` (Signal Green & Headset White) | *“Turns group chaos into an actual itinerary.”* The operational backbone and logistics commander. |
| ⚓ **THE ANCHOR** | `[Plan, Crew, Instinct]` | `#60A5FA` (Cobalt Shield & Warm Pearl) | *“Reads the room and keeps the squad intact.”* Empathetic rock, emotional stabilizer, reliable ally. |
| 🎯 **THE ROGUE TACTICIAN**| `[Chaos, Solo, Logic]` | `#FBBF24` (Tactical Amber & Laser Eye) | *“Improvises absurd plans that somehow work.”* High-risk optimizer, unpredictable problem-solver. |
| 🌪️ **THE FREE AGENT** | `[Chaos, Solo, Instinct]` | `#2DD4BF` (Nomad Teal & Coral Scarf) | *“Follows pure curiosity off the map.”* Free spirit, impulsive explorer, allergic to itineraries. |
| 🎭 **THE PLOT TWISTER** | `[Chaos, Crew, Logic]` | `#E879F9` (Neon Magenta & Electric Mask) | *“Engineers unforgettable group detours on purpose.”* Social chess player, agent of entertaining drama. |
| ⚡ **THE SPARK** | `[Chaos, Crew, Instinct]` | `#F43F5E` (Inferno Crimson & Flame Glow) | *“First to say 'trust me' before an iconic bad decision.”* Catalyst, hype machine, adrenaline core. |

### 👾 Bespoke 16×16 Retro Pixel-Art Portrait System
Every archetype features an authentic 16×16 palette-indexed retro pixel-art character portrait (`src/shared/archetypes.ts`). Rendered with crisp edges, dark contrast outlines, and dedicated multi-color palettes, each archetype possesses its own unique character silhouette, headgear, visor, and expression both in the web UI and across the 1080×1920 social share cards.

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
