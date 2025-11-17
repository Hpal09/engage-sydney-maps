import { prisma } from "@/lib/prisma";
import { MapPin, Tag, Calendar, CheckCircle } from "lucide-react";

export default async function AdminDashboard() {
  // Fetch summary stats
  const [totalPlaces, livePlaces, liveDeals, upcomingEvents] = await Promise.all([
    prisma.place.count(),
    prisma.place.count({ where: { isLive: true } }),
    prisma.deal.count({
      where: {
        isLive: true,
        endsAt: { gte: new Date() },
      },
    }),
    prisma.event.count({
      where: {
        startsAt: { gte: new Date() },
      },
    }),
  ]);

  const stats = [
    {
      name: "Total Places",
      value: totalPlaces,
      icon: MapPin,
      color: "bg-blue-500",
    },
    {
      name: "Live Places",
      value: livePlaces,
      icon: CheckCircle,
      color: "bg-green-500",
    },
    {
      name: "Active Deals",
      value: liveDeals,
      icon: Tag,
      color: "bg-purple-500",
    },
    {
      name: "Upcoming Events",
      value: upcomingEvents,
      icon: Calendar,
      color: "bg-orange-500",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="bg-white rounded-lg shadow p-6 border border-gray-200"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {stat.value}
                </p>
              </div>
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Welcome Message */}
      <div className="mt-8 bg-white rounded-lg shadow p-6 border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Welcome to Engage Sydney Admin
        </h2>
        <p className="text-gray-600">
          Manage your places, deals, and events from this dashboard. Use the
          sidebar to navigate between different sections.
        </p>
      </div>
    </div>
  );
}
