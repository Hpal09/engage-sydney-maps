"use client";

import { useState } from 'react';
import { X, MapPin, Share2, GraduationCap, Info, Link, Calendar, Tag, Check, View } from 'lucide-react';
import type { Business } from '@/types';
import type { Deal, Event } from '@/lib/dataService';
import { formatEventCategory } from '@/lib/categories';

interface Props {
  location: Business | null;
  deals?: Deal[];
  events?: Event[];
  onClose: () => void;
  onSetStart: () => void;
  onSetDestination: () => void;
  onTakeMeThere: (business: Business) => void;
}

export default function LocationDetailModal({ location, deals = [], events = [], onClose, onSetStart, onSetDestination, onTakeMeThere }: Props) {
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied' | 'shared'>('idle');

  if (!location) return null;

  const handleShare = async () => {
    // Generate shareable URL with POI ID
    const url = new URL(window.location.href);
    url.searchParams.set('poi', location.id);
    const shareUrl = url.toString();

    const shareData = {
      title: location.name,
      text: `Check out ${location.name} - ${location.category}`,
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
            <h2 className="text-2xl font-bold text-gray-900">{location.name}</h2>
            <div className="mt-1 text-sm text-gray-600">{location.category}</div>
            <div className="mt-1 flex items-center gap-1 text-sm text-gray-500">
              <MapPin className="h-4 w-4" />
              <span>Sydney CBD</span>
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
            onClick={() => onTakeMeThere(location)}
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
              onClick={onSetStart}
              className="flex-1 rounded-full border-2 border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <div className="flex items-center justify-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full border-2 border-blue-500"></div>
                Set start
              </div>
            </button>
            <button
              onClick={onSetDestination}
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
        <div className="mx-5 mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-100 to-blue-200 flex-shrink-0">
          {location.imageUrl ? (
            <div className="h-48 w-full">
              <img
                src={location.imageUrl}
                alt={location.name}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center text-gray-400">
              <div className="text-center">
                <div className="text-6xl">🏛️</div>
                <div className="mt-2 text-sm">{location.name}</div>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
          {/* Overview Section */}
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <div className="rounded-full bg-teal-600 p-1.5">
                <Info className="h-4 w-4 text-white" />
              </div>
              Overview
            </div>
            <p className="text-gray-700">
              {location.description || 'A vibrant hub for campus life, offering dining, meeting spaces, event venues, and recreational areas for students and faculty.'}
            </p>
          </div>

          {/* Deals Section */}
          {deals.length > 0 && (
            <div className="mb-5">
              <div className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <div className="rounded-full bg-orange-600 p-1.5">
                  <Tag className="h-4 w-4 text-white" />
                </div>
                Active Deals ({deals.length})
              </div>
              <div className="space-y-3">
                {deals.map((deal) => (
                  <div key={deal.id} className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                    <h3 className="mb-1 font-semibold text-gray-900">{deal.title}</h3>
                    {deal.description && (
                      <p className="text-sm text-gray-700 mb-2">{deal.description}</p>
                    )}
                    <p className="text-xs text-orange-700 font-medium">
                      Valid until {new Date(deal.endsAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </p>
                    {deal.tags && deal.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {deal.tags.map((tag, idx) => (
                          <span key={idx} className="rounded-full bg-orange-200 px-2 py-0.5 text-xs text-orange-800">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Events Section */}
          {events.length > 0 && (
            <div className="mb-5">
              <div className="mb-3 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <div className="rounded-full bg-teal-600 p-1.5">
                  <Calendar className="h-4 w-4 text-white" />
                </div>
                Upcoming Events ({events.length})
              </div>
              <div className="space-y-3">
                {events.map((event) => (
                  <div key={event.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="font-semibold text-gray-900">{event.title}</h3>
                      <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
                        {formatEventCategory(event.category)}
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-sm text-gray-600 mb-2">{event.description}</p>
                    )}
                    <p className="text-xs text-gray-500 font-medium">
                      {new Date(event.startsAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                      {' - '}
                      {new Date(event.endsAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </p>
                    {event.tags && event.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {event.tags.map((tag, idx) => (
                          <span key={idx} className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hours & Info */}
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {location.hours && (
                <div>
                  <div className="font-medium text-gray-900">Hours</div>
                  <div className="text-gray-600">{location.hours}</div>
                </div>
              )}
              {location.priceRange && (
                <div>
                  <div className="font-medium text-gray-900">Price Range</div>
                  <div className="text-gray-600">{location.priceRange}</div>
                </div>
              )}
              {location.phone && (
                <div>
                  <div className="font-medium text-gray-900">Phone</div>
                  <div className="text-gray-600">{location.phone}</div>
                </div>
              )}
              {location.rating && (
                <div>
                  <div className="font-medium text-gray-900">Rating</div>
                  <div className="text-gray-600">⭐ {location.rating}/5</div>
                </div>
              )}
              <div>
                <div className="font-medium text-gray-900">Address</div>
                <div className="text-gray-600">455 George St, Sydney NSW 2000</div>
              </div>
              <div>
                <div className="font-medium text-gray-900">Category</div>
                <div className="text-gray-600">{location.category}</div>
              </div>
            </div>

            {/* Website URL */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <Link className={`h-4 w-4 ${location.website ? 'text-blue-600' : 'text-gray-400'}`} />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 text-sm">Website</div>
                  {location.website ? (
                    <a
                      href={location.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      Visit website →
                    </a>
                  ) : (
                    <div className="text-xs text-gray-400 italic">Link will be added soon</div>
                  )}
                </div>
              </div>
            </div>

            {/* AR Experience */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <View className="h-4 w-4 text-purple-600" />
                <div className="flex-1">
                  <div className="font-medium text-gray-900 text-sm">AR Experience</div>
                  <a
                    href="#ar-experience"
                    onClick={(e) => {
                      e.preventDefault();
                      // Placeholder - will open AR experience when URL is configured
                      alert('AR Experience coming soon! This will launch an immersive AR view of ' + location.name);
                    }}
                    className="text-sm text-purple-600 hover:text-purple-700 hover:underline cursor-pointer"
                  >
                    View in AR →
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Share Button */}
          <button
            onClick={handleShare}
            className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full py-3 font-medium transition-all ${
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
  );
}

