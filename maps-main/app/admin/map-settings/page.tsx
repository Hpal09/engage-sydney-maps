"use client";

import { useState, useEffect } from "react";
import { Settings, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import type { ZoomConfig } from "@/types";

export default function MapSettingsPage() {
  const [config, setConfig] = useState<ZoomConfig>({
    initial: 2.5,
    placeStart: 2.8,
    destination: 2.8,
    navigation: 3.0,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Load current settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/map-settings");
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
        }
      } catch (error) {
        console.error("Failed to load map settings:", error);
        setMessage({
          type: "error",
          text: "Failed to load current settings. Using defaults.",
        });
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/map-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        throw new Error("Failed to save settings");
      }

      setMessage({
        type: "success",
        text: "Zoom settings saved successfully!",
      });

      // Clear success message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error("Failed to save map settings:", error);
      setMessage({
        type: "error",
        text: "Failed to save settings. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setConfig({
      initial: 2.5,
      placeStart: 2.8,
      destination: 2.8,
      navigation: 3.0,
    });
    setMessage(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-gray-700" />
          <h1 className="text-2xl font-bold text-gray-900">Map Zoom Settings</h1>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200 p-8">
        <div className="mb-6">
          <p className="text-gray-600">
            Configure the zoom levels for different map states. Higher values
            mean more zoomed in. Changes take effect after page refresh.
          </p>
        </div>

        {/* Message Banner */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
              message.type === "success"
                ? "bg-green-50 border border-green-200"
                : "bg-red-50 border border-red-200"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-600" />
            )}
            <p
              className={`text-sm font-medium ${
                message.type === "success" ? "text-green-800" : "text-red-800"
              }`}
            >
              {message.text}
            </p>
          </div>
        )}

        <div className="space-y-8">
          {/* Initial Zoom */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Initial Zoom (App Start)
            </label>
            <p className="text-sm text-gray-600 mb-4">
              The zoom level when the map first loads. Default: 2.5x
            </p>
            <div className="flex items-center gap-6">
              <input
                type="range"
                min="1"
                max="8"
                step="0.1"
                value={config.initial}
                onChange={(e) =>
                  setConfig({ ...config, initial: parseFloat(e.target.value) })
                }
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="8"
                  step="0.1"
                  value={config.initial}
                  onChange={(e) =>
                    setConfig({ ...config, initial: parseFloat(e.target.value) || 1 })
                  }
                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center font-semibold"
                />
                <span className="text-sm text-gray-600 font-medium w-6">x</span>
              </div>
            </div>
          </div>

          {/* Place Start Zoom */}
          <div className="pt-6 border-t">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Place Start Zoom (Starting Point Selected)
            </label>
            <p className="text-sm text-gray-600 mb-4">
              Zoom level when user selects a starting point. Default: 2.8x
            </p>
            <div className="flex items-center gap-6">
              <input
                type="range"
                min="1"
                max="8"
                step="0.1"
                value={config.placeStart}
                onChange={(e) =>
                  setConfig({ ...config, placeStart: parseFloat(e.target.value) })
                }
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="8"
                  step="0.1"
                  value={config.placeStart}
                  onChange={(e) =>
                    setConfig({ ...config, placeStart: parseFloat(e.target.value) || 1 })
                  }
                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center font-semibold"
                />
                <span className="text-sm text-gray-600 font-medium w-6">x</span>
              </div>
            </div>
          </div>

          {/* Destination Zoom */}
          <div className="pt-6 border-t">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Destination Zoom (Destination Selected)
            </label>
            <p className="text-sm text-gray-600 mb-4">
              Zoom level when user selects a destination. Default: 2.8x
            </p>
            <div className="flex items-center gap-6">
              <input
                type="range"
                min="1"
                max="8"
                step="0.1"
                value={config.destination}
                onChange={(e) =>
                  setConfig({ ...config, destination: parseFloat(e.target.value) })
                }
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="8"
                  step="0.1"
                  value={config.destination}
                  onChange={(e) =>
                    setConfig({ ...config, destination: parseFloat(e.target.value) || 1 })
                  }
                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center font-semibold"
                />
                <span className="text-sm text-gray-600 font-medium w-6">x</span>
              </div>
            </div>
          </div>

          {/* Navigation Zoom */}
          <div className="pt-6 border-t">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Navigation Zoom (Follow Mode)
            </label>
            <p className="text-sm text-gray-600 mb-4">
              Zoom level during navigation / follow mode. Default: 3.0x
            </p>
            <div className="flex items-center gap-6">
              <input
                type="range"
                min="1"
                max="8"
                step="0.1"
                value={config.navigation}
                onChange={(e) =>
                  setConfig({ ...config, navigation: parseFloat(e.target.value) })
                }
                className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="8"
                  step="0.1"
                  value={config.navigation}
                  onChange={(e) =>
                    setConfig({ ...config, navigation: parseFloat(e.target.value) || 1 })
                  }
                  className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-center font-semibold"
                />
                <span className="text-sm text-gray-600 font-medium w-6">x</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-4 mt-10 pt-6 border-t">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Settings"
            )}
          </button>

          <button
            onClick={handleReset}
            disabled={saving}
            className="px-6 py-2.5 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
          >
            Reset to Defaults
          </button>
        </div>

        {/* Info Note */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> These settings are stored in the database and
            will persist across deployments. Users will see the new zoom levels
            after refreshing the page.
          </p>
        </div>
      </div>
    </div>
  );
}
