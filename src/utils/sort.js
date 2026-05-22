export function sortByCheckIn(arr) {
  return [...arr].sort((a, b) => {
    if (!a.checkIn && !b.checkIn) return 0;
    if (!a.checkIn) return 1;
    if (!b.checkIn) return -1;
    return a.checkIn.localeCompare(b.checkIn);
  });
}
