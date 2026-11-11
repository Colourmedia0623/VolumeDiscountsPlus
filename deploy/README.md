# Running the app on EC2

The setup is the same as LoyaltyWise and GiftWise. Every push to `main` that
passes CI is built into a Docker image on GitHub's runners. The image is
loaded onto the EC2 instance and restarted with Docker Compose. Only the
`deploy/` folder is copied to the server. Caddy serves each address over
HTTPS, with certificates it fetches and renews itself.

There's no public app. Each store gets its own **private, free copy**
(custom distribution). Each copy has its own Shopify app, address and
database, and they all run from the same image on one instance:

| Copy | Store | Config | Address |
| --- | --- | --- | --- |
| `dyesub` | Dye Sublimation Store | `shopify.app.dyesub.toml` | `dyesub.volumediscounts.colourmedia.net` |
| `giftboxes` | giftboxes.co.uk | `shopify.app.giftboxes.toml` | `giftboxes.volumediscounts.colourmedia.net` |

There's no billing code, so neither store pays anything.

## One-time setup

### 1. Launch the instance

In the EC2 console (London, eu-west-2):

- **Name:** `volumediscounts`
- **AMI:** Ubuntu Server 24.04 LTS
- **Instance type:** t3.micro (both copies together use about 300 MB)
- **Key pair:** create a new one called `volumediscounts` and download the `.pem` file
- **Security group:** allow SSH (22), HTTP (80) and HTTPS (443) from anywhere
- **Storage:** 20 GB
- **Advanced details → User data:** paste the contents of `deploy/ec2-user-data.sh`

Then allocate an **Elastic IP** and associate it with the instance, so the
address survives restarts.

### 2. DNS (GoDaddy, colourmedia.net)

Add two A records pointing at the Elastic IP:

| Type | Name | Data |
| --- | --- | --- |
| A | `dyesub.volumediscounts` | the Elastic IP |
| A | `giftboxes.volumediscounts` | the Elastic IP |

### 3. Create each store's app in Shopify

Do this for each store. In the Shopify Dev Dashboard:

1. Create an app, e.g. **Volume Discounts Plus – Dye Sublimation Store**.
2. Choose **Custom distribution** and enter that store's `.myshopify.com`
   domain.
3. Copy its **Client ID** into `client_id` in `shopify.app.dyesub.toml` (or
   `shopify.app.giftboxes.toml`) and commit it. Keep the **Client secret**
   for the next step.
4. Under Settings, generate an **App Automation Token**.

### 4. Add GitHub secrets

In the GitHub repo, **Settings → Secrets and variables → Actions**:

| Name | Value |
| --- | --- |
| `EC2_HOST` | The Elastic IP |
| `EC2_SSH_KEY` | The whole contents of `volumediscounts.pem` |
| `SHOPIFY_DYESUB_API_SECRET` | Dye Sublimation app's Client secret |
| `SHOPIFY_DYESUB_AUTOMATION_TOKEN` | Its App Automation Token |
| `SHOPIFY_GIFTBOXES_API_SECRET` | Gift Boxes app's Client secret |
| `SHOPIFY_GIFTBOXES_AUTOMATION_TOKEN` | Its App Automation Token |

A copy only runs once it has both a client ID in its toml and its secret, so
you can set up one store first and add the other later.

### 5. Deploy

1. Run **Deploy to EC2** from the Actions tab (or push to `main`). It checks
   that each address answers over HTTPS.
2. Run **Push Shopify app config** once for each store (`dyesub`, then
   `giftboxes`). This sends the URLs, scopes, webhooks, the discount Function
   and the theme block to Shopify.
3. Open the install link from the Dev Dashboard (Distribution) while logged
   in to the store, and approve the install.
4. In the app, create an offer, then use **Add block in theme editor** to put
   the tier picker on the product template.

## Day to day

- Logs: `ssh -i volumediscounts.pem ubuntu@<EC2_HOST>` then
  `cd /opt/volumediscounts/src/deploy && docker compose --profile dyesub --profile giftboxes logs -f`
- Each copy's SQLite database lives in its own Docker volume
  (`dyesub-data`, `giftboxes-data`) and survives deploys.
- After changing a `shopify.app.*.toml` or an extension, run **Push Shopify
  app config** for that store again.

## Adding another store

Copy one of the `shopify.app.*.toml` files and add a service, volume and
profile in `deploy/docker-compose.yml`. Add the store to the loop and secrets
in `.github/workflows/deploy.yml`, and to the choices in `shopify-config.yml`.
Then follow steps 2–5 for it.
