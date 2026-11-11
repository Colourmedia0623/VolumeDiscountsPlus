import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Mandatory privacy webhooks. The app stores no customer data, only the
// merchant's offer settings, which are erased on shop/redact.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      break;
    case "SHOP_REDACT":
      await db.offer.deleteMany({ where: { shop } });
      await db.shopSettings.deleteMany({ where: { shop } });
      await db.session.deleteMany({ where: { shop } });
      break;
  }

  return new Response();
};
