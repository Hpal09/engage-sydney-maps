import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting seed...");

  // Clear existing Place data (helpful for development)
  console.log("Clearing existing places...");
  await prisma.place.deleteMany();

  // Seed places from existing business data
  console.log("Creating places...");

  const places = await prisma.place.createMany({
    data: [
      // QVB - Main landmark
      {
        name: "Queen Victoria Building (QVB)",
        category: "Shopping Center",
        lat: -33.8718,
        lng: 151.2067,
        address: "455 George St, Sydney NSW 2000",
        priceRange: "$$$",
        shortDescription: "Heritage-listed shopping centre in Sydney CBD.",
        fullDescription:
          "A stunning heritage building housing over 180 retailers, cafes, and restaurants. Built in 1898, the QVB is one of Sydney's most iconic landmarks featuring beautiful stained glass windows, intricate tiled floors, and elegant Victorian architecture. The building contains a mix of fashion boutiques, specialty stores, and dining options across its three levels.",
        openingHours: "Mon-Wed: 9am-6pm, Thu: 9am-9pm, Fri-Sat: 9am-6pm, Sun: 11am-5pm",
        phone: "(02) 9264 9209",
        rating: 4.7,
        tags: ["shopping", "heritage", "landmark"],
        isLive: true,
      },
      // Chinatown area
      {
        name: "Market City Food Court",
        category: "Food Court",
        lat: -33.8788,
        lng: 151.2045,
        address: "9-13 Hay St, Haymarket NSW 2000",
        priceRange: "$",
        shortDescription: "Multiple food vendors offering Asian cuisines.",
        fullDescription:
          "Multiple food vendors in one convenient location offering Asian cuisines, fresh produce, and specialty items",
        openingHours: "Daily: 10am-9pm",
        tags: ["food court", "asian", "chinatown"],
        isLive: true,
      },
      {
        name: "Chat Thai",
        category: "Thai",
        lat: -33.8785,
        lng: 151.2048,
        address: "20 Campbell St, Haymarket NSW 2000",
        priceRange: "$$",
        shortDescription: "Authentic Thai dishes",
        fullDescription: "Authentic Thai dishes in the heart of Sydney's Chinatown",
        tags: ["thai", "restaurant", "asian"],
        isLive: true,
      },
      {
        name: "Golden Century",
        category: "Chinese",
        lat: -33.8795,
        lng: 151.205,
        address: "393-399 Sussex St, Sydney NSW 2000",
        priceRange: "$$$",
        shortDescription: "Popular seafood and Cantonese cuisine",
        fullDescription:
          "Popular seafood and Cantonese cuisine restaurant, a Sydney institution for late-night dining",
        tags: ["chinese", "seafood", "cantonese"],
        isLive: true,
      },
      {
        name: "Gumshara Ramen",
        category: "Japanese",
        lat: -33.879,
        lng: 151.2049,
        address: "Eating World, 25-29 Dixon St, Haymarket NSW 2000",
        priceRange: "$$",
        shortDescription: "Rich tonkotsu ramen",
        fullDescription: "Rich tonkotsu ramen, known for its thick and creamy broth",
        tags: ["japanese", "ramen", "asian"],
        isLive: true,
      },
      {
        name: "Mamak",
        category: "Malaysian",
        lat: -33.8792,
        lng: 151.2052,
        address: "15 Goulburn St, Haymarket NSW 2000",
        priceRange: "$",
        shortDescription: "Casual Malaysian street food",
        fullDescription: "Casual Malaysian street food, famous for roti canai and satay",
        tags: ["malaysian", "street food", "asian"],
        isLive: true,
      },
      {
        name: "Emperor's Garden",
        category: "Chinese",
        lat: -33.8789,
        lng: 151.2046,
        address: "213 Thomas St, Haymarket NSW 2000",
        priceRange: "$$",
        shortDescription: "Dim sum and BBQ favorites",
        fullDescription: "Dim sum and BBQ favorites in a classic Chinatown setting",
        tags: ["chinese", "dim sum", "bbq"],
        isLive: true,
      },
      // Darling Square area
      {
        name: "Darling Square Cafe",
        category: "Cafe",
        lat: -33.8755,
        lng: 151.202,
        address: "Darling Square, Darling Harbour NSW 2000",
        priceRange: "$$",
        shortDescription: "Modern cafe with great coffee",
        fullDescription: "Modern cafe with great coffee and brunch options in Darling Square",
        tags: ["cafe", "coffee", "brunch"],
        isLive: true,
      },
      {
        name: "Capitol Square Food",
        category: "Food Court",
        lat: -33.8765,
        lng: 151.2065,
        address: "730-742 George St, Sydney NSW 2000",
        priceRange: "$",
        shortDescription: "Multiple food options",
        fullDescription: "Multiple food options in a convenient CBD location",
        tags: ["food court", "quick lunch", "cbd"],
        isLive: true,
      },
      // CBD area
      {
        name: "Pitt Street Cafe",
        category: "Cafe",
        lat: -33.872,
        lng: 151.209,
        address: "Pitt St Mall, Sydney NSW 2000",
        priceRange: "$$",
        shortDescription: "Quick coffee and snacks",
        fullDescription: "Quick coffee and snacks in the heart of Pitt Street Mall",
        tags: ["cafe", "coffee", "quick bite"],
        isLive: true,
      },
      {
        name: "George Street Eats",
        category: "Fast Food",
        lat: -33.865,
        lng: 151.2075,
        address: "George St, Sydney NSW 2000",
        priceRange: "$",
        shortDescription: "Fast casual dining",
        fullDescription: "Fast casual dining with a variety of quick meal options",
        tags: ["fast food", "quick lunch", "casual"],
        isLive: true,
      },
      {
        name: "King Street Diner",
        category: "Cafe",
        lat: -33.864,
        lng: 151.2078,
        address: "King St, Sydney NSW 2000",
        priceRange: "$$",
        shortDescription: "All-day breakfast and lunch",
        fullDescription: "All-day breakfast and lunch in a cozy diner setting",
        tags: ["cafe", "breakfast", "lunch"],
        isLive: true,
      },
      {
        name: "Market Street Food Hall",
        category: "Food Court",
        lat: -33.868,
        lng: 151.208,
        address: "Market St, Sydney NSW 2000",
        priceRange: "$",
        shortDescription: "Various cuisines available",
        fullDescription: "Various cuisines available in this convenient CBD food hall",
        tags: ["food court", "variety", "cbd"],
        isLive: true,
      },
      {
        name: "Bathurst Street Grill",
        category: "Mexican",
        lat: -33.871,
        lng: 151.207,
        address: "Bathurst St, Sydney NSW 2000",
        priceRange: "$$",
        shortDescription: "Mexican and grill specialties",
        fullDescription: "Mexican and grill specialties with fresh ingredients and bold flavors",
        tags: ["mexican", "grill", "restaurant"],
        isLive: true,
      },
    ],
  });

  console.log(`✅ Created ${places.count} places`);

  // Seed admin user
  console.log("Creating admin user...");

  // Default admin credentials:
  // Email: admin@example.com
  // Password: Admin123!
  const passwordHash = await bcrypt.hash("Admin123!", 10);

  await prisma.adminUser.upsert({
    where: { email: "admin@example.com" },
    update: {
      passwordHash,
    },
    create: {
      email: "admin@example.com",
      passwordHash,
      role: "admin",
    },
  });

  console.log("✅ Admin user created (admin@example.com / Admin123!)");
  console.log("🌱 Seed completed!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:");
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
