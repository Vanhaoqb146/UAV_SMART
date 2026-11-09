import { MapPreset } from "./proceduralEnvironment";

export interface MapOptionMeta {
  id: MapPreset;
  title: string;
  shortLabel: string;
  desc: string;
  complexityBadge: string;
}

export const ALL_CURRICULUM_MAPS: Record<MapPreset, MapOptionMeta> = {
  airbase: {
    id: "airbase",
    title: "Cấp 1: Sân Tập Cơ Bản",
    shortLabel: "CẤP 1: SÂN TẬP CƠ BẢN (ĐƠN GIẢN)",
    desc: "Mặt sân phẳng, vạch kẻ chuẩn ICAO, thoáng đãng dễ quan sát",
    complexityBadge: "Đơn giản",
  },
  forest: {
    id: "forest",
    title: "Cấp 2: Địa Hình Rừng 3D",
    shortLabel: "CẤP 2: THUNG LŨNG & RỪNG CÂY 3D",
    desc: "Cây cổ thụ có tán lá va chạm vật lý & suối tự nhiên",
    complexityBadge: "Trung bình",
  },
  urban: {
    id: "urban",
    title: "Cấp 3: Sa Bàn Đô Thị",
    shortLabel: "CẤP 3: SA BÀN KHU PHỐ ĐÔ THỊ 3D",
    desc: "Khối nhà cao tầng tiêu chuẩn & hành lang hẻm phố",
    complexityBadge: "Khá",
  },
  landmark81: {
    id: "landmark81",
    title: "Cấp 4: Đô Thị Landmark 81",
    shortLabel: "CẤP 4: ĐÔ THỊ LANDMARK 81 (DIGITAL TWIN)",
    desc: "Tháp Landmark 81, cao ốc kính, cầu Metro & Sông Sài Gòn",
    complexityBadge: "Nâng cao",
  },
  google3d: {
    id: "google3d",
    title: "Cấp 4+: Google Maps 3D (GPS)",
    shortLabel: "CẤP 4+: GOOGLE MAPS 3D (THEO TỌA ĐỘ GPS)",
    desc: "Ảnh vệ tinh thực tế & 3D Tiles theo tọa độ GPS toàn cầu",
    complexityBadge: "Nâng cao",
  },
  tactical: {
    id: "tactical",
    title: "Cấp 5: Sa Bàn Tác Chiến Đêm",
    shortLabel: "CẤP 5: SA BÀN TÁC CHIẾN ĐÊM",
    desc: "Môi trường ánh sáng yếu, đèn dẫn đường & gió giật mạnh",
    complexityBadge: "Sát hạch",
  },
  photogrammetry: {
    id: "photogrammetry",
    title: "Bờ Biển Thực Địa",
    shortLabel: "BỜ BIỂN THỰC ĐỊA",
    desc: "Địa hình bờ biển",
    complexityBadge: "Phụ trợ",
  },
  bellus: {
    id: "bellus",
    title: "Làng Cổ Thực Địa",
    shortLabel: "LÀNG CỔ THỰC ĐỊA",
    desc: "Địa hình làng cổ",
    complexityBadge: "Phụ trợ",
  },
};

export interface CurriculumTierGroup {
  tierNumber: number;
  title: string;
  subtitle: string;
  defaultMap: MapPreset;
  allowedMaps: MapPreset[];
  exerciseIds: string[];
  badgeColor: string;
}

/**
 * Defines the progressive Exercise-by-Map Curriculum from Simple -> Advanced.
 * Early exercises only allow simple maps; advanced maps unlock progressively.
 */
export const CURRICULUM_TIERS: CurriculumTierGroup[] = [
  {
    tierNumber: 1,
    title: "CẤP 1: SÂN TẬP CƠ BẢN (BẢN ĐỒ ĐƠN GIẢN)",
    subtitle: "Làm quen cần điều khiển, cất/hạ cánh & bay quỹ đạo chuẩn trên sân phẳng",
    defaultMap: "airbase",
    allowedMaps: ["airbase"],
    exerciseIds: ["BT01", "BT02", "BT03", "BT04", "BT05", "BT06"],
    badgeColor: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  },
  {
    tierNumber: 2,
    title: "CẤP 2: ĐỊA HÌNH VẬT CẢN & RỪNG CÂY 3D",
    subtitle: "Luyện phản xạ né trụ tiêu trong gió giật & bay xuyên rừng cây cổ thụ",
    defaultMap: "forest",
    allowedMaps: ["forest", "airbase"],
    exerciseIds: ["BT07", "BT09"],
    badgeColor: "text-sky-400 border-sky-500/30 bg-sky-500/10",
  },
  {
    tierNumber: 3,
    title: "CẤP 3: ĐÔ THỊ HIỆN ĐẠI & CAO ỐC 3D NÂNG CAO",
    subtitle: "Luồn lách hẻm phố cao tầng, tuần tra Landmark 81 & đáp Helipad sân thượng",
    defaultMap: "landmark81",
    allowedMaps: ["urban", "landmark81", "google3d"],
    exerciseIds: ["BT10", "BT12", "BT13"],
    badgeColor: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  },
  {
    tierNumber: 4,
    title: "CẤP 4: SÁT HẠCH TÁC CHIẾN ĐÊM & LIÊN HỢP GPS",
    subtitle: "Kiểm tra tổng hợp toàn trình trong đêm & chiến dịch tuần tra đường dài",
    defaultMap: "tactical",
    allowedMaps: ["tactical", "google3d", "landmark81", "forest", "airbase"],
    exerciseIds: ["BT08", "BT11"],
    badgeColor: "text-rose-400 border-rose-500/30 bg-rose-500/10",
  },
];

export function getTierForExercise(exerciseId: string): CurriculumTierGroup {
  return (
    CURRICULUM_TIERS.find((t) => t.exerciseIds.includes(exerciseId)) ||
    CURRICULUM_TIERS[0]
  );
}

export function getAllowedMapsForExercise(exerciseId: string): MapOptionMeta[] {
  const tier = getTierForExercise(exerciseId);
  return tier.allowedMaps.map((mId) => ALL_CURRICULUM_MAPS[mId]);
}
