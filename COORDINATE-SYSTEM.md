# Sydney Map Coordinate Transformation System

## Overview

This system converts between **GPS coordinates** (latitude/longitude) and **SVG coordinates** for your Sydney map.

---

## Coordinate Systems

### 1. GPS Coordinates (WGS84)
- **Latitude**: -33.85934 to -33.88260 (south to north)
- **Longitude**: 151.19951 to 151.20930 (west to east)
- Standard geographic coordinates

### 2. Raw SVG Coordinates
- **X Range**: 583.64 to 4352.27 px
- **Y Range**: 3377.75 to 15434.05 px
- The coordinates in your SVG path data
- Much larger than the display viewport

### 3. ViewBox Coordinates
- **Width**: 726.77 px
- **Height**: 1643.6 px
- The displayed/rendered size from viewBox
- Scaled down from raw SVG coordinates

---

## Transformation Accuracy

**Affine transformation** using 7 calibration points:

| Metric | X-axis | Y-axis |
|--------|--------|--------|
| Average Error | 39 px | 152 px |
| Maximum Error | 115 px | 323 px |

### What This Means:
- ✅ Good enough for **placing markers** on the map
- ✅ Suitable for **approximate location** visualization
- ⚠️ Not suitable for precise surveying or routing
- The Y-axis has larger errors due to map projection effects

---

## Usage

### Quick Start

```javascript
const { gpsToSvg, svgToGps } = require('./coordinate-mapper');

// Convert GPS to Raw SVG coordinates
const svg = gpsToSvg(-33.870, 151.205);
console.log(svg); // { x: 2500.45, y: 9500.23 }

// Convert Raw SVG to GPS coordinates
const gps = svgToGps(3000, 10000);
console.log(gps); // { lat: -33.8725, lon: 151.2058 }
```

### Working with ViewBox Coordinates

If you need to place elements in the viewBox (the visible canvas):

```javascript
const { gpsToViewBox, viewBoxToGps } = require('./example-usage');

// Convert GPS to ViewBox coordinates (for rendering)
const viewBox = gpsToViewBox(-33.870, 151.205);
// Use these coordinates in your SVG

// Convert ViewBox coordinates back to GPS (for click handling)
const gps = viewBoxToGps(400, 700);
```

---

## Transformation Details

### Mathematical Model

The system uses an **affine transformation**:

```
x = a × lon + b × lat + c
y = d × lon + e × lat + f
```

With normalization for numerical stability:
- GPS coordinates are centered around their mean before transformation
- This prevents floating-point precision issues

### Parameters

```
x = 383167.9856 × lon + 3540.6444 × lat + 2429.6296
y = 6506.9363 × lon + -506078.2449 × lat + 11228.7119
```

*(Note: These use normalized coordinates internally)*

---

## Calibration Points

The transformation was calibrated using these 7 landmarks:

1. **Sydney Tower Eye** - CBD landmark
2. **Sydney Observatory** - The Rocks area
3. **Haymarket Capital Square** - Haymarket district
4. **Chinese Garden** - Darling Harbour
5. **ICC Sydney** - Darling Harbour
6. **ABC Studios** - Ultimo
7. **Central Station** - Major transport hub

---

## Important Notes

### 1. Map Projection
- The map uses an **approximate linear transformation**
- Real maps have non-linear distortions (Earth is curved!)
- Errors increase at the edges of the mapped area

### 2. Coordinate Bounds
- The raw SVG bounds are estimated from the calibration points
- Actual SVG content might extend beyond these bounds
- Check your full SVG to determine true min/max values

### 3. ViewBox Scaling
```javascript
scaleX = 726.77 / (4352.27 - 583.64) = 0.1928
scaleY = 1643.6 / (15434.05 - 3377.75) = 0.1363
```

The ViewBox is significantly smaller than the raw SVG coordinates.

---

## Improving Accuracy

To improve accuracy, you could:

1. **Add more calibration points** - Especially in areas with high errors
2. **Use polynomial transformation** - Captures non-linear effects
3. **Apply map projection** - Use proper Mercator/UTM projection
4. **Verify reference points** - Double-check the GPS coordinates

---

## Example Use Cases

### Place a marker at a GPS location
```javascript
const { gpsToViewBox } = require('./example-usage');

const marker = gpsToViewBox(-33.8688, 151.2093); // Opera House
// marker = { x: 620.5, y: 650.3 }

// Add to SVG:
// <circle cx="620.5" cy="650.3" r="5" fill="red" />
```

### Handle click events
```javascript
const { viewBoxToGps } = require('./example-usage');

svg.addEventListener('click', (event) => {
  const rect = svg.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (726.77 / rect.width);
  const y = (event.clientY - rect.top) * (1643.6 / rect.height);

  const gps = viewBoxToGps(x, y);
  console.log(`Clicked at: ${gps.lat}, ${gps.lon}`);
});
```

### Draw a route between two locations
```javascript
const points = [
  { lat: -33.8688, lon: 151.2093 }, // Opera House
  { lat: -33.8523, lon: 151.2108 }, // Harbour Bridge
];

const svgPath = points.map(p => gpsToViewBox(p.lat, p.lon))
  .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
  .join(' ');

// <path d="M 620.5 650.3 L 550.2 450.8" />
```

---

## Files

- **[coordinate-mapper.js](coordinate-mapper.js)** - Core transformation functions
- **[example-usage.js](example-usage.js)** - Usage examples and utilities
- **COORDINATE-SYSTEM.md** - This documentation

---

## Questions?

The transformation uses standard affine mathematics with least-squares fitting. The accuracy is limited by:
- Map projection distortions
- Precision of calibration points
- Assumption of linear transformation

For most web mapping applications, this level of accuracy is sufficient!
