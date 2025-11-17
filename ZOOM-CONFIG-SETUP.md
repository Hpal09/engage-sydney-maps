# Zoom Configuration System

## Overview

All zoom levels are now centralized in a single configuration that can be edited from the dashboard. No more hard-coded magic numbers scattered across the codebase!

---

## Architecture

### 1. **Database Model** (Prisma)

```prisma
model MapSettings {
  id           Int      @id @default(1)
  initialZoom  Float    @default(2.5)  @map("initial_zoom")
  placeZoom    Float    @default(2.8)  @map("place_zoom")
  destZoom     Float    @default(2.8)  @map("dest_zoom")
  navZoom      Float    @default(3.0)  @map("nav_zoom")

  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt      @map("updated_at")
}
```

### 2. **TypeScript Type** (types/index.ts)

```typescript
export interface ZoomConfig {
  initial: number;        // 1) App start - initial map view
  placeStart: number;     // 2) When a place is set as starting point
  destination: number;    // 3) When destination is set / centered
  navigation: number;     // 4) When navigation starts / follow mode
}
```

### 3. **API Endpoint** (app/api/map-settings/route.ts)

- **GET** `/api/map-settings` - Fetch current zoom configuration
- **PUT** `/api/map-settings` - Update zoom configuration (admin only)

---

## Setup Instructions

### Step 1: Run Database Migration

```bash
cd maps-main

# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push

# Or create and run migration
npx prisma migrate dev --name add_map_settings
```

### Step 2: Seed Initial Values (Optional)

You can create an initial settings record:

```typescript
// prisma/seed.ts or run directly in Prisma Studio
await prisma.mapSettings.create({
  data: {
    id: 1,
    initialZoom: 2.5,
    placeZoom: 2.8,
    destZoom: 2.8,
    navZoom: 3.0,
  },
});
```

Or just use Prisma Studio:
```bash
npx prisma studio
```

---

## Usage in app/page.tsx

Add this code to load and use zoom config:

```typescript
import type { ZoomConfig } from '@/types';

export default function Page() {
  const [zoomConfig, setZoomConfig] = useState<ZoomConfig | null>(null);

  // Load zoom config on mount
  useEffect(() => {
    async function fetchZoomConfig() {
      try {
        const res = await fetch('/api/map-settings');
        const config = await res.json();
        setZoomConfig(config);
      } catch (error) {
        console.error('Failed to load zoom config:', error);
        // Fallback to defaults
        setZoomConfig({
          initial: 2.5,
          placeStart: 2.8,
          destination: 2.8,
          navigation: 3.0,
        });
      }
    }

    fetchZoomConfig();
  }, []);

  // Show loading state while config loads
  if (!zoomConfig) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        Loading map...
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-0">
        <CustomSydneyMap
          businesses={visibleBusinesses}
          selectedBusiness={selected}
          userLocation={userLocation ? { ...userLocation, heading: effectiveHeading } : undefined}
          onBusinessClick={(b) => { setSelected(b); setShowLocationModal(true); }}
          activeRoute={remainingRoute || activeRoute}
          onCenterOnUser={Boolean(centerOnUserTick)}
          onCenterOnPoint={centerOnPoint}
          smoothNavMarker={activeRoute ? smoothNavMarker : null}
          navigationStart={navigationStart}
          navigationDestination={navigationDestination}
          showGraphOverlay={showGraphOverlay}
          debugTransformLogTick={debugTransformLogTick}
          zoomConfig={zoomConfig}  {/* ✅ NEW PROP */}
        />
      </div>
      {/* ... rest of UI */}
    </>
  );
}
```

---

## How Each Zoom Level is Used

### 1. **initial** (App Start)
- Used in CustomSydneyMap initial centering effect
- Centers `MAP_PIN_SVG_COORD` at this zoom when map loads
- Default: 2.5

### 2. **placeStart** (Starting Point Selected)
- Currently not auto-triggered (ready for implementation)
- Use when user selects a start location
- Suggested: 2.8 (slightly more zoomed than initial)

**Example implementation:**
```typescript
// When user selects start point
if (zoomConfig && transformRef.current && startPlace) {
  centerToLatLng(transformRef.current, startPlace.lat, startPlace.lng, {
    scale: zoomConfig.placeStart,
    durationMs: 400,
  });
}
```

