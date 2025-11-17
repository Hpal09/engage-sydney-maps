# Map Centering Fix - Coordinate Space Issue

## Problem

The map was drifting to the top-right on initial load instead of centering correctly. The crosshair appeared off-center, and the map showed mostly the top-left corner of the viewport.

**Root Cause:** Mixing coordinate spaces in the initial centering calculation.

---

## Understanding the Three Coordinate Spaces

### 1. **SVG ViewBox Coordinates** (Raw SVG)
```
viewBox="0 0 726.77 1643.6"
MAP_PIN_SVG_COORD = { x: 337.12, y: 984.08 }
```
These are the coordinates in the SVG file itself.

### 2. **Rendered Pixel Coordinates** (Browser)
When the SVG is rendered with `preserveAspectRatio="xMidYMid meet"`:
- The SVG scales uniformly to fit the viewport
- It's centered with letterboxing if aspect ratios don't match
- `renderScale = Math.min(viewportWidth / viewBox.width, viewportHeight / viewBox.height)`
- Centering offsets are applied: `offsetX`, `offsetY`

### 3. **react-zoom-pan-pinch Transform** (User Zoom/Pan)
- Applies `scale` (zoom factor) to the already-rendered SVG
- `positionX`, `positionY` are in **screen pixels**
- `setTransform(positionX, positionY, scale)` expects screen pixel coordinates

---

## The Bug

The **old initial centering code** skipped step 2:

```typescript
// ❌ WRONG - Mixed coordinate spaces
const fitScaleX = wrapper.offsetWidth / contentWidth;
const fitScaleY = wrapper.offsetHeight / contentHeight;
const baseScale = Math.min(fitScaleX, fitScaleY);
const scale = baseScale * INITIAL_ZOOM_MULTIPLIER;  // Confused: this isn't how react-zoom-pan-pinch works

const positionX = screenCenterX - (MAP_PIN_SVG_COORD.x - originX) * scale;
const positionY = screenCenterY - (MAP_PIN_SVG_COORD.y - originY) * scale;
```

**Why this was wrong:**
- `baseScale` represents the SVG's internal rendering scale (viewBox → pixels)
- `scale` in react-zoom-pan-pinch is a **zoom factor** applied to already-rendered pixels
- Multiplying `baseScale * INITIAL_ZOOM_MULTIPLIER` creates a value that doesn't match either coordinate system
- The translate calculation used `MAP_PIN_SVG_COORD.x` (viewBox units) directly, ignoring rendering offsets

Result: The math was off, causing the map to drift.

---

## The Fix

The **new code** properly converts through all three coordinate spaces:

```typescript
// ✅ CORRECT - Step by step coordinate conversion

// 1) Calculate how SVG renders in the viewport
const viewportWidth = wrapper.offsetWidth;
const viewportHeight = wrapper.offsetHeight;

const renderScaleX = viewportWidth / viewBox.width;
const renderScaleY = viewportHeight / viewBox.height;
const renderScale = Math.min(renderScaleX, renderScaleY);  // SVG's natural scale

const scaledSvgWidth = viewBox.width * renderScale;
const scaledSvgHeight = viewBox.height * renderScale;

// 2) Calculate letterboxing offsets (xMidYMid meet)
const offsetX = (viewportWidth - scaledSvgWidth) / 2;
const offsetY = (viewportHeight - scaledSvgHeight) / 2;

// 3) Convert SVG viewBox coordinate → rendered pixel coordinate
const renderedX = MAP_PIN_SVG_COORD.x * renderScale + offsetX;
const renderedY = MAP_PIN_SVG_COORD.y * renderScale + offsetY;

// 4) Apply react-zoom-pan-pinch zoom (pure zoom factor, not mixed with renderScale)
const scale = INITIAL_ZOOM_MULTIPLIER;  // e.g., 2.5

// 5) Center the rendered point at screen center
const screenCenterX = viewportWidth / 2;
const screenCenterY = viewportHeight / 2;

const positionX = screenCenterX - renderedX * scale;
const positionY = screenCenterY - renderedY * scale;

// 6) Apply transform
transformRef.current.setTransform(positionX, positionY, scale, 0, 'easeOut');
```

**Key improvements:**
- Separates SVG rendering scale from zoom-pan-pinch scale
- Converts viewBox coordinates to rendered pixel coordinates first
- Uses the same logic as `centerToLatLng()` for consistency
- Accounts for letterboxing offsets from `preserveAspectRatio="xMidYMid meet"`

---

## Verification

The debug console log shows the calculation is correct:

```javascript
console.log('[INIT CENTER]', {
  viewportWidth,
  viewportHeight,
  renderScale,
  renderedX,
  renderedY,
  scale,
  positionX,
  positionY,
  screenX,  // Should equal screenCenterX
  screenY,  // Should equal screenCenterY
  screenCenterX,
  screenCenterY,
});
```

If `screenX ≈ screenCenterX` and `screenY ≈ screenCenterY`, the centering is perfect.

---

## Why This Matches centerToLatLng()

The `centerToLatLng()` function already had the correct logic:

```typescript
// From centerToLatLng (line 102-159)
const renderScaleX = viewportWidth / viewBox.width;
const renderScaleY = viewportHeight / viewBox.height;
const renderScale = Math.min(renderScaleX, renderScaleY);

const scaledSvgWidth = viewBox.width * renderScale;
const scaledSvgHeight = viewBox.height * renderScale;
const offsetX = (viewportWidth - scaledSvgWidth) / 2;
const offsetY = (viewportHeight - scaledSvgHeight) / 2;

// Convert SVG viewBox coordinates to rendered pixel coordinates
const renderedX = svg.x * renderScale + offsetX;
const renderedY = svg.y * renderScale + offsetY;

// ... then apply zoom transform
```

The initial centering now uses **the exact same approach**, making it consistent.

---

## Testing

1. **Build and run:**
   ```bash
   cd maps-main
   npm run dev
   ```

2. **Expected behavior:**
   - Map centers on `MAP_PIN_SVG_COORD` (337.12, 984.08) at 2.5x zoom
   - Crosshair appears at screen center
   - No drift to top-right
   - Consistent with GPS centering behavior

3. **Check console:**
   ```
   [INIT CENTER] {
     screenX: 500,      // Should match screenCenterX
     screenY: 400,      // Should match screenCenterY
     screenCenterX: 500,
     screenCenterY: 400,
     ...
   }
   ```

---

## Files Modified

- **[components/Map/CustomSydneyMap.tsx](maps-main/components/Map/CustomSydneyMap.tsx)** (lines 251-310)
  - Replaced initial centering effect
  - Now uses rendered pixel coordinates
  - Consistent with `centerToLatLng()` logic

---

## Summary

**Before:** Mixed coordinate spaces → map drifted to top-right
**After:** Proper coordinate space conversion → perfect centering

The fix treats react-zoom-pan-pinch's `scale` as a pure zoom multiplier applied to already-rendered pixels, not as a combined "viewBox units per screen pixel" value.

This is exactly how `centerToLatLng()` works, so now initial centering and GPS centering use the same mathematical approach.
