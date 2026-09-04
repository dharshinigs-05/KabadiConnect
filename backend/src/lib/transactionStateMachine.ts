export const VALID_TRANSACTION_TRANSITIONS: Record<string, string[]> = {
  accepted: ['pickup_scheduled', 'cancelled'],
  pickup_scheduled: ['handed_over', 'cancelled'],
  handed_over: ['confirmed', 'cancelled'],
  confirmed: ['paid', 'cancelled'],
  paid: ['recycled'],
  recycled: [],
  cancelled: [],
};

export function isValidTransactionTransition(from: string, to: string): boolean {
  return (VALID_TRANSACTION_TRANSITIONS[from] ?? []).includes(to);
}
