# AskMyBook

Upload a PDF, ask it anything.

## How it works

You upload a book → the app breaks it into chunks → embeds them into vectors → stores in Pinecone. When you ask something, it finds the closest chunks and feeds them to GPT which answers based on what's actually written in the book.

Built this to learn RAG properly.

## Stack

- Next.js 16 + TypeScript
- Clerk for auth
- MongoDB for storing book data
- Cloudinary for PDFs and images
- LangChain + OpenAI for processing and chat
- Pinecone for vector search

## Run it locally
```bash
git clone https://github.com/_ankush_09/askmybook.git
npm install
cp .env.example .env.local
# fill in the keys
npm run dev
```
