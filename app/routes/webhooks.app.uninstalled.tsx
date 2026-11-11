import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Shopify removes the app's discounts on uninstall. Keep the offers so a
  // reinstall can bring them back, but pause them and forget the old discount
  // ids; saving or activating an offer creates a fresh discount.
  await db.offer.updateMany({
    where: { shop },
    data: { discountId: null, status: "DRAFT" },
  });

  return new Response();
};
