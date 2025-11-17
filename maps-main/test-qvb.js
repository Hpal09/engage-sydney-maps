const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const places = await prisma.place.findMany({
    where: {
      OR: [
        { name: { contains: 'QVB', mode: 'insensitive' } },
        { name: { contains: 'Queen Victoria', mode: 'insensitive' } }
      ]
    }
  });

  console.log('Found places:', places.map(p => ({
    name: p.name,
    lat: p.lat,
    lng: p.lng
  })));

  await prisma.$disconnect();
}

main().catch(console.error);
