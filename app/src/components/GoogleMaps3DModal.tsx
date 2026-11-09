import React, { useState } from "react";
import {
  Check,
  Compass,
  Globe,
  KeyRound,
  Link2,
  MapPin,
  Sparkles,
  X,
} from "lucide-react";
import {
  GOOGLE_3D_PRESETS,
  Google3DLocationConfig,
  parseGoogleMapsCoordinates,
} from "../scene/google3DTilesLoader";

interface GoogleMaps3DModalProps {
  isOpen: boolean;
  currentConfig: Google3DLocationConfig;
  onClose: () => void;
  onApplyConfig: (config: Google3DLocationConfig) => void;
}

export const GoogleMaps3DModal: React.FC<GoogleMaps3DModalProps> = ({
  isOpen,
  currentConfig,
  onClose,
  onApplyConfig,
}) => {
  const [selectedId, setSelectedId] = useState<string>(currentConfig.id);
  const [customName, setCustomName] = useState<string>(currentConfig.name);
  const [latInput, setLatInput] = useState<string>(String(currentConfig.lat));
  const [lonInput, setLonInput] = useState<string>(String(currentConfig.lon));
  const [altInput, setAltInput] = useState<string>(String(currentConfig.alt));
  const [apiKeyInput, setApiKeyInput] = useState<string>(
    currentConfig.apiKey || ""
  );
  const [gmapsUrlInput, setGmapsUrlInput] = useState<string>("");
  const [parseFeedback, setParseFeedback] = useState<string>("");

  if (!isOpen) return null;

  const handleSelectPreset = (preset: Google3DLocationConfig) => {
    setSelectedId(preset.id);
    setCustomName(preset.name);
    setLatInput(String(preset.lat));
    setLonInput(String(preset.lon));
    setAltInput(String(preset.alt));
    setParseFeedback("");
  };

  const handleParseUrl = () => {
    const parsed = parseGoogleMapsCoordinates(gmapsUrlInput);
    if (parsed) {
      setSelectedId("custom_gps");
      setCustomName(
        `Khu vực Google Maps (${parsed.lat.toFixed(4)}°N, ${parsed.lon.toFixed(4)}°E)`
      );
      setLatInput(String(parsed.lat));
      setLonInput(String(parsed.lon));
      setParseFeedback(
        `Đã trích xuất tọa độ thành công: Vĩ độ ${parsed.lat}, Kinh độ ${parsed.lon}`
      );
    } else {
      setParseFeedback(
        "Không tìm thấy tọa độ hợp lệ. Hãy dán link Google Maps có dạng @10.7951,106.7219 hoặc nhập trực tiếp Lat, Lon."
      );
    }
  };

  const handleSaveAndFly = () => {
    const lat = parseFloat(latInput) || 10.7951;
    const lon = parseFloat(lonInput) || 106.7219;
    const alt = parseFloat(altInput) || 10;

    onApplyConfig({
      id: selectedId,
      name: customName || "Khu vực GPS Thực Tế",
      subtitle: `GPS (${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E)`,
      lat,
      lon,
      alt,
      apiKey: apiKeyInput.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-cyan-500/40 rounded-xl max-w-3xl w-full shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center">
              <Globe className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-wide text-white flex items-center gap-2">
                BẢN ĐỒ ĐÔ THỊ NÂNG CAO &amp; GOOGLE MAPS 3D (GPS THỰC TẾ)
                <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  DIGITAL TWIN + 3D TILES
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Chọn địa danh thực tế hoặc dán link Google Maps bất kỳ để dựng cảnh quan bay 3D
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* 1. Preset Famous GPS Locations */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-cyan-300 mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              1. Chọn nhanh Khu vực Thực địa Nổi tiếng (Việt Nam &amp; Thế giới)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {GOOGLE_3D_PRESETS.map((preset) => {
                const active = selectedId === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset)}
                    className={`text-left p-2.5 rounded-lg border transition cursor-pointer flex items-start justify-between gap-2 ${
                      active
                        ? "bg-cyan-500/15 border-cyan-400 text-white shadow"
                        : "bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        {preset.name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        {preset.subtitle}
                      </div>
                    </div>
                    {active && (
                      <span className="w-5 h-5 rounded-full bg-cyan-500 text-slate-950 flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Paste Google Maps URL or Coordinates */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-2.5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" />
              2. Hoặc dán Link từ Google Maps / Tọa độ bất kỳ trên thế giới
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={gmapsUrlInput}
                onChange={(e) => setGmapsUrlInput(e.target.value)}
                placeholder="Dán link Google Maps (VD: https://www.google.com/maps/@10.7951,106.7219,17z) hoặc 10.7951, 106.7219"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
              />
              <button
                onClick={handleParseUrl}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer shrink-0"
              >
                Trích xuất GPS
              </button>
            </div>
            {parseFeedback && (
              <p className="text-[11px] text-cyan-300 font-mono">{parseFeedback}</p>
            )}

            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <div>
                <span className="block text-[10px] text-slate-400 mb-1">
                  Vĩ độ (Latitude °N)
                </span>
                <input
                  type="number"
                  step="0.0001"
                  value={latInput}
                  onChange={(e) => {
                    setSelectedId("custom_gps");
                    setLatInput(e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                />
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 mb-1">
                  Kinh độ (Longitude °E)
                </span>
                <input
                  type="number"
                  step="0.0001"
                  value={lonInput}
                  onChange={(e) => {
                    setSelectedId("custom_gps");
                    setLonInput(e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                />
              </div>
              <div>
                <span className="block text-[10px] text-slate-400 mb-1">
                  Cao độ mặt đất (m)
                </span>
                <input
                  type="number"
                  step="1"
                  value={altInput}
                  onChange={(e) => setAltInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-cyan-300"
                />
              </div>
            </div>
          </div>

          {/* 3. Optional Google Photorealistic 3D Tiles API Key */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-2">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" />
              3. Google Cloud Map Tiles API Key (Tùy chọn - Dùng cho Photorealistic 3D Tiles)
            </label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Để trống để dùng Vệ tinh Esri World Imagery + Khối 3D Kiến Trúc (Miễn phí 100%)..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-400"
            />
            <p className="text-[11px] text-slate-400 leading-relaxed">
              • <strong className="text-emerald-300">Mặc định (Không cần API Key)</strong>: Tải trực tiếp ảnh vệ tinh độ phân giải cao từ <em>Esri World Imagery</em> đúng tọa độ GPS kết hợp dựng khối kiến trúc 3D sắc nét.
              <br />• <strong className="text-amber-300">Có Google API Key</strong>: Stream thêm lưới <em>Google Photorealistic 3D Tiles</em> chính thức qua <code>3d-tiles-renderer</code>.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-cyan-400" />
            Đang chọn: <strong className="text-white">{customName}</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
            >
              Đóng
            </button>
            <button
              onClick={handleSaveAndFly}
              className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold shadow cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              Nạp Khu Vực 3D &amp; Bay Ngay
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
