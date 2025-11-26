"use client";

import { useState } from 'react';
import { X, MapPin, Share2, Info, Link, Check, Tag, Clock, DollarSign, Phone, MessageSquare } from 'lucide-react';
import FeedbackOverlay from './FeedbackOverlay';

interface IndoorPOI {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  hours?: string | null;
  priceRange?: string | null;
  imageUrl?: string | null;
  website?: string | null;
  phone?: string | null;
  tags?: string[];
}

interface IndoorPOIModalProps {
  poi: IndoorPOI;
  onClose: () => void;
  onSetStart?: () => void;
  onSetDestination?: () => void;
  onTakeMeThere?: () => void;
}

export default function IndoorPOIModal({ poi, onClose, onSetStart, onSetDestination, onTakeMeThere }: IndoorPOIModalProps) {
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'shared'>('idle');
  const [showFeedback, setShowFeedback] = useState(false);

  const handleShare = async () => {
    // Generate shareable URL with POI ID
    const url = new URL(window.location.href);
    url.searchParams.set('indoorPoi', poi.id);
    const shareUrl = url.toString();

    const shareData = {
      title: poi.name,
      text: `Check out ${poi.name}${poi.category ? ` - ${poi.category}` : ''}`,
      url: shareUrl,
    };

    try {
      // Try Web Share API first (works on mobile)
      if (navigator.share) {
        await navigator.share(shareData);
        setShareStatus('shared');
        setTimeout(() => setShareStatus('idle'), 2000);
      } else {
        // Fallback to clipboard copy
        await navigator.clipboard.writeText(shareUrl);
        setShareStatus('copied');
        setTimeout(() => setShareStatus('idle'), 2000);
      }
    } catch (error) {
      // If sharing was cancelled or failed, try clipboard as last resort
      if (error instanceof Error && error.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(shareUrl);
          setShareStatus('copied');
          setTimeout(() => setShareStatus('idle'), 2000);
        } catch (clipboardError) {
          console.error('Failed to share:', clipboardError);
        }
      }
    }
  };


  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0">
      <div className="w-full max-w-2xl rounded-t-3xl bg-white shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Handle bar */}
        <div className="flex justify-center pt-3 flex-shrink-0">
          <div className="h-1 w-12 rounded-full bg-gray-300"></div>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-3 flex-shrink-0">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">{poi.name}</h2>
            {poi.category && (
              <div className="mt-1 text-sm text-gray-600">{poi.category}</div>
            )}
            <div className="mt-1 flex items-center gap-1 text-sm text-gray-500">
              <MapPin className="h-4 w-4" />
              <span>Indoor Location</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-gray-100 p-2 hover:bg-gray-200"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3 px-5 pb-4 flex-shrink-0">
          {/* Primary Action: Take me there */}
          <button
            onClick={() => {
              if (onTakeMeThere) {
                onTakeMeThere();
              }
            }}
            className="w-full rounded-full bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 font-semibold text-white shadow-lg hover:from-blue-700 hover:to-blue-800"
          >
            <div className="flex items-center justify-center gap-2">
              <MapPin className="h-5 w-5" />
              Take me there
            </div>
          </button>

          {/* Secondary Actions */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                if (onSetStart) {
                  onSetStart();
                }
              }}
              className="flex-1 rounded-full border-2 border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <div className="flex items-center justify-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full border-2 border-blue-500"></div>
                Set start
              </div>
            </button>
            <button
              onClick={() => {
                if (onSetDestination) {
                  onSetDestination();
                }
              }}
              className="flex-1 rounded-full border-2 border-blue-600 bg-white px-4 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50"
            >
              <div className="flex items-center justify-center gap-2">
                <MapPin className="h-4 w-4" />
                Set destination
              </div>
            </button>
          </div>
        </div>

        {/* Image */}
        <div className="mx-5 mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-green-100 to-emerald-200 flex-shrink-0">
          {poi.imageUrl ? (
            <div className="h-48 w-full">
              <img
                src={poi.imageUrl}
                alt={poi.name}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center text-gray-400">
              <div className="text-center">
                <div className="text-6xl">📍</div>
                <div className="mt-2 text-sm">{poi.name}</div>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
          {/* Overview Section */}
          {poi.description && (
            <div className="mb-5">
              <div className="mb-2 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <div className="rounded-full bg-teal-600 p-1.5">
                  <Info className="h-4 w-4 text-white" />
                </div>
                Overview
              </div>
              <p className="text-gray-700">{poi.description}</p>
            </div>
          )}

          {/* Hours & Info */}
          <div className="rounded-xl bg-gray-50 p-4 mb-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {poi.hours && (
                <div>
                  <div className="font-medium text-gray-900">Hours</div>
                  <div className="text-gray-600">{poi.hours}</div>
                </div>
              )}
              {poi.priceRange && (
                <div>
                  <div className="font-medium text-gray-900">Price Range</div>
                  <div className="text-gray-600">{poi.priceRange}</div>
                </div>
              )}
              {poi.phone && (
                <div>
                  <div className="font-medium text-gray-900">Phone</div>
                  <div className="text-gray-600">{poi.phone}</div>
                </div>
              )}
              {poi.category && (
                <div>
                  <div className="font-medium text-gray-900">Category</div>
                  <div className="text-gray-600">{poi.category}</div>
                </div>
              )}
            </div>

            {/* Website URL */}
            {poi.website && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  <Link className="h-4 w-4 text-blue-600" />
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 text-sm">Website</div>
                    <a
                      href={poi.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      Visit website →
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Tags */}
          {poi.tags && poi.tags.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
                <Tag className="h-4 w-4" />
                Tags
              </div>
              <div className="flex flex-wrap gap-2">
                {poi.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons: Feedback & Share */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowFeedback(true)}
              className="flex-1 flex items-center justify-center gap-2 rounded-full py-3 font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
            >
              <MessageSquare className="h-4 w-4" />
              Feedback
            </button>

            <button
              onClick={handleShare}
              className={`flex-1 flex items-center justify-center gap-2 rounded-full py-3 font-medium transition-all ${
                shareStatus === 'idle'
                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'bg-green-100 text-green-700'
              }`}
            >
              {shareStatus === 'idle' ? (
                <>
                  <Share2 className="h-4 w-4" />
                  Share Location
                </>
              ) : shareStatus === 'copied' ? (
                <>
                  <Check className="h-4 w-4" />
                  Link Copied!
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Shared!
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Feedback Overlay */}
      {showFeedback && (
        <FeedbackOverlay
          indoorPoiId={poi.id}
          placeName={poi.name}
          onClose={() => setShowFeedback(false)}
        />
      )}
    </div>
  );
}
