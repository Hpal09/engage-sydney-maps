# 🗺️ Sydney CBD Navigation App

An intelligent, interactive map navigation system for Sydney CBD with AI-powered search and turn-by-turn directions. This web application provides real-time navigation, location discovery, and smart recommendations for exploring Sydney's central business district.

![Next.js](https://img.shields.io/badge/Next.js-14.2.5-black)
![React](https://img.shields.io/badge/React-18.3.1-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5.3-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

### 🤖 AI-Powered Search
- Natural language queries powered by Google's Generative AI
- Context-aware business and location discovery
- Smart recommendations based on user preferences
- Follow-up question suggestions

### 🧭 Advanced Navigation
- **Turn-by-turn directions** with real-time GPS tracking
- **Custom pathfinding algorithm** using graph-based routing
- **Visual route highlighting** on the map
- **Live position tracking** with heading indicators
- Support for both device location and manual start points

### 📍 Location Features
- Interactive business markers on the map
- Detailed location information modals
- Category filtering (restaurants, cafes, shops, etc.)
- Price range indicators
- Distance calculations from user location

### 🎨 Modern UI/UX
- Smooth zoom, pan, and pinch controls
- Responsive design for all screen sizes
- Clean, intuitive interface
- Real-time map updates
- Expandable search/chat interface

### 🗺️ Map Capabilities
- High-quality SVG-based map rendering
- Custom Sydney CBD map with detailed pathways
- Automatic map bounds detection
- Center-on-user functionality
- Location simulation for testing

## 🚀 Tech Stack

- **Framework:** [Next.js 14](https://nextjs.org/) (App Router)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **UI Library:** [React 18](https://react.dev/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **AI:** [Google Generative AI](https://ai.google.dev/)
- **Map Controls:** [react-zoom-pan-pinch](https://github.com/BetterTyped/react-zoom-pan-pinch)
- **Icons:** [Lucide React](https://lucide.dev/)
- **SVG Parsing:** [svg-path-parser](https://github.com/hughsk/svg-path-parser)

## 📋 Prerequisites

- **Node.js:** >= 18.17.0
- **npm** or **yarn** package manager
- **Google AI API Key:** Required for AI search functionality

## 🛠️ Installation

1. **Clone the repository**
```bash
git clone https://github.com/hpal1614/maps.git
cd maps
```

2. **Install dependencies**
```bash
npm install
# or
yarn install
```

3. **Set up environment variables**

Create a `.env.local` file in the root directory:
```bash
GOOGLE_API_KEY=your_google_ai_api_key_here
# Alternative: GEMINI_API_KEY=your_gemini_api_key_here
```

> **Security Note:** API keys are **server-side only** and are never exposed to the client. They are accessed exclusively in API routes (`app/api/`) and the AI library (`lib/ai.ts`). Never add API keys to `next.config.mjs` env object or any client-side code.

> Get your Google AI API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

4. **Build the graph data** (if needed)
```bash
npm run build:graph
```

5. **Run the development server**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📖 Usage

### Basic Navigation
1. **Search for locations:** Click the search bar and type your query (e.g., "coffee shops near me")
2. **Select markers:** Click on any business marker to view details
3. **Start navigation:** Set a start point and destination, then click "Start Journey"
4. **Turn-by-turn:** Enable turn-by-turn mode for real-time navigation guidance

### AI Search Examples
- "Where can I get cheap lunch?"
- "Best coffee near Queen Victoria Building"
- "Chinese restaurants in the area"
- "Show me all cafes"

### Testing Features
- **Teleport to QVB:** Use the "Teleport to QVB" button to simulate being at Queen Victoria Building
- **Manual start points:** Select any location as your starting point for navigation
- **Out of area:** The app will notify you if you're outside the Sydney CBD coverage area

## 📁 Project Structure

```
engage-sydney/
├── app/                      # Next.js App Router
│   ├── api/
│   │   └── ai/
│   │       └── search/      # AI search API endpoint
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Main application page
├── components/
│   ├── Location/
│   │   └── LocationDetailModal.tsx
│   ├── Map/
│   │   ├── CustomSydneyMap.tsx    # Main map component
│   │   └── MapControls.tsx        # Map control buttons
│   ├── Navigation/
│   │   └── NavigationPanel.tsx    # Navigation UI
│   └── Search/
│       ├── AISearch.tsx           # AI chat interface
│       ├── OmniSearchBar.tsx      # Search bar component
│       └── SearchInput.tsx        # Input field
├── data/
│   ├── businesses.ts              # Business location data
│   ├── intersections.ts           # Street intersection data
│   ├── sydney-graph.json          # Simplified routing graph
│   └── sydney-graph-full.json     # Complete routing graph
├── lib/
│   ├── ai.ts                      # AI integration
│   ├── coordinateMapper.ts        # GPS ↔ SVG conversion
│   ├── pathfinding.ts             # Route calculation algorithms
│   ├── routeDrawer.ts             # Route visualization
│   ├── svgParser.ts               # SVG map parsing
│   └── turnByTurn.ts              # Turn-by-turn instructions
├── public/
│   └── maps/
│       └── 20251022SydneyMapv5.svg  # Sydney CBD map
├── scripts/
│   └── buildGraph.ts              # Graph building utility
└── types/
    └── index.ts                   # TypeScript type definitions
```

## 🔧 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run build:graph` | Build the routing graph from SVG |

## 🎯 Key Features Explained

### Pathfinding Algorithm
The app uses a custom A* pathfinding algorithm that:
- Builds a graph from SVG path data
- Finds optimal routes between intersections
- Considers distance and path availability
- Provides fallback routes when direct paths aren't available

### Coordinate Mapping
Precise conversion between:
- **GPS coordinates** (latitude/longitude)
- **SVG coordinates** (x/y pixels)
- Maintains accuracy across zoom levels

### Turn-by-Turn Navigation
- Calculates bearing and distance to next waypoint
- Provides contextual instructions (e.g., "Turn left", "Continue straight")
- Updates in real-time as user moves
- Detects destination arrival

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Sydney CBD map data and design
- Google Generative AI for intelligent search capabilities
- Next.js team for the excellent framework
- Open source community for various libraries and tools

## 🐛 Known Issues

- Map coverage limited to Sydney CBD area
- GPS accuracy depends on device capabilities
- AI responses require active internet connection

## 📮 Contact

Project Link: [https://github.com/hpal1614/maps](https://github.com/hpal1614/maps)

---

Built with ❤️ for Sydney CBD navigation