### 3. **destination** (Destination Selected)
- Currently not auto-triggered (ready for implementation)
- Use when user selects destination
- Default: 2.8

**Example implementation:**
```typescript
// When user selects destination
if (zoomConfig && transformRef.current && destPlace) {
  centerToLatLng(transformRef.current, destPlace.lat, destPlace.lng, {
    scale: zoomConfig.destination,
    durationMs: 400,
  });
}
```

### 4. **navigation** (Navigation / Follow Mode)
- **✅ Already implemented** in "center on user" effect
- Used when onCenterOnUser is triggered (follow me mode)
- Default: 3.0 (more zoomed for navigation clarity)

---

## Dashboard Integration (Future)

Create an admin page to edit these values:

```typescript
// app/admin/map-settings/page.tsx
'use client';

export default function MapSettingsPage() {
  const [config, setConfig] = useState<ZoomConfig>({
    initial: 2.5,
    placeStart: 2.8,
    destination: 2.8,
    navigation: 3.0,
  });

  async function handleSave() {
    await fetch('/api/map-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    alert('Zoom settings saved!');
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Map Zoom Settings</h1>

      <div className="space-y-4">
        <div>
          <label className="block mb-2">Initial Zoom (App Start)</label>
          <input
            type="range"
            min="1"
            max="8"
            step="0.1"
            value={config.initial}
            onChange={(e) => setConfig({ ...config, initial: parseFloat(e.target.value) })}
          />
          <span className="ml-4">{config.initial.toFixed(1)}x</span>
        </div>

        <div>
          <label className="block mb-2">Place Start Zoom</label>
          <input
            type="range"
            min="1"
            max="8"
            step="0.1"
            value={config.placeStart}
            onChange={(e) => setConfig({ ...config, placeStart: parseFloat(e.target.value) })}
          />
          <span className="ml-4">{config.placeStart.toFixed(1)}x</span>
        </div>

        <div>
          <label className="block mb-2">Destination Zoom</label>
          <input
            type="range"
            min="1"
            max="8"
            step="0.1"
            value={config.destination}
            onChange={(e) => setConfig({ ...config, destination: parseFloat(e.target.value) })}
          />
          <span className="ml-4">{config.destination.toFixed(1)}x</span>
        </div>

        <div>
          <label className="block mb-2">Navigation Zoom (Follow Mode)</label>
          <input
            type="range"
            min="1"
            max="8"
            step="0.1"
            value={config.navigation}
            onChange={(e) => setConfig({ ...config, navigation: parseFloat(e.target.value) })}
          />
          <span className="ml-4">{config.navigation.toFixed(1)}x</span>
        </div>

        <button
          onClick={handleSave}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
        >
          Save Settings
        </button>
      </div>
    </div>
  );
}
```

---

## Benefits

1. **Single Source of Truth** - All zoom decisions in one place
2. **Dashboard Editable** - No code changes needed to adjust zoom
3. **Type Safe** - TypeScript ensures correct usage
4. **Backwards Compatible** - Falls back to defaults if config not loaded
5. **Consistent** - Same zoom behavior across all scenarios

---

## Files Modified

- ✅ `types/index.ts` - Added `ZoomConfig` interface
- ✅ `prisma/schema.prisma` - Added `MapSettings` model
- ✅ `app/api/map-settings/route.ts` - Created API endpoint
- ✅ `components/Map/CustomSydneyMap.tsx`:
  - Added `zoomConfig` prop
  - Initial centering uses `zoomConfig.initial`
  - User centering uses `zoomConfig.navigation`
  - `centerToLatLng` accepts `scale` parameter

---

## Next Steps

1. ✅ Run database migration
2. ⏳ Load `zoomConfig` in `app/page.tsx`
3. ⏳ Pass `zoomConfig` to `CustomSydneyMap`
4. ⏳ Implement place/destination zoom triggers
5. ⏳ Create dashboard UI for editing values

---

## Testing

After implementing, test each zoom level:

1. **Initial**: Refresh page → Should center at `initial` zoom
2. **Navigation**: Enable follow mode → Should zoom to `navigation` level
3. **Place/Destination**: (After implementing) Select start/dest → Should zoom appropriately

Check console for:
```
[INIT CENTER] {
  scale: 2.5,  // Should match zoomConfig.initial
  ...
}
```
