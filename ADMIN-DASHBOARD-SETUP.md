# Admin Dashboard - Map Zoom Settings

## What's Been Completed

The admin dashboard for managing map zoom settings is now fully implemented and ready to use!

### Created Files

1. **[maps-main/app/admin/map-settings/page.tsx](maps-main/app/admin/map-settings/page.tsx)**
   - Full-featured admin UI for editing zoom levels
   - Real-time sliders with numeric inputs
   - Success/error message handling
   - Loading states and disabled states during save
   - Reset to defaults functionality

2. **Database Setup**
   - MapSettings table created in database
   - Initial record seeded with default values:
     - Initial Zoom: 2.5x
     - Place Start Zoom: 2.8x
     - Destination Zoom: 2.8x
     - Navigation Zoom: 3.0x

3. **Navigation Updated**
   - Added "Map Settings" link to admin sidebar
   - Uses Settings icon from lucide-react
   - Positioned between Events and Account

---

## How to Access

1. **Start the dev server** (if not already running):
   ```bash
   cd maps-main
   npm run dev
   ```

2. **Navigate to the admin dashboard**:
   ```
   http://localhost:3002/admin
   ```
   (Note: Port may be different if 3002 is in use)

3. **Click "Map Settings" in the sidebar**

---

## Features

### Zoom Level Controls

Each zoom level has:
- **Slider**: Drag to adjust between 1x - 8x
- **Numeric Input**: Type exact values with 0.1 precision
- **Description**: Clear explanation of when this zoom level is used
- **Real-time Preview**: See the value change as you drag

### Controls

- **Save Settings**: Saves changes to database (shows success message)
- **Reset to Defaults**: Restores factory defaults (2.5, 2.8, 2.8, 3.0)

### User Experience

- Loading spinner while fetching current settings
- Disabled state during save operation
- Success message (green) on successful save
- Error message (red) if save fails
- Info note explaining that changes persist and require page refresh

---

## What Each Zoom Level Does

| Setting | Usage | Default | Current Status |
|---------|-------|---------|----------------|
| **Initial Zoom** | When app first loads | 2.5x | ✅ Active in map |
| **Place Start Zoom** | User selects starting point | 2.8x | ⏳ Ready (needs wiring) |
| **Destination Zoom** | User selects destination | 2.8x | ⏳ Ready (needs wiring) |
| **Navigation Zoom** | Follow mode / center on user | 3.0x | ✅ Active in map |

---

## API Endpoints Used

The admin page communicates with:

- **GET** `/api/map-settings` - Loads current settings on page mount
- **PUT** `/api/map-settings` - Saves updated settings when "Save" is clicked

Both endpoints are defined in [maps-main/app/api/map-settings/route.ts](maps-main/app/api/map-settings/route.ts)

---

## Next Steps (Optional)

### 1. Wire Up Place/Destination Zoom

To make the `placeStart` and `destination` zoom levels work, update your place selection handlers in `app/page.tsx`:

```typescript
// When user selects a starting point
function handlePlaceSelect(place: Business) {
  setNavigationStart(place);

  // Auto-zoom to place
  if (zoomConfig && transformRef.current) {
    centerToLatLng(transformRef.current, place.lat, place.lng, {
      scale: zoomConfig.placeStart,
      durationMs: 400,
    });
  }
}

// When user selects a destination
function handleDestinationSelect(place: Business) {
  setNavigationDestination(place);

  // Auto-zoom to destination
  if (zoomConfig && transformRef.current) {
    centerToLatLng(transformRef.current, place.lat, place.lng, {
      scale: zoomConfig.destination,
      durationMs: 400,
    });
  }
}
```

### 2. Add Authentication (Recommended)

Currently, the admin page has no authentication. Consider adding:
- Session checking in admin layout
- Redirect to login if not authenticated
- Role-based access control

Example middleware:
```typescript
// app/admin/map-settings/page.tsx
export default async function MapSettingsPage() {
  const session = await getServerSession();
  if (!session || session.user.role !== 'admin') {
    redirect('/admin/login');
  }

  // ... rest of component
}
```

### 3. Add Live Preview (Optional)

Add a mini map preview in the admin page showing the effect of zoom changes in real-time.

---

## Testing the Admin Page

1. **Load the page**: Should show current values (2.5, 2.8, 2.8, 3.0)
2. **Adjust sliders**: Values should update in real-time
3. **Type in inputs**: Should update slider position
4. **Click Save**: Should show green success message
5. **Refresh page**: Should show your saved values
6. **Click Reset**: Should restore defaults
7. **Check database**:
   ```bash
   npx prisma studio
   ```
   Open MapSettings table to see stored values

---

## Troubleshooting

### Changes not taking effect on map?

- Make sure you've integrated `zoomConfig` in `app/page.tsx` (see [IMPLEMENTATION-SUMMARY.md](IMPLEMENTATION-SUMMARY.md))
- Refresh the main app page after changing settings
- Check browser console for errors

### Can't access admin page?

- Check if dev server is running
- Verify port number in server output
- Check if you're logged in (if auth is enabled)

### Database errors?

Run these commands:
```bash
cd maps-main
npx prisma db push
npx prisma generate
```

---

## Summary

You now have a fully functional admin dashboard for managing map zoom settings!

**What's working:**
- ✅ Admin UI with sliders and inputs
- ✅ Database storage with persistence
- ✅ API endpoints for read/write
- ✅ Success/error handling
- ✅ Real-time value updates
- ✅ Reset to defaults

**What's ready but not wired:**
- ⏳ Place start zoom trigger
- ⏳ Destination zoom trigger
- ⏳ Integration in app/page.tsx

See [IMPLEMENTATION-SUMMARY.md](IMPLEMENTATION-SUMMARY.md) for how to complete the integration in the main app.
