import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkDatabase() {
  console.log("🔍 Checking database connection...");
  console.log(`📍 Connection URL: ${process.env.DATABASE_URL?.replace(/:[^:@]*@/, ':****@')}`);

  try {
    await prisma.$connect();
    console.log("✅ Database connection successful!");

    // Try to query the database
    const result = await prisma.$queryRaw`SELECT current_database(), current_user, version()`;
    console.log("📊 Database info:", result);

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Database connection failed:");
    console.error(error);
    console.log("\n💡 Troubleshooting tips:");
    console.log("1. Make sure PostgreSQL is running on localhost:5432");
    console.log("2. Check your DATABASE_URL in .env file");
    console.log("3. Try: docker run --name engage-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres");

    await prisma.$disconnect();
    process.exit(1);
  }
}

checkDatabase();
