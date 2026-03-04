# FastFingers - Modern Typing Test Platform

## Project Overview

**Project Name:** FastFingers
**Type:** Full-stack Web Application (Real-time Typing Test Platform)
**Core Functionality:** A modern typing test website similar to 10fastfingers.com with competition features, real-time multiplayer, leaderboards, and friend challenges.
**Target Users:** Typing enthusiasts, speed typists, competitive gamers, and anyone wanting to improve their typing skills.

---

## Technology Stack

### Frontend
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + Custom CSS
- **State Management:** React Context + Zustand
- **Real-time:** Socket.io Client
- **Animations:** Framer Motion

### Backend
- **Runtime:** Node.js
- **API:** Next.js API Routes
- **Real-time:** Socket.io Server
- **Database:** SQLite with Prisma ORM (for simplicity and portability)
- **Authentication:** NextAuth.js (optional for future)

---

## UI/UX Specification

### Color Palette
| Role | Color | Hex |
|------|-------|-----|
| Background Primary | Deep Charcoal | `#0D0D0D` |
| Background Secondary | Dark Gray | `#1A1A2E` |
| Background Card | Soft Black | `#16213E` |
| Primary Accent | Electric Cyan | `#00FFF5` |
| Secondary Accent | Neon Purple | `#7B2CBF` |
| Success | Mint Green | `#00D9A5` |
| Error | Coral Red | `#FF6B6B` |
| Text Primary | White | `#FFFFFF` |
| Text Secondary | Light Gray | `#A0A0A0` |
| Text Muted | Gray | `#666666` |

### Typography
- **Primary Font:** "JetBrains Mono" (for typing area - monospace, coding feel)
- **Secondary Font:** "Outfit" (for headings and UI - modern, geometric)
- **Body Font:** "DM Sans" (for body text - clean, readable)

### Font Sizes
| Element | Size | Weight |
|---------|------|--------|
| Hero Title | 72px | 800 |
| Section Title | 48px | 700 |
| Card Title | 24px | 600 |
| Body Text | 16px | 400 |
| Typing Text | 28px | 500 |
| Small Text | 14px | 400 |

### Layout Structure

#### Global Navigation (Sticky Header)
- Logo (left) - "FastFingers" with lightning icon
- Navigation Links (center): Home, Typing Test, Multiplayer, Leaderboard
- User Actions (right): Login/Profile, Dark theme toggle
- Glassmorphism effect with blur backdrop

#### Homepage
1. **Hero Section**
   - Large animated title with gradient text
   - Dynamic typing showcase
   - CTA buttons: "Start Typing" and "Compete Now"
   - Floating animated keyboard visual

2. **Language Selector Section** (Prominent placement)
   - Large dropdown with flag icons for each language
   - Supported languages:
     - 🇺🇸 English (default)
     - 🇮🇩 Indonesian (Bahasa Indonesia)
     - 🇪🇸 Spanish (Español)
     - 🇫🇷 French (Français)
     - 🇩🇪 German (Deutsch)
     - 🇵🇹 Portuguese (Português)
     - 🇮🇹 Italian (Italiano)
     - 🇷🇺 Russian (Русский)
     - 🇨🇳 Chinese (中文)
     - 🇯🇵 Japanese (日本語)
   - "Select Language" label with globe icon
   - Language indicator in navbar

3. **Stats Section**
   - Live stats cards showing: Users Online, Tests Completed Today, Average WPM
   - Animated counter numbers

4. **Features Preview**
   - 3 feature cards with icons:
     - Speed Test (⚡)
     - Multiplayer Battle (🏆)
     - Challenge Friends (👥)
   - Hover effects with glow

