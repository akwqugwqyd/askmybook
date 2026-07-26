# AskMyBook

AskMyBook is a Next.js app for uploading PDFs and asking grounded questions against your own documents.

## Requirements

- Node.js 20+
- MongoDB
- Clerk
- Cloudinary
- OpenAI API key
- Pinecone index and API key

## Local setup

Install dependencies:

```bash
npm install
```

Create a local env file:

```powershell
Copy-Item .env.example .env.local
```

Fill in these required values:

```env
MONGODB_URI=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
OPENAI_API_KEY=
PINECONE_API_KEY=
PINECONE_INDEX=
```

Run the app:

```bash
npm run dev
```

## Checks

```bash
npm run lint
npm run type-check
npm run build
```

## Deploy

1. Push the repo to GitHub.
2. Import it into Vercel.
3. Add the same environment variables in Vercel.
4. Deploy.

## Notes

- The app uses Node.js runtime APIs for PDF processing.
- Chat answers are grounded in retrieved document chunks.
