# Vercel Deployment

## Configure Neon

1. Create a Neon Postgres project and copy its pooled connection string (the host includes `-pooler`).
2. In Vercel, open the project settings and add `DATABASE_URL` under Environment Variables for Production and Preview.
3. Redeploy after saving the variable.

Do not commit the database URL or add it to frontend variables. The first account registered against an empty production database becomes the store owner. Later accounts are created as staff. The local demo account is only available in development.

## Deploy the fix

The root `server.js` exports the Express application for Vercel's Express integration. The Vercel build runs `npm run build`; Vite writes static assets to `public/`, where Vercel serves them from its CDN, while Express handles `/api` routes.

Commit and push the project changes to the GitHub repository connected to Vercel, or redeploy the latest commit from the Vercel dashboard after setting `DATABASE_URL`.
