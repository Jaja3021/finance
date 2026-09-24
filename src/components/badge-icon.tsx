import { PlantIcon, FireIcon, LightningIcon, TrophyIcon, DiamondIcon, CrownIcon, TargetIcon, ChartLineUpIcon, CheckCircleIcon } from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";

export const BADGE_ICONS: Record<string, Icon> = {
  first_log: PlantIcon,
  streak_3: FireIcon,
  streak_7: LightningIcon,
  streak_30: TrophyIcon,
  streak_100: DiamondIcon,
  tx_100: CrownIcon,
  first_budget: TargetIcon,
  first_investment: ChartLineUpIcon,
  under_budget: CheckCircleIcon,
};
