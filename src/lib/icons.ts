import {
  BarChart3,
  Bookmark,
  Calculator,
  Droplet,
  FlaskConical,
  FolderKanban,
  Gem,
  Handshake,
  Hotel,
  Hourglass,
  Inbox,
  LayoutDashboard,
  Package,
  Repeat,
  Route,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  Target,
  Timer,
  Trophy,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Stable icon keys used as data (tool/calculator configs, nav items) instead
 * of raw emoji. Add a key here before referencing it elsewhere.
 */
export const ICONS = {
  dashboard: LayoutDashboard,
  calculators: Calculator,
  saved: Bookmark,
  crm: Target,
  "crm-import": Inbox,
  tasks: FolderKanban,
  route: Route,
  "flask-conical": FlaskConical,
  "sliders-horizontal": SlidersHorizontal,
  "bar-chart": BarChart3,
  handshake: Handshake,
  trophy: Trophy,
  droplet: Droplet,
  "trending-up": TrendingUp,
  hourglass: Hourglass,
  gem: Gem,
  hotel: Hotel,
  repeat: Repeat,
  scale: Scale,
  package: Package,
  calculator: Calculator,
  wallet: Wallet,
  tag: Tag,
  timer: Timer,
  "shield-check": ShieldCheck,
} as const satisfies Record<string, LucideIcon>;

export type IconKey = keyof typeof ICONS;

export function getIcon(key: string): LucideIcon {
  return (ICONS as Record<string, LucideIcon>)[key] ?? Package;
}
