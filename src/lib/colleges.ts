export const COLLEGES: Record<string, string> = {
  "bu.edu": "Boston University",
  "northeastern.edu": "Northeastern",
  "tufts.edu": "Tufts",
  "mit.edu": "MIT",
  "harvard.edu": "Harvard",
  "emerson.edu": "Emerson",
  "bc.edu": "Boston College",
  "suffolk.edu": "Suffolk",
  "simmons.edu": "Simmons",
};

export function collegeFromEmail(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const hit = Object.keys(COLLEGES).find((d) => domain === d || domain.endsWith("." + d));
  return hit ? COLLEGES[hit] : "Other";
}
