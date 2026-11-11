import type { MetaFunction } from "react-router";
import { useLoaderData } from "react-router";

import styles from "./_index/styles.module.css";

export const meta: MetaFunction = () => [
  { title: "Privacy policy · Volume Discounts Plus" },
];

export const loader = async () => ({
  contact: process.env.SUPPORT_EMAIL || "",
});

/** Public privacy policy, linked from the App Store listing. */
export default function Privacy() {
  const { contact } = useLoaderData<typeof loader>();
  return (
    <div className={styles.index}>
      <div
        className={styles.content}
        style={{ textAlign: "left", maxWidth: 720 }}
      >
        <h1 className={styles.heading}>Privacy policy</h1>
        <p>Last updated 11 November 2026.</p>

        <h2>What the app does</h2>
        <p>
          Volume Discounts Plus lets Shopify merchants offer quantity-break
          discounts. It shows tier options on the product page and applies the
          discount at checkout.
        </p>

        <h2>Information we collect</h2>
        <p>When a merchant installs the app we store:</p>
        <ul>
          <li>
            the shop&rsquo;s domain and the access token Shopify issues to the
            app;
          </li>
          <li>
            the staff member&rsquo;s name, email and locale that Shopify shares
            when they open the app, used only to keep them signed in;
          </li>
          <li>the offers and settings the merchant creates in the app.</li>
        </ul>
        <p>
          The app does not collect, store or process any information about the
          shop&rsquo;s customers. It does not use cookies on the storefront,
          track shoppers, or read orders.
        </p>

        <h2>How we use it</h2>
        <p>
          Only to run the app: saving offers, creating the matching discounts in
          the merchant&rsquo;s Shopify admin, and showing the tiers on their
          product pages. We don&rsquo;t sell or share this information, and we
          don&rsquo;t use it for advertising.
        </p>

        <h2>Where it&rsquo;s stored</h2>
        <p>
          On a server we run on Amazon Web Services in London (eu-west-2),
          reached only over HTTPS.
        </p>

        <h2>Keeping and deleting data</h2>
        <p>
          When the app is uninstalled, its sessions are deleted straight away.
          Shopify then asks us to remove the shop&rsquo;s data 48 hours later,
          and we delete its offers and settings when that request arrives.
        </p>

        <h2>Your rights</h2>
        <p>
          You can ask to see, correct or delete the information we hold about
          you or your shop
          {contact ? (
            <>
              {" "}
              by emailing <a href={`mailto:${contact}`}>{contact}</a>
            </>
          ) : (
            " through the support contact on our Shopify App Store listing"
          )}
          .
        </p>
      </div>
    </div>
  );
}
