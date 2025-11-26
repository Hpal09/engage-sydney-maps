"use client";

import { useState } from "react";
import { Flag, TrendingUp, Star, Edit2, Check, X, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";

type Feedback = {
  id: string;
  placeId: string | null;
  indoorPoiId: string | null;
  rating: number | null;
  comment: string | null;
  category: string | null;
  status: string;
  isFlagged: boolean;
  isEscalated: boolean;
  adminNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
  Place: {
    id: string;
    name: string;
    category: string;
  } | null;
  IndoorPOI: {
    id: string;
    name: string;
    category: string | null;
  } | null;
};

type Props = {
  feedbacks: Feedback[];
};

export default function FeedbackTable({ feedbacks }: Props) {
  const router = useRouter();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesInput, setNotesInput] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterFlags, setFilterFlags] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const handleAction = async (
    feedbackId: string,
    action: string,
    value?: boolean | string
  ) => {
    try {
      const response = await fetch(`/api/admin/feedback/${feedbackId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, value }),
      });

      if (!response.ok) throw new Error("Failed to update feedback");

      router.refresh();
    } catch (error) {
      console.error("Error updating feedback:", error);
      alert("Failed to update feedback");
    }
  };

  const handleSaveNotes = async (feedbackId: string) => {
    await handleAction(feedbackId, "updateNotes", notesInput);
    setEditingNotes(null);
    setNotesInput("");
  };

  // Filter and sort feedbacks
  const filteredAndSortedFeedbacks = feedbacks
    .filter((feedback) => {
      if (filterStatus !== "all" && feedback.status !== filterStatus) return false;
      if (filterFlags === "flagged" && !feedback.isFlagged) return false;
      if (filterFlags === "escalated" && !feedback.isEscalated) return false;
      return true;
    })
    .sort((a, b) => {
      let compareValue = 0;

      switch (sortBy) {
        case "name":
          compareValue = (a.Place?.name || "").localeCompare(b.Place?.name || "");
          break;
        case "rating":
          compareValue = (a.rating || 0) - (b.rating || 0);
          break;
        case "category":
          compareValue = (a.Place?.category || "").localeCompare(b.Place?.category || "");
          break;
        case "date":
          compareValue = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        default:
          compareValue = 0;
      }

      return sortOrder === "asc" ? compareValue : -compareValue;
    });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "reviewed":
        return "bg-blue-100 text-blue-800";
      case "resolved":
        return "bg-green-100 text-green-800";
      case "dismissed":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div>
      {/* Filters and Sorting */}
      <div className="p-4 border-b border-gray-200 flex flex-wrap gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Flags
          </label>
          <select
            value={filterFlags}
            onChange={(e) => setFilterFlags(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          >
            <option value="all">All</option>
            <option value="flagged">Flagged Only</option>
            <option value="escalated">Escalated Only</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Sort By
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          >
            <option value="date">Date</option>
            <option value="name">Place Name</option>
            <option value="rating">Rating</option>
            <option value="category">Category</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Order
          </label>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Place
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rating
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredAndSortedFeedbacks.map((feedback) => (
              <>
                <tr key={feedback.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleRow(feedback.id)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${
                            expandedRows.has(feedback.id) ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {feedback.Place?.name || feedback.IndoorPOI?.name || "Unknown Location"}
                        </div>
                        <div className="text-xs text-gray-500">
                          {feedback.IndoorPOI ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="text-blue-600">Indoor:</span>
                              {feedback.IndoorPOI.category}
                            </span>
                          ) : (
                            feedback.Place?.category
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {feedback.rating ? (
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="text-sm font-medium">
                          {feedback.rating}/5
                        </span>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">N/A</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex rounded-full bg-gray-100 px-2 text-xs font-semibold text-gray-800">
                      {feedback.category || "general"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <select
                      value={feedback.status}
                      onChange={(e) =>
                        handleAction(feedback.id, "updateStatus", e.target.value)
                      }
                      className={`text-xs font-semibold rounded-full px-3 py-1 border-0 ${getStatusColor(
                        feedback.status
                      )}`}
                    >
                      <option value="pending">Pending</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="resolved">Resolved</option>
                      <option value="dismissed">Dismissed</option>
                    </select>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(feedback.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          handleAction(
                            feedback.id,
                            "toggleFlag",
                            !feedback.isFlagged
                          )
                        }
                        className={`p-1.5 rounded hover:bg-gray-100 ${
                          feedback.isFlagged
                            ? "text-red-600"
                            : "text-gray-400"
                        }`}
                        title={
                          feedback.isFlagged ? "Unflag" : "Flag for attention"
                        }
                      >
                        <Flag className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() =>
                          handleAction(
                            feedback.id,
                            "toggleEscalate",
                            !feedback.isEscalated
                          )
                        }
                        className={`p-1.5 rounded hover:bg-gray-100 ${
                          feedback.isEscalated
                            ? "text-purple-600"
                            : "text-gray-400"
                        }`}
                        title={feedback.isEscalated ? "De-escalate" : "Escalate"}
                      >
                        <TrendingUp className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Expanded Row */}
                {expandedRows.has(feedback.id) && (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 bg-gray-50">
                      <div className="space-y-4">
                        {/* Comment */}
                        {feedback.comment && (
                          <div>
                            <div className="text-xs font-medium text-gray-500 mb-1">
                              User Feedback
                            </div>
                            <div className="text-sm text-gray-900 bg-white p-3 rounded border border-gray-200">
                              {feedback.comment}
                            </div>
                          </div>
                        )}

                        {/* Admin Notes */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-xs font-medium text-gray-500">
                              Admin Notes
                            </div>
                            {editingNotes !== feedback.id && (
                              <button
                                onClick={() => {
                                  setEditingNotes(feedback.id);
                                  setNotesInput(feedback.adminNotes || "");
                                }}
                                className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                              >
                                <Edit2 className="h-3 w-3" />
                                Edit
                              </button>
                            )}
                          </div>

                          {editingNotes === feedback.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={notesInput}
                                onChange={(e) => setNotesInput(e.target.value)}
                                className="w-full text-sm border-gray-300 rounded p-2"
                                rows={3}
                                placeholder="Add internal notes..."
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSaveNotes(feedback.id)}
                                  className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 flex items-center gap-1"
                                >
                                  <Check className="h-3 w-3" />
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingNotes(null);
                                    setNotesInput("");
                                  }}
                                  className="px-3 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300 flex items-center gap-1"
                                >
                                  <X className="h-3 w-3" />
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm text-gray-600 bg-white p-3 rounded border border-gray-200 min-h-[60px]">
                              {feedback.adminNotes || (
                                <span className="italic text-gray-400">
                                  No notes yet
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>

        {filteredAndSortedFeedbacks.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No feedback found matching the filters
          </div>
        )}
      </div>
    </div>
  );
}
