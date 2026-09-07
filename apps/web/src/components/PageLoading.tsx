import { CoffeeCup } from "./CoffeeCup.js";

export const PageLoading = () => (
  <div className="page-loading" role="status" aria-label="Loading menu">
    <CoffeeCup />
    <p>Brewing something good…</p>
  </div>
);
