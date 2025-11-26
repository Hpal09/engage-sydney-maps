import { prisma } from "@/lib/prisma";
import { MapPin, Tag, Calendar, CheckCircle, MessageSquare, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default async function AdminDashboard() {
  // Fetch summary stats
  const [totalPlaces, livePlaces, liveDeals, upcomingEvents, pendingFeedback, totalFeedback] = await Promise.all([
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
    prisma.feedback.count({
      where: { status: "pending" },
    }),
    prisma.feedback.count(),
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

      {/* Feedback Alert */}
      {pendingFeedback > 0 && (
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-yellow-900">
                Pending Feedback
              </h3>
              <p className="text-sm text-yellow-700 mt-1">
                You have {pendingFeedback} feedback item{pendingFeedback !== 1 ? 's' : ''} waiting for review.
              </p>
              <Link
                href="/admin/feedback"
                className="inline-block mt-2 text-sm font-medium text-yellow-800 hover:text-yellow-900 underline"
              >
                Review feedback →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Welcome Message */}
      <div className="mt-6 bg-white rounded-lg shadow p-6 border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Welcome to Engage Sydney Admin
        </h2>
        <p className="text-gray-600 mb-4">
          Manage your places, deals, and events from this dashboard. Use the
          sidebar to navigate between different sections.
        </p>

        {totalFeedback > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MessageSquare className="h-4 w-4" />
              <span>
                <strong>{totalFeedback}</strong> total feedback submission{totalFeedback !== 1 ? 's' : ''} received
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
