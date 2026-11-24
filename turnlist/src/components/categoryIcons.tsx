import { Camera, ClipboardList, Grid3x3, PaintRoller, SprayCan, Trees, Truck, Wrench, type LucideIcon } from 'lucide-react';

export const GROUP_ICON: Record<string, LucideIcon> = {
  cleaning: SprayCan,
  painting: PaintRoller,
  maintenance: Wrench,
  landscaping: Trees,
  junk: Truck,
  flooring: Grid3x3,
  photography: Camera,
  other: ClipboardList,
};
export const iconForGroup = (g: string): LucideIcon => GROUP_ICON[g] ?? ClipboardList;
