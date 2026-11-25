// Where the first-minutes coach keeps its progress: the playing player's profile (settings.coachDone, settings.tipsSeen).
// The menu connects it (setCoachProfile); the HUD reads it when a run starts and reports progress back.
export interface CoachProfile {
  done: boolean;
  tipsSeen: string[];
}
let profile: CoachProfile = { done: true, tipsSeen: [] };
let save: (p: CoachProfile) => void = () => undefined;
export function setCoachProfile(p: CoachProfile, onChange: (p: CoachProfile) => void): void {
  profile = { done: p.done, tipsSeen: [...p.tipsSeen] };
  save = onChange;
}
export const coachProfile = (): CoachProfile => profile;
export function updateCoachProfile(change: Partial<CoachProfile>): void {
  profile = { ...profile, ...change, tipsSeen: [...(change.tipsSeen ?? profile.tipsSeen)] };
  save(profile);
}
