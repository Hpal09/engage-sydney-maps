# Map Calibration Guide

## Problem

The map shows mismatched locations because the GPS coordinate system doesn't match the traced SVG from Google Maps. The SVG is geometrically accurate (99%), but the GPS-to-SVG coordinate mapping is incorrect.

## Root Cause

The hardcoded GPS corner coordinates in `lib/coordinateMapper.ts` don't match the actual geographic bounds of your traced SVG.

## Solution: Calibrate Using Known Landmarks

You need to identify at least 3-4 landmarks on your SVG that you know the exact GPS coordinates for, then find their SVG pixel coordinates.

### Step 1: Identify Landmarks

Choose landmarks that are:
- Clearly visible on the SVG
- Have known GPS coordinates (from Google Maps or your business data)
- Spread across the map (corners + center ideally)

Good choices:
- QVB (Queen Victoria Building): GPS (-33.8718, 151.2067)
- Town Hall
- Circular Quay
- Central Station
- Major intersections (George St × King St, etc.)

### Step 2: Find SVG Coordinates

There are two ways:

#### Method A: Using Browser DevTools (Recommended)

1. Open your map in the browser (`npm run dev在用`)
2. Open DevTools (F12)
3. In the console, add this code to click on the map and see coordinates:

```javascript
// Add click listener to get SVG coordinates
document.querySelector('svg').addEventListener('click', (e) => {
  const svg = e.currentTarget;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
  console.log(`SVG coordinates: x=${svgPt.x.toFixed(2)}, y=${svgPt.y.toFixed(2)}`);
  alert(`SVG: (${svgPt.x.toFixed(2)}, ${svgPt.y.toFixed(2)})`);
});
```

4. Click on each landmark and note the SVG coordinates

#### Method B: Using SVG Editor

1. Open `public/maps/20251022SydneyMapv5.svg` in Inkscape, Adobe Illustrator, or an online SVG editor
2. Click on each landmark
3. Check the coordinates in the editor (usually shown in the status bar or properties panel)

### Step 3: Update Calibration

1. Edit venues/scripts/calibrateMap.ts
2. Add your calibration points to the `CALIBRATION_POINTS` array:

```typescript
const CALIBRATION_POINTS = [
  { name: "QVB", gps: { lat: -33.8718, lng: 151.2067 }, svg: { x: 3500, y: 8200 } },
  { name: "Town Hall", gps: { lat: -33.8727, lng: 151.2064 }, svg: { x: 3517, y: 8154 } },
  // Add 2-3 more landmarks...
];
```

3. Run the calibration script:

```bash
npm run build:graph  # If needed
ts-node scripts/calibrateMap.ts
```

4. The script will output recommended `GPS_CORNERS` values
5. Copy those values into `lib/coordinateMapper.ts` (replace the `GPS_CORNERS` constant)

### Step 4: Alternative - Quick Fix Using Map Bounds

If you know the approximate GPS bounds of your traced area:

1. Open Google Maps
2. Zoom to the exact area you traced
3. Note the GPS coordinates at:
   - Top-left corner
   - Top-right corner
   - Bottom-right corner
   - Bottom-left corner

星系
2. Update `GPS_CORNERS` directly in `lib/coordinateMapper.ts`:

```typescript
const GPS_CORNERS = {
  topLeft: { lat: YOUR_TOP_LEFT_LAT, lng: YOUR_TOP_LEFT_LNG },
  topRight: { lat: YOUR_TOP_RIGHT_LAT, lng: YOUR_TOP_RIGHT_LNG },
  bottomRight: { lat: YOUR_BOTTOM_RIGHT_LAT, lng: YOUR_BOTTOM_RIGHT_LNG },
  bottomLeft: { lat: YOUR_BOTTOM_LEFT_LAT, lng: YOUR_BOTTOM_LEFT_LNG },
};
```

### Step 5: Verify

1. Restart your dev server
2. Check if business markers align with their actual locations
3. Test GPS location tracking
4. If still off, add more calibration points

## What I Fixed

✅ Updated SVG dimensions to match actual file (9957.04 × 15891.1 instead of 10151.27 × 15978.61)  
✅ Updated buildGraph.ts to use correct dimensions  
✅ Added calibration utility script  
✅ Added helper functions for GPS corner calibration  

## Next Steps

You still need to:
1. **Calibrate the GPS corners** using one of the methods above
2. Test that locations now align correctly
3. If needed, rebuild the graph: `npm run build:graph`

---

**Note:** The SVG geometry is accurate, so once GPS coordinates are correctly mapped, all locations should align perfectly.

















