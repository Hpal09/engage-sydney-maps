import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🏛️  Seeding Museum indoor navigation data...');

  // Museum coordinates
  const museumLat = -33.8636;
  const museumLng = 151.2114;

  // Find or create Museum place
  let museum = await prisma.place.findFirst({
    where: {
      lat: { gte: museumLat - 0.0001, lte: museumLat + 0.0001 },
      lng: { gte: museumLng - 0.0001, lte: museumLng + 0.0001 },
    },
  });

  if (!museum) {
    console.log('Creating Museum place...');
    museum = await prisma.place.create({
      data: {
        name: 'Sydney Museum',
        shortDescription: 'Historic museum with multi-level exhibits',
        category: 'Museum',
        tags: ['culture', 'history', 'indoor-nav'],
        lat: museumLat,
        lng: museumLng,
        isLive: true,
      },
    });
  }

  console.log(`Museum place: ${museum.name} (${museum.id})`);

  // Create or update building
  let building = await prisma.building.findUnique({
    where: { placeId: museum.id },
  });

  if (building) {
    console.log('Building already exists, deleting to recreate...');
    await prisma.building.delete({ where: { id: building.id } });
  }

  building = await prisma.building.create({
    data: {
      placeId: museum.id,
      name: 'Sydney Museum',
    },
  });

  console.log(`Building created: ${building.id}`);

  // Create floors
  const groundFloor = await prisma.floor.create({
    data: {
      buildingId: building.id,
      name: 'Ground Floor',
      floorNumber: 0,
      svgPath: '/maps/Mesuem - Ground Floor.svg',
    },
  });

  const levelOne = await prisma.floor.create({
    data: {
      buildingId: building.id,
      name: 'Level One',
      floorNumber: 1,
      svgPath: '/maps/Meseum - Level One.svg',
    },
  });

  console.log(`Floors created: Ground Floor (${groundFloor.id}), Level One (${levelOne.id})`);

  // Create connection points for Ground Floor
  const groundFloorConnections = [
    {
      type: 'stairs',
      name: 'Stair 1 West',
      x: 216,
      y: 365,
      isAccessible: false, // Stairs are not accessible
    },
    {
      type: 'stairs',
      name: 'Stair 2 East',
      x: 1148,
      y: 186,
      isAccessible: false,
    },
    {
      type: 'elevator',
      name: 'Elevator 1 West',
      x: 217,
      y: 331,
      isAccessible: true, // Elevators are accessible
    },
    {
      type: 'elevator',
      name: 'Elevator 2 East',
      x: 1127,
      y: 167,
      isAccessible: true,
    },
  ];

  // Create connection points for Level One
  const levelOneConnections = [
    {
      type: 'stairs',
      name: 'Stair 1 West',
      x: 241,
      y: 316,
      isAccessible: false,
    },
    {
      type: 'stairs',
      name: 'Stair 2 East',
      x: 1014,
      y: 156,
      isAccessible: false,
    },
    {
      type: 'elevator',
      name: 'Elevator 1 West',
      x: 217,
      y: 331,
      isAccessible: true,
    },
    {
      type: 'elevator',
      name: 'Elevator 2 East',
      x: 1127,
      y: 167,
      isAccessible: true,
    },
  ];

  // Create Ground Floor connection points
  const groundFloorPoints = await Promise.all(
    groundFloorConnections.map((conn) =>
      prisma.connectionPoint.create({
        data: {
          floorId: groundFloor.id,
          type: conn.type,
          name: conn.name,
          x: conn.x,
          y: conn.y,
          connectsToFloorId: levelOne.id,
          isAccessible: conn.isAccessible,
        },
      })
    )
  );

  // Create Level One connection points
  const levelOnePoints = await Promise.all(
    levelOneConnections.map((conn) =>
      prisma.connectionPoint.create({
        data: {
          floorId: levelOne.id,
          type: conn.type,
          name: conn.name,
          x: conn.x,
          y: conn.y,
          connectsToFloorId: groundFloor.id,
          isAccessible: conn.isAccessible,
        },
      })
    )
  );

  console.log(`✅ Created ${groundFloorPoints.length} connection points for Ground Floor`);
  console.log(`✅ Created ${levelOnePoints.length} connection points for Level One`);
  console.log('\n🎉 Museum indoor navigation data seeded successfully!');
  console.log('\nConnection Points Summary:');
  console.log('Ground Floor:', groundFloorConnections.map(c => c.name).join(', '));
  console.log('Level One:', levelOneConnections.map(c => c.name).join(', '));
}

main()
  .catch((e) => {
    console.error('Error seeding Museum data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
