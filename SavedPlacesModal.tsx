import React, { useState } from 'react';
import { SavedLocationItem, CityLocation } from '../types';
import { POPULAR_CITIES } from '../data/mockWeatherData';
import { X, Plus, Trash2, MapPin, Check, Bookmark } from 'lucide-react';

interface SavedPlacesModalProps {
  savedLocations: SavedLocationItem[];
  onSelectLocation: (loc: SavedLocationItem) => void;
  onAddLocation: (loc: SavedLocationItem) => void;
  onDeleteLocation: (id: string) => void;
  onClose: () => void;
}

export const SavedPlacesModal: React.FC<SavedPlacesModalProps> = ({
  savedLocations,
  onSelectLocation,
  onAddLocation,
  onDeleteLocation,
  onClose
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [label, setLabel] = useState('');
  const [selectedCityId, setSelectedCityId] = useState(POPULAR_CITIES[0].id);
  const [category, setCategory] = useState<'home' | 'college' | 'office' | 'travel' | 'gym' | 'park' | 'custom'>('home');

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'home': return '🏠';
      case 'office': return '💼';
      case 'college': return '🎓';
      case 'travel': return '🏖️';
      case 'gym': return '🏋️';
      case 'park': return '🌳';
      default: return '📍';
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;

    const cityObj = POPULAR_CITIES.find((c) => c.id === selectedCityId) || POPULAR_CITIES[0];

    const newItem: SavedLocationItem = {
      id: `loc_${Date.now()}`,
      label: label.trim(),
      cityName: cityObj.name,
      lat: cityObj.lat,
      lon: cityObj.lon,
      category,
      icon: getCategoryIcon(category),
      createdAt: new Date().toISOString()
    };

    onAddLocation(newItem);
    setLabel('');
    setShowAddForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Bookmark className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Saved Important Places</h3>
              <p className="text-xs text-slate-400">Quickly toggle weather between Home, Work, and Travel</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-slate-700 hover:border-purple-400/60 bg-slate-800/40 hover:bg-slate-800/80 text-xs font-bold text-slate-300 transition-all"
            >
              <Plus className="w-4 h-4 text-purple-400" />
              <span>Add New Saved Location</span>
            </button>
          ) : (
            <form onSubmit={handleSave} className="p-4 rounded-2xl bg-slate-800/90 border border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Save Custom Place</span>
                <button type="button" onClick={() => setShowAddForm(false)} className="text-xs text-slate-400 hover:text-white">
                  Cancel
                </button>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Label (e.g. My Gym, Grandma's House)</label>
                <input
                  type="text"
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Bandra Studio"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-purple-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">City / Region</label>
                  <select
                    value={selectedCityId}
                    onChange={(e) => setSelectedCityId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-purple-400"
                  >
                    {POPULAR_CITIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.state})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-purple-400"
                  >
                    <option value="home">Home (🏠)</option>
                    <option value="office">Office (💼)</option>
                    <option value="college">College (🎓)</option>
                    <option value="travel">Travel (🏖️)</option>
                    <option value="gym">Gym (🏋️)</option>
                    <option value="park">Park (🌳)</option>
                    <option value="custom">Custom (📍)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-colors"
              >
                Save Place
              </button>
            </form>
          )}

          {/* List of saved places */}
          <div className="space-y-2">
            {savedLocations.map((loc) => (
              <div
                key={loc.id}
                className="flex items-center justify-between p-3 rounded-2xl bg-slate-800/70 border border-slate-700/80 hover:border-slate-600 transition-all"
              >
                <div
                  onClick={() => {
                    onSelectLocation(loc);
                    onClose();
                  }}
                  className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
                >
                  <div className="text-xl p-2 rounded-xl bg-slate-900 border border-slate-800 shrink-0">
                    {loc.icon || getCategoryIcon(loc.category)}
                  </div>
                  <div className="truncate">
                    <span className="text-xs font-bold text-white block truncate">{loc.label}</span>
                    <span className="text-[11px] text-slate-400 block truncate">{loc.cityName}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <button
                    onClick={() => {
                      onSelectLocation(loc);
                      onClose();
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                  >
                    View Weather
                  </button>
                  <button
                    onClick={() => onDeleteLocation(loc.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                    title="Delete location"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 bg-slate-900 border-t border-slate-800 text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
