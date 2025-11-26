import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedBuildingEntrances() {
  try {
    console.log('🌱 Seeding building entrances...\n');

    // First, get the Australian Museum building
    const museum = await prisma.building.findFirst({
      where: {
        name: {
          contains: 'Museum',
          mode: 'insensitive',
        },
      },
      include: {
        floors: true,
        Place: true,
      },
    });

    if (!museum) {
      console.error('❌ Australian Museum building not found in database');
      console.log('💡 Make sure to create the building first via the admin panel');
      return;
    }

    console.log(`✅ Found building: ${museum.name}`);
    console.log(`📍 Place GPS: ${museum.Place.lat}, ${museum.Place.lng}`);
    console.log(`🏢 Floors: ${museum.floors.map(f => f.name).join(', ')}\n`);

    // Find ground floor
    const groundFloor = museum.floors.find(f => f.floorNumber === 0);
    if (!groundFloor) {
      console.error('❌ Ground floor not found');
      return;
    }

    console.log(`📍 Ground floor ID: ${groundFloor.id}\n`);

    // Delete existing entrances for this building
    const deleted = await prisma.buildingEntrance.deleteMany({
      where: { buildingId: museum.id },
    });
    console.log(`🗑️  Deleted ${deleted.count} existing entrances\n`);

    // Museum entrance data
    // Note: You'll need to adjust these coordinates based on actual museum location
    const entrances = [
      {
        buildingId: museum.id,
        floorId: groundFloor.id,
        name: 'Main Entrance - William Street',
        type: 'main',
        // Outdoor GPS coordinates (approximate - adjust based on actual location)
        lat: museum.Place.lat + 0.0001, // Slightly north
        lng: museum.Place.lng,
        // Indoor SVG coordinates (approximate - adjust based on actual SVG)
        indoorX: 200,
        indoorY: 350,
        isAccessible: true,
        isOpen: true,
      },
      {
        buildingId: museum.id,
        floorId: groundFloor.id,
        name: 'Side Entrance - College Street',
        type: 'side',
        lat: museum.Place.lat,
        lng: museum.Place.lng + 0.0001, // Slightly east
        indoorX: 800,
        indoorY: 300,
        isAccessible: true,
        isOpen: true,
      },
      {
        buildingId: museum.id,
        floorId: groundFloor.id,
        name: 'Accessible Entrance',
        type: 'accessible',
        lat: museum.Place.lat - 0.0001, // Slightly south
        lng: museum.Place.lng,
        indoorX: 400,
        indoorY: 600,
        isAccessible: true,
        isOpen: true,
      },
    ];

    // Create entrances
    for (const entrance of entrances) {
      const created = await prisma.buildingEntrance.create({
        data: entrance,
      });
      console.log(`✅ Created entrance: ${created.name}`);
      console.log(`   📍 GPS: (${created.lat.toFixed(6)}, ${created.lng.toFixed(6)})`);
      console.log(`   🗺️  Indoor SVG: (${created.indoorX}, ${created.indoorY})\n`);
    }

    console.log(`\n🎉 Successfully seeded ${entrances.length} building entrances!`);
    console.log('\n💡 Next steps:');
    console.log('   1. Verify entrance coordinates in admin panel');
    console.log('   2. Test hybrid navigation from outdoor → indoor');
    console.log('   3. Adjust coordinates if needed\n');

  } catch (error) {
    console.error('❌ Error seeding building entrances:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedBuildingEntrances();
