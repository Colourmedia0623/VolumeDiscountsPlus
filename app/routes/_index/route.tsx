import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Volume Discounts Plus</h1>
        <p className={styles.text}>
          Quantity-break discounts that lift your average order value.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
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
            <strong>Applied automatically</strong>. Discounts run on Shopify
            Functions at checkout, with no codes for customers to type.
          </li>
        </ul>
      </div>
    </div>
  );
}