#### Typing Test Page
1. **Test Area**
   - Large typing display with character-by-character highlighting
   - Current word highlighted
   - Correct characters: Cyan (#00FFF5)
   - Incorrect characters: Red (#FF6B6B) with strikethrough
   - Cursor animation (blinking bar)
   - Progress bar at top

2. **Stats Panel (Real-time)**
   - WPM (Words Per Minute) - Large display
   - Accuracy (%)
   - Time remaining/elapsed
   - Characters typed

3. **Controls**
   - Start/Restart button
   - Test duration selector: 30s, 60s, 120s
   - Word count selector: 50, 100, 200 words

4. **Results Modal**
   - Final WPM with grade (S/A/B/C/D)
   - Accuracy percentage
   - Time taken
   - Error count
   - Comparison to personal best
   - "Share Result" and "Try Again" buttons

#### Multiplayer Battle Page
1. **Lobby**
   - Create Room / Join Room
   - Room code display
   - Waiting room with player avatars
   - Ready status indicator

2. **Battle Arena**
   - Split screen showing both players
   - Real-time WPM comparison
   - Live progress bars
   - Chat functionality
   - Finish indicator with winner announcement

3. **Leaderboard**
   - Global ranking table
   - Filters: All Time, Today, Weekly
   - User rank highlighting
   - Pagination

#### Challenge System
1. **Create Challenge**
   - Select difficulty
   - Set time limit
   - Generate shareable link

2. **Challenge Page**
   - Accept/Decline buttons
   - Side-by-side results comparison

### Visual Effects & Animations
- **Page Transitions:** Smooth fade-in with staggered elements
- **Typing Area:** Subtle pulse on correct keystroke
- **Buttons:** Scale + glow on hover
- **Cards:** Lift effect with shadow on hover
- **Loading States:** Skeleton screens with shimmer
- **Success/Error:** Toast notifications with slide-in

### Responsive Breakpoints
| Breakpoint | Width | Adjustments |
|------------|-------|-------------|
| Mobile | < 640px | Single column, reduced font sizes, hidden nav |
| Tablet | 640px - 1024px | Two columns, condensed layout |
| Desktop | > 1024px | Full layout, side panels |

---

## Functionality Specification

### Core Features

#### 1. Typing Test Engine
- Word generation from word bank
- Random word order
- Character-level input validation
- Real-time WPM calculation: (Characters Typed / 5) / Minutes
- Accuracy calculation: (Correct Characters / Total Typed) * 100
- Auto-advance on spacebar
- Error tracking per character
- Test completion detection

#### 2. Word Banks
- Multiple language support
- Difficulty levels (Easy, Medium, Hard)
- Category-based words (General, Programming, Business)
- Minimum 1000 words per language

#### 3. Real-time Multiplayer (Socket.io)
- Room creation with unique codes (6 characters)
- Player matchmaking (2-8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               players per room)
- Synchronized test start                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              
- Real-time progress sync
- Live WPM updates
- Connection recovery
- Disconnect handling

#### 4. Leaderboard System
- Global rankings by WPM
- Filter by time period
- Filter by language
- Personal best tracking
- Top 100 display

#### 5. Challenge System
- Generate unique challenge URL
- Challenge settings (time, difficulty)
- Result comparison
- Challenge history

#### 6. User Statistics (Local Storage)
- Personal best WPM
- Average WPM
- Total tests completed
- Total time practiced
- Accuracy trends

---

## API Specification

### REST Endpoints

```
GET  /api/words?language=en&difficulty=medium&count=50
POST /api/rooms/create
GET  /api/rooms/:roomId
POST /api/rooms/:roomId/join
GET  /api/leaderboard?period=all&language=en
POST /api/challenges/create
GET  /api/challenges/:challengeId
```

### WebSocket Events

```
Client -> Server:
- create-room
- join-room
- player-ready
- start-test
- update-progress
- send-message
- leave-room

Server -> Client:
- room-created
- player-joined
- player-left
- game-starting
- progress-update
- game-ended
- chat-message
```

---

## Database Schema (Prisma)

### User
- id: String (UUID)
- username: String
- email: String (optional)
- createdAt: DateTime

### TestResult
- id: String (UUID)
- userId: String
- wpm: Float
- accuracy: Float
- duration: Int
- language: String
- createdAt: DateTime

### Leaderboard
- id: String (UUID)
- userId: String
- wpm: Float
- language: String
- period: String (alltime/today/weekly)
- createdAt: DateTime

---

## Acceptance Criteria

### Visual Checkpoints
- [ ] Homepage loads with animated hero section
- [ ] Navigation is responsive and functional
- [ ] Typing test displays words correctly with proper highlighting
- [ ] Real-time stats update smoothly during typing
- [ ] Results modal appears with animations
- [ ] Multiplayer lobby shows room creation/joining
- [ ] Leaderboard displays rankings with proper formatting

### Functional Checkpoints
- [ ] Typing test starts on first keypress
- [ ] WPM calculates correctly in real-time
- [ ] Accuracy tracks correct/incorrect characters
- [ ] Test ends when time expires or all words completed
- [ ] Room creation generates unique code
- [ ] Multiple players can join same room
- [ ] Real-time progress syncs between players
- [ ] Leaderboard fetches and displays data
- [ ] Challenge links work correctly

### Performance Checkpoints
- [ ] Initial page load < 3 seconds
- [ ] Typing input latency < 50ms
- [ ] WebSocket connection established < 1 second
- [ ] No memory leaks during extended typing sessions

---

## File Structure

```
fastfingers-app/
├── prisma/
│   └── schema.prisma
├── public/
│   ├── fonts/
│   └── images/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── typing/
│   │   │   └── page.tsx
│   │   ├── multiplayer/
│   │   │   └── page.tsx
│   │   ├── leaderboard/
│   │   │   └── page.tsx
│   │   ├── challenge/
│   │   │   └── [id]/
│   │   │       └── page.tsx
│   │   └── api/
│   │       ├── words/
│   │       ├── rooms/
│   │       ├── leaderboard/
│   │       └── challenges/
│   ├── components/
│   │   ├── ui/
│   │   ├── typing/
│   │   ├── multiplayer/
│   │   └── layout/
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── socket.ts
│   │   └── utils.ts
│   ├── hooks/
│   ├── store/
│   └── styles/
│       └── globals.css
├── socket-server/
│   └── server.ts
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

---

## Implementation Priority

### Phase 1 - Core (Must Have)
1. Project setup with Next.js
2. Homepage with hero section
3. Basic typing test engine
4. Word bank system
5. Results calculation

### Phase 2 - Competition
1. Socket.io server setup
2. Multiplayer room system
3. Real-time battle arena
4. Leaderboard API

### Phase 3 - Social
1. Challenge system
2. Challenge result comparison
3. Share functionality

### Phase 4 - Polish
1. Animations and effects
2. Loading states
3. Error handling
4. Mobile optimization
