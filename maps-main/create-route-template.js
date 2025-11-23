// Helper script to generate SVG template for pre-defined routes
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const places = await prisma.place.findMany({
    select: {
      id: true,
      name: true,
      lat: true,
      lng: true
    },
    where: { isLive: true },
    orderBy: { name: 'asc' }
  });

  // Recommended routes for demo
  const demoRoutes = [
    { from: 'Queen Victoria Building (QVB)', to: 'Market City Food Court', street: 'George St' },
    { from: 'Queen Victoria Building (QVB)', to: 'Chat Thai', street: 'George St' },
    { from: 'Market Street Food Hall', to: 'Queen Victoria Building (QVB)', street: 'Market St' },
    { from: 'Queen Victoria Building (QVB)', to: 'Capitol Square Food', street: 'George St' },
    { from: 'George Street Eats', to: 'Queen Victoria Building (QVB)', street: 'George St' }
  ];

  console.log('=== SVG TEMPLATE FOR PRE-DEFINED ROUTES ===\n');
  console.log('<!-- Add this to your SVG file as a new layer -->');
  console.log('<g id="predefined-routes" opacity="0">');
  console.log('');

  demoRoutes.forEach((route, i) => {
    const fromPlace = places.find(p => p.name === route.from);
    const toPlace = places.find(p => p.name === route.to);

    if (!fromPlace || !toPlace) {
      console.log(`  <!-- ERROR: Could not find places for ${route.from} → ${route.to} -->`);
      return;
    }

    const routeId = `route_${fromPlace.id}_to_${toPlace.id}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    console.log(`  <!-- Route ${i + 1}: ${route.from} → ${route.to} -->`);
    console.log(`  <g id="${routeId}" data-from-id="${fromPlace.id}" data-to-id="${toPlace.id}">`);
    console.log(`    <path id="${routeId}_segment1"`);
    console.log(`          data-street="${route.street}"`);
    console.log(`          d="M [START_X],[START_Y] L [POINT_X],[POINT_Y] L [END_X],[END_Y]"`);
    console.log(`          stroke="#0000ff" stroke-width="2"/>`);
    console.log(`    <!-- Add more path segments as needed with appropriate data-street attributes -->`);
    console.log(`  </g>`);
    console.log('');
  });

  console.log('</g>');
  console.log('\n=== INSTRUCTIONS ===');
  console.log('1. Copy the SVG template above');
  console.log('2. Open your SVG file in a text editor or Inkscape');
  console.log('3. Paste the template as a new layer');
  console.log('4. For each route, trace the path following the actual roads:');
  console.log('   - Use the pen tool to draw along streets');
  console.log('   - Add waypoints at each turn');
  console.log('   - Set data-street attribute for each segment');
  console.log('5. Keep opacity="0" on the parent group so routes are invisible');
  console.log('6. Save the SVG file');
  console.log('\n=== PLACE IDS FOR REFERENCE ===');
  places.forEach(p => {
    console.log(`${p.id}: ${p.name} [${p.lat}, ${p.lng}]`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
