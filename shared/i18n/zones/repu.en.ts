import type { repuFr } from './repu.fr';

export const repuEn: Record<keyof typeof repuFr, string> = {
  "rep.tier1": "Passing customer",
  "rep.tier2": "Bar-stool regular",
  "rep.tier3": "Running a tab",
  "rep.tier4": "Legend of the bar",
  "rep.stars": "{n} reputation star{s}",
  "rep.quarters": "Districts completed: {n} of {max}",
  "rep.source": "Earned on the Bar Crawl (solo 421).",
  "rep.aria": "Reputation: {n} stars, {tier}",
  "rep.table": "A table of connoisseurs",
  "rep.tableBest": "{tier} at the table (★ {n})",
};
