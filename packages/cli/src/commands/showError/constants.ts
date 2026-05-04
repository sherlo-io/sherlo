// slug format: {teamId 8 alphanumeric + underscore}-{projectIndex digits}-(ios|android)-{unix ms 13 digits}
// example:     PsS5H1B1-30-android-1777491220857
export const SLUG_REGEX = /^[A-Za-z0-9_]{8}-\d+-(ios|android)-\d{13}$/;
