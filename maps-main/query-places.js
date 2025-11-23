const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const places = await prisma.place.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      lat: true,
      lng: true,
      isLive: true
    },
    where: { isLive: true },
    orderBy: { name: 'asc' }
  });

  console.log('📍 Total locations:', places.length);
  console.log('\n=== All Locations ===');
  places.forEach((p, i) => {
    console.log(`${i + 1}. ${p.name} (${p.category}) - GPS: [${p.lat}, ${p.lng}]`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
