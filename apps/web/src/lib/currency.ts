const currencyFormatter = new Intl.NumberFormat("en-IN", {
  currency: "INR",
  style: "currency",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export const formatRupees = (paise: number): string => currencyFormatter.format(paise / 100);
