// Phosphor icons for categories. Uses the /ssr build, so it renders in both
// server and client components (no React context needed).
import {
  AirplaneIcon, ArrowsClockwiseIcon, ArrowsLeftRightIcon, ArrowUUpLeftIcon, BabyIcon, BankIcon, BarbellIcon, BeerBottleIcon,
  BookIcon, BriefcaseIcon, BusIcon, CakeIcon, CarIcon, ChurchIcon, CoffeeIcon, CoinsIcon, ConfettiIcon, CreditCardIcon,
  DeviceMobileIcon, DropIcon, FilmSlateIcon, ForkKnifeIcon, GameControllerIcon, GasPumpIcon, GiftIcon, GraduationCapIcon,
  HamburgerIcon, HammerIcon, HandHeartIcon, HandshakeIcon, HeartIcon, HouseIcon, LaptopIcon, LightbulbIcon, LightningIcon,
  MotorcycleIcon, MusicNotesIcon, PackageIcon, PawPrintIcon, PiggyBankIcon, PillIcon, PlantIcon, ReceiptIcon, ScissorsIcon,
  ShoppingBagIcon, ShoppingCartIcon, SparkleIcon, StethoscopeIcon, StorefrontIcon, TagIcon, TaxiIcon, TelevisionIcon,
  TrainIcon, TrendUpIcon, TShirtIcon, WalletIcon, WifiHighIcon, WrenchIcon,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";
import { categoryIconKey, type IconKey } from "@/lib/category-icons";

export const ICONS: Record<IconKey, Icon> = {
  ForkKnife: ForkKnifeIcon, Hamburger: HamburgerIcon, Coffee: CoffeeIcon, BeerBottle: BeerBottleIcon,
  ShoppingCart: ShoppingCartIcon, Bus: BusIcon, Car: CarIcon, Taxi: TaxiIcon, Motorcycle: MotorcycleIcon, Train: TrainIcon,
  GasPump: GasPumpIcon, Airplane: AirplaneIcon, Lightbulb: LightbulbIcon, Lightning: LightningIcon, Drop: DropIcon,
  WifiHigh: WifiHighIcon, DeviceMobile: DeviceMobileIcon, Television: TelevisionIcon, ArrowsClockwise: ArrowsClockwiseIcon,
  House: HouseIcon, Wrench: WrenchIcon, Hammer: HammerIcon, ShoppingBag: ShoppingBagIcon, TShirt: TShirtIcon, Pill: PillIcon,
  Stethoscope: StethoscopeIcon, Heart: HeartIcon, Barbell: BarbellIcon, GraduationCap: GraduationCapIcon, Book: BookIcon,
  FilmSlate: FilmSlateIcon, GameController: GameControllerIcon, MusicNotes: MusicNotesIcon, Scissors: ScissorsIcon,
  Sparkle: SparkleIcon, Gift: GiftIcon, Cake: CakeIcon, Baby: BabyIcon, PawPrint: PawPrintIcon, Plant: PlantIcon,
  Church: ChurchIcon, HandHeart: HandHeartIcon, Bank: BankIcon, CreditCard: CreditCardIcon, Receipt: ReceiptIcon,
  Package: PackageIcon, Briefcase: BriefcaseIcon, Storefront: StorefrontIcon, Laptop: LaptopIcon, Handshake: HandshakeIcon,
  TrendUp: TrendUpIcon, PiggyBank: PiggyBankIcon, Confetti: ConfettiIcon, ArrowUUpLeft: ArrowUUpLeftIcon, Coins: CoinsIcon,
  Wallet: WalletIcon, Tag: TagIcon,
};

type Props = {
  name?: string | null;
  icon?: string | null;
  size?: number;
  /** Draw the icon on a soft rounded tile (lists). Off for inline use. */
  tile?: boolean;
  className?: string;
};

/** A category's icon. Pass `transfer` via name="transfer" for money moved between accounts. */
export function CategoryIcon({ name, icon, size = 20, tile, className = "" }: Props) {
  const Glyph = name === "__transfer" ? ArrowsLeftRightIcon : ICONS[categoryIconKey(name, icon)];
  const glyph = <Glyph size={size} weight="duotone" className={tile ? "" : className} aria-hidden />;
  if (!tile) return glyph;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink ${className}`}
      style={{ width: size * 1.8, height: size * 1.8 }}
      aria-hidden
    >
      {glyph}
    </span>
  );
}
