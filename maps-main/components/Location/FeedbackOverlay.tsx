"use client";

import { useState } from 'react';
import { X, Star, Send, MessageSquare } from 'lucide-react';

interface Props {
  placeId?: string;
  indoorPoiId?: string;
  placeName: string;
  onClose: () => void;
}

export default function FeedbackOverlay({ placeId, indoorPoiId, placeName, onClose }: Props) {
  const [rating, setRating] = useState<number | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [category, setCategory] = useState<string>('general');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const categories = [
    { value: 'general', label: 'General' },
    { value: 'accuracy', label: 'Info Accuracy' },
    { value: 'hours', label: 'Opening Hours' },
    { value: 'location', label: 'Location' },
    { value: 'other', label: 'Other' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!rating && !comment.trim()) {
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          placeId: placeId || null,
          indoorPoiId: indoorPoiId || null,
          rating,
          comment: comment.trim() || null,
          category,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }

      setSubmitStatus('success');

      // Close overlay after 1.5 seconds
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-200 p-5">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Share Feedback</h3>
            <p className="mt-1 text-sm text-gray-600">Help us improve info for {placeName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5">
          {/* Rating */}
          <div className="mb-5">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Rate this location (optional)
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(null)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-8 w-8 ${
                      (hoveredRating !== null ? star <= hoveredRating : star <= (rating || 0))
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div className="mb-5">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Feedback Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {categories.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Comment */}
          <div className="mb-5">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Your Feedback
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us about your experience or suggest improvements..."
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Submit Status */}
          {submitStatus === 'success' && (
            <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800">
              ✓ Thank you! Your feedback has been submitted.
            </div>
          )}
          {submitStatus === 'error' && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              Failed to submit feedback. Please try again.
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border-2 border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 hover:bg-gray-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || (!rating && !comment.trim())}
              className="flex-1 rounded-full bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex items-center justify-center gap-2">
                {isSubmitting ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit
                  </>
                )}
              </div>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
