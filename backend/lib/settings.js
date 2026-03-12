function normalizeSettings(input = {}) {
  const normalizeAmount = (amount) => {
    const n = Number(amount);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100) / 100;
  };
  const baseCheckingBalance = normalizeAmount(input.baseCheckingBalance);
  const baseSavingsBalance = normalizeAmount(input.baseSavingsBalance);
  const monthlyBudget = normalizeAmount(input.monthlyBudget);
  return {
    baseCheckingBalance: baseCheckingBalance === null ? 4500 : baseCheckingBalance,
    baseSavingsBalance: baseSavingsBalance === null ? 0 : Math.max(0, baseSavingsBalance),
    monthlyBudget: monthlyBudget === null ? 3000 : Math.max(0, monthlyBudget),
  };
}

module.exports = { normalizeSettings };
