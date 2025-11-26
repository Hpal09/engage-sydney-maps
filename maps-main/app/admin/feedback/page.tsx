import { prisma } from "@/lib/prisma";
import FeedbackTable from "./FeedbackTable";
import { MessageSquare, AlertTriangle, Flag, TrendingUp } from "lucide-react";

export default async function FeedbackPage() {
  // Fetch feedback with place and indoor POI details
  const feedbacks = await prisma.feedback.findMany({
    include: {
      Place: {
        select: {
          id: true,
          name: true,
          category: true,
        },
      },
      IndoorPOI: {
        select: {
          id: true,
          name: true,
          category: true,
        },
      },
    },
    orderBy: [
      { isEscalated: "desc" },
      { isFlagged: "desc" },
      { createdAt: "desc" },
    ],
  });

  // Calculate stats
  const totalFeedback = feedbacks.length;
  const pendingFeedback = feedbacks.filter((f) => f.status === "pending").length;
  const flaggedFeedback = feedbacks.filter((f) => f.isFlagged).length;
  const escalatedFeedback = feedbacks.filter((f) => f.isEscalated).length;

  const stats = [
    {
      name: "Total Feedback",
      value: totalFeedback,
      icon: MessageSquare,
      color: "bg-blue-500",
    },
    {
      name: "Pending Review",
      value: pendingFeedback,
      icon: AlertTriangle,
      color: "bg-yellow-500",
    },
    {
      name: "Flagged",
      value: flaggedFeedback,
      icon: Flag,
      color: "bg-red-500",
    },
    {
      name: "Escalated",
      value: escalatedFeedback,
      icon: TrendingUp,
      color: "bg-purple-500",
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Feedback Management</h1>
        <p className="mt-1 text-sm text-gray-600">
          Review and manage user feedback for places and indoor POIs
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
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

      {/* Feedback Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <FeedbackTable feedbacks={feedbacks} />
      </div>
    </div>
  );
}
