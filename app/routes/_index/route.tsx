import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // No shop-domain login form: Shopify's App Store rules say merchants
  // install and open the app from Shopify, never by typing their domain.
  return null;
};

export default function App() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Volume Discounts Plus</h1>
        <p className={styles.text}>
          Quantity-break discounts that lift your average order value.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Tiered discounts</strong>. Buy 2 save 10%, buy 3 save 15%:
            percentage, amount off, or a fixed price per item.
          </li>
          <li>
            <strong>Product page picker</strong>. Shoppers choose a bundle size
            right above Add to cart, with savings shown on every option.
          </li>
          <li>
            <strong>Applied automatically</strong>. Discounts apply at checkout,
            with no codes for customers to type.
          </li>
        </ul>
        <p className={styles.text}>
          <a href="/privacy">Privacy policy</a>
        </p>
      </div>
    </div>
  );
}
