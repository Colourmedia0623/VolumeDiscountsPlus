# Installing on your own stores (free, custom distribution)

The app is installed on **dyesublimationstore** and **giftboxes.co.uk** as a
*custom distribution* app. These apps are private and have no billing, so they
cost nothing to use. A custom distribution app can only be installed on the
one store it was created for, so each store gets its **own app**. Both apps
run the same code.

| | Store 1 | Store 2 |
| --- | --- | --- |
| Config name | `dyesublimationstore` | `giftboxes` |
| Config file | `shopify.app.dyesublimationstore.toml` | `shopify.app.giftboxes.toml` |
| Server | its own deployment | its own deployment |

You do steps 1–4 once for each store.

## 1. Create the app in your Partner account

On your computer, from the repo folder:

```sh
npm install
shopify app config link
```

- Choose **Create a new app**. Name it something like
  `Volume Discounts Plus – Dye Sublimation`.
- When it asks for a configuration file name, enter `dyesublimationstore`.
  For the second store, use `giftboxes`.

This creates `shopify.app.<name>.toml` with the new app's `client_id`. Commit
that file.

## 2. Host the admin server

The admin screens (where you create offers) need a small always-on Node server.
The discount logic and the product page block run on Shopify itself, but saving
an offer needs the server.

Deploy the repo's `Dockerfile` to any host that runs containers and has a
persistent disk. Mount the disk at **`/data`**: that's where the database is
kept, so your offers survive redeploys.

Set these environment variables on each deployment:

| Variable | Value |
| --- | --- |
| `SHOPIFY_API_KEY` | The app's Client ID (in the Partner Dashboard, under the app's API credentials) |
| `SHOPIFY_API_SECRET` | The app's Client secret (same page) |
| `SHOPIFY_APP_URL` | The deployment's public URL, e.g. `https://vdp-dyesub.onrender.com` |
| `SCOPES` | `write_discounts,read_products` |
| `PORT` | `3000` |

### On Render (using `render.yaml`)

1. In Render, choose **New → Blueprint** and pick this repo. This creates
   `vdp-dyesublimationstore` and `vdp-giftboxes`, each with a 1 GB disk at
   `/data`.
2. When it asks for the secrets, enter each app's Client ID and Client secret.
   For `SHOPIFY_APP_URL`, put a placeholder for now.
3. Once each service is live, copy its URL (e.g.
   `https://vdp-giftboxes.onrender.com`) into its `SHOPIFY_APP_URL` and
   redeploy that service.

## 3. Point the app at the server and deploy

Edit `shopify.app.<name>.toml`:

```toml
application_url = "https://YOUR-SERVER-URL"

[auth]
redirect_urls = [ "https://YOUR-SERVER-URL/api/auth" ]
```

Then deploy. This pushes the config, the discount Function and the theme
block to Shopify:

```sh
shopify app deploy --config dyesublimationstore
```

## 4. Install it on the store

1. In the Partner Dashboard, open the app and go to **Distribution**.
2. Choose **Custom distribution**. This can't be undone.
3. Enter the store's `.myshopify.com` domain. You'll find it in the store
   admin under Settings → Domains.
4. Open the install link it gives you while logged in to that store, and
   approve the install.

Then, in the app, create an offer and use **Add block in theme editor** to put
the tier picker on the product page.

## Updating later

After code changes, redeploy the server (step 2), then run
`shopify app deploy --config <name>` for each store.
