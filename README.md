# 📚 AI Book SaaS - AI-Powered PDF Chat Application

Upload a PDF, ask it anything using AI-powered semantic search and RAG (Retrieval-Augmented Generation).

---

## 📋 Features

- 📄 **PDF Upload & Processing** - Upload PDFs, automatically stored in Cloudinary
- 🤖 **AI Chat Interface** - Ask questions about your PDFs with intelligent AI responses
- 🔍 **Vector Search & RAG** - Semantic search using embeddings + retrieval-augmented generation
- 👤 **User Authentication** - Secure user management with Clerk
- 📚 **Book Management** - Create, view, and delete your uploaded books
- 🎨 **Modern UI** - Responsive dark-themed interface with Tailwind CSS
- 🔒 **Security** - User-level data isolation via Pinecone namespaces
- ⏱️ **Rate Limiting** - 10 free requests per user per 24 hours (rolling window)

---

## 🏗️ Project Structure

### **Root Level**
```
package.json              # Dependencies & scripts
tsconfig.json             # TypeScript configuration
next.config.ts            # Next.js configuration
eslint.config.mjs         # ESLint rules
postcss.config.mjs        # Tailwind CSS config
components.json           # shadcn/ui components config
```

### **📱 `/app` - Next.js App (Core Application)**

#### **Pages & Layout**
```
layout.tsx                # Main layout wrapper
globals.css               # Global Tailwind styles
(root)/page.tsx           # Home page (hero + book grid)
```

#### **📚 `/books` - Book Management**
```
[id]/page.tsx             # Book detail page
[id]/chat/page.tsx        # Chat interface (MAIN FEATURE)
new/page.tsx              # Upload new book page
```

#### **🔧 `/api` - Backend API Routes**

**Books API:**
- `POST /api/books` - Create new book (upload PDF to Cloudinary, save metadata to MongoDB)
- `GET /api/books` - List all user's books
- `GET /api/books/[id]` - Fetch single book details

**Chat & RAG:**
- `POST /api/chat` - **CORE ENDPOINT** - Takes user question → searches Pinecone for relevant PDF chunks → generates answer via OpenAI GPT-3.5-turbo → enforces rate limit (3 requests/24h)
- `POST /api/upload` - Upload PDF file to Cloudinary

**Payment System (Disabled):**
- `GET /api/payment/status` - ✅ **ACTIVE** - Returns user's rate limit status (requests used/remaining)
- `POST /api/payment/checkout` - Disabled (returns 503)
- `GET /api/payment/verify` - Disabled (returns 503)
- `POST /api/payment/webhook` - Disabled (returns 503)

**Health Check:**
- `GET /api/health` - Returns 200 if app is running

### **🗄️ `/database` - MongoDB Models**

```
mongoose.ts               # MongoDB connection initialization
models/book.model.ts      # Book schema (title, author, coverImage, pdfUrl, userId, timestamps)
models/user.model.ts      # User schema (userId, email, requestCount, lastRequestReset, timestamps)
```

### **📦 `/components` - React Components**

```
Navbar.tsx                # Navigation with Clerk auth
HeroSection.tsx           # Landing page hero section
BookGrid.tsx              # Grid display of books
BookCard.tsx              # Individual book card
ui/button.tsx             # Reusable button component (shadcn/ui)
```

### **📚 `/lib` - Utilities & Integrations**

```
requestLimit.ts           # Rate limiting logic (3 requests/24h)
langchain.ts              # RAG pipeline (embeddings + Pinecone + OpenAI)
pinecone.ts               # Pinecone vector DB client
cloudinary.ts             # Cloudinary file upload client
utils.ts                  # Helper utilities
```

### **📁 `/public` - Static Assets**

```
/assets                   # Images, icons, logos
```

---

## 🔄 How It Works (Data Flow)

### **User Journey**

```
1. Sign Up
   ↓
   Clerk authenticates → Creates user record in MongoDB

2. Upload PDF
   ↓
   PDF uploaded → Stored in Cloudinary → Book metadata saved in MongoDB

3. View Book
   ↓
   Fetches from MongoDB → Displays cover + metadata

4. Ask Question (RAG Pipeline)
   ↓
   Rate limit check:
   
   ✅ If allowed (< 3 requests):
      • Split PDF into chunks using LangChain
      • Create embeddings (OpenAI text-embedding-3-small)
      • Store in Pinecone (userId-namespaced for isolation)
      • Query Pinecone for most similar chunks
      • Send chunks + question to GPT-3.5-turbo
      • Return answer + increment requestCount
   
   ❌ If limit exceeded:
      • Return HTTP 429 "10 requests per 24 hours"

5. Wait 24 Hours
   ↓
   requestCount resets to 0, can ask 3 more questions
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+**
- **MongoDB Atlas** account (free tier available at mongodb.com/cloud/atlas)
- **Clerk** account (authentication, free tier at clerk.com)
- **Cloudinary** account (file storage, free tier at cloudinary.com)
- **OpenAI API** key (for embeddings + chat, get at platform.openai.com)
- **Pinecone** account (vector database, free tier at pinecone.io)

### Local Development Setup

#### **1. Clone and Install**

```bash
git clone https://github.com/your-username/ai-book-saas.git
cd ai-book-saas
npm install
```

#### **2. Create `.env.local` with All Variables**

```bash
# MongoDB
MONGODB_URI=mongodb+srv://user:password@cluster0.mongodb.net/ai-book-saas

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx

# OpenAI (embeddings + chat)
OPENAI_API_KEY=sk-proj-xxxxx

# Pinecone Vector Database
PINECONE_API_KEY=pcn-xxxxx
PINECONE_INDEX_NAME=ai-book-index
PINECONE_NAMESPACE_PREFIX=user

# Cloudinary File Storage
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=123456789
CLOUDINARY_API_SECRET=abc123def456
```

#### **3. Start Development Server**

```bash
npm run dev
```

Visit `http://localhost:3000` and test:
- Sign up with Clerk
- Upload a PDF
- Ask 10 questions (verify rate limiting works)
- Try 11th question (should get 429 error)

---

## 📦 Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 19, TypeScript, Tailwind CSS, shadcn/ui | UI components & styling |
| **Framework** | Next.js 16 | Full-stack (frontend + backend) |
| **Backend** | Next.js API Routes | Serverless functions |
| **Auth** | Clerk | User signup/login/management |
| **Database** | MongoDB + Mongoose | Store books & user rate limits |
| **AI/LLM** | OpenAI | Text embeddings + chat responses |
| **Vector DB** | Pinecone | Semantic search for PDF chunks |
| **RAG** | LangChain | Orchestrate embeddings + retrieval + chat |
| **File Storage** | Cloudinary | PDF & image hosting |
| **Deployment** | Vercel (recommended) | Serverless hosting |

---

## 🧪 Testing

### **Rate Limiting Test**

```bash
npm run dev
# 1. Open http://localhost:3000
# 2. Upload a PDF
# 3. Go to book → chat
# 4. Ask 10 questions
#    - Verify counter shows "10/10" → "9/10" → ... → "0/10"
# 5. Try 11th question
#    - Should get 429 error: "10 requests per 24 hours. Please try again tomorrow."
```

### **API Testing**

```bash
# Check app health
curl http://localhost:3000/api/health

# Check rate limit status (requires auth token)
curl http://localhost:3000/api/payment/status \
  -H "Authorization: Bearer <clerk-token>"
```

---

## 🏗️ Build & Deployment

### **Local Testing**

```bash
# Type checking
npm run type-check          # Zero errors

# Linting
npm run lint                # No ESLint errors

# Production build
npm run build               # Builds .next folder
```

### **Deploy to Vercel (Recommended)**

#### **Step 1: Push to GitHub**

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/your-username/ai-book-saas.git
git branch -M main
git push -u origin main
```

#### **Step 2: Deploy on Vercel**

```bash
# Option A: CLI
npm i -g vercel
vercel                      # Follow prompts

# Option B: Dashboard
# 1. Go to vercel.com/dashboard
# 2. Click "Add New" → "Project"
# 3. Select "ai-book-saas" from GitHub
# 4. Click "Deploy"
```

#### **Step 3: Add Environment Variables**

On Vercel Dashboard:
1. Click your project → **Settings**
2. Click **Environment Variables** (left sidebar)
3. Add all 9 variables from `.env.local`
4. Select all environments (Production, Preview, Development)
5. Click "Redeploy"

#### **Step 4: Verify Deployment**

```bash
# Your app is live at: https://ai-book-saas-xxx.vercel.app
# Test:
# 1. Sign up
# 2. Upload PDF
# 3. Test chat (3 requests)
# 4. Verify rate limiting
```

#### **Step 5: Auto-Deploy**

Now every push to GitHub automatically deploys:

```bash
# Make changes
git add .
git commit -m "Update feature"
git push origin main        # Vercel auto-deploys
```

### **Alternative: Deploy to Other Platforms**

**Railway.app:**
```bash
# 1. Push to GitHub
# 2. Go to railway.app
# 3. New Project → Deploy from GitHub
# 4. Select repo
# 5. Add 9 environment variables
# 6. Deploy
```

**Render.com:**
```bash
# 1. Push to GitHub
# 2. Go to render.com
# 3. New Web Service → Connect GitHub
# 4. Build: npm install && npm run build
# 5. Start: npm run start
# 6. Add environment variables
# 7. Deploy
```

**Traditional VPS (DigitalOcean, AWS EC2, Linode):**
```bash
# SSH into server
ssh root@your-server.com

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs npm

# Clone & setup
git clone https://github.com/your-username/ai-book-saas.git
cd ai-book-saas
npm install
nano .env.local              # Add all 9 variables

# Build
npm run build

# Start with PM2
sudo npm i -g pm2
pm2 start "npm run start" --name ai-book-saas
pm2 startup && pm2 save

# Setup Nginx reverse proxy + SSL
# (See Vercel deployment for better managed experience)
```

---

## 📝 Available Scripts

```bash
npm run dev                  # Start development server (port 3000)
npm run build               # Build production bundle
npm run start               # Start production server
npm run type-check          # TypeScript type checking
npm run lint                # ESLint code linting
```

---

## 🔐 Environment Variables Reference

| Variable | Source | Purpose |
|----------|--------|---------|
| `MONGODB_URI` | MongoDB Atlas | Database connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard | Public authentication key |
| `CLERK_SECRET_KEY` | Clerk Dashboard | Secret authentication key |
| `OPENAI_API_KEY` | OpenAI Platform | GPT-3.5 and embeddings API |
| `PINECONE_API_KEY` | Pinecone Dashboard | Vector database access |
| `PINECONE_INDEX_NAME` | Pinecone Dashboard | Your vector index name |
| `PINECONE_NAMESPACE_PREFIX` | Custom | Set to "user" for isolation |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloudinary Dashboard | Cloud name for uploads |
| `CLOUDINARY_API_KEY` | Cloudinary Dashboard | API key for uploads |
| `CLOUDINARY_API_SECRET` | Cloudinary Dashboard | API secret for uploads |

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Run `npm run type-check` to see TypeScript errors |
| App won't start | Check `.env.local` has all 9 variables |
| Upload fails | Verify Cloudinary credentials in `.env.local` |
| Chat returns error | Check OpenAI API key is valid |
| Rate limiting not working | Verify MongoDB connection |
| Clerk auth fails | Check Clerk keys match your app |

---

## 📄 License

MIT License - feel free to use for any purpose

---

## 🤝 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review environment variables
3. Check MongoDB, Clerk, OpenAI, Pinecone dashboards for API errors
4. Test locally first before deploying

---

## 🚀 Next Steps

1. ✅ Set up all service accounts (MongoDB, Clerk, OpenAI, Pinecone, Cloudinary)
2. ✅ Create `.env.local` with all variables
3. ✅ Run locally: `npm run dev`
4. ✅ Test rate limiting with 3+ requests
5. ✅ Deploy to Vercel: `npm i -g vercel && vercel --prod`
6. ✅ Add environment variables on Vercel dashboard
7. ✅ Test on production URL

**Happy building! 🎉**

## 🏗️ Architecture & Stack

### Frontend
- **Next.js 16** - React framework
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Radix UI** - Accessible components

### Backend
- **Next.js API Routes** - Serverless backend
- **Node.js** - Runtime
- **TypeScript** - Type safety

### Integrations
- **Clerk** - Authentication & user management
- **MongoDB** - Book metadata and user request tracking
- **Mongoose** - ODM for MongoDB
- **Cloudinary** - PDF and image storage
- **OpenAI** - LLM and embeddings
- **LangChain** - AI orchestration
- **Pinecone** - Vector database
- **pdf2json** - PDF text extraction

## 📦 Deployment

### Option 1: Vercel (Recommended for Next.js)

```bash
npm i -g vercel
vercel login
vercel
```

Then add all environment variables in Vercel dashboard under Project Settings → Environment Variables.

### Option 2: Docker

```bash
# Build and run with Docker Compose
docker-compose up -d

# Check health
curl http://localhost:3000/api/health
```

### Option 3: Manual Deployment

```bash
npm run build
npm run start
```

## 📊 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/books` | Create book |
| GET | `/api/books` | List user's books |
| GET | `/api/books/:id` | Get book details |
| DELETE | `/api/books/:id` | Delete book |
| POST | `/api/chat` | Send chat message (rate limited: 3/day) |
| POST | `/api/upload` | Upload file to Cloudinary |

## 🧪 Testing

```bash
# Run tests
npm run test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## ✅ Code Quality

```bash
# Type checking
npm run type-check

# Linting
npm run lint

# Fix linting issues
npm run lint:fix
```

## 🔐 Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
MONGODB_URI=mongodb+srv://...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
OPENAI_API_KEY=sk-...
PINECONE_API_KEY=your_api_key
PINECONE_INDEX=your_index_name
```

## 🔄 CI/CD Pipeline

GitHub Actions workflow automatically:
- ✅ Runs linting on every PR
- ✅ Type checks TypeScript
- ✅ Builds the project
- ✅ Deploys to Vercel on merge to main

See `.github/workflows/deploy.yml` for configuration.

## 📝 How It Works

1. **Upload PDF** → File stored in Cloudinary
2. **Process PDF** → Text extracted and split into chunks
3. **Generate Embeddings** → Chunks embedded using OpenAI
4. **Store Vectors** → Embeddings stored in Pinecone
5. **User Query** → Question embedded and similar chunks retrieved
6. **Generate Response** → GPT generates answer based on context
7. **Stream Response** → Answer sent back to user

## 🛠️ Development

```bash
# Format code
npm run lint:fix

# Type check
npm run type-check

# Development with hot reload
npm run dev
```

## 🚨 Troubleshooting

### OpenAI Quota Error
**Issue:** `429 You exceeded your current quota`

**Solution:**
1. Go to https://platform.openai.com/account/billing/overview
2. Check usage and add payment method
3. Generate new API key if needed

### PDF Not Processing
**Solution:**
1. Check Cloudinary credentials
2. Verify OpenAI API key has sufficient quota
3. Check Pinecone index exists and is accessible
4. Review console logs: `npm run dev`

### Database Connection Issues
**Solution:**
1. Verify MongoDB connection string
2. Check IP whitelist in MongoDB Atlas
3. Test connection with: `/api/health`

## 📄 License

MIT

## 🤝 Contributing

Pull requests are welcome! Please ensure:
- All tests pass
- Code is linted
- No TypeScript errors
- Changes are documented

## 📞 Support

For issues and questions, please open a GitHub issue.

## 🔗 Links

- [Next.js Docs](https://nextjs.org/docs)
- [LangChain Docs](https://docs.langchain.com)
- [OpenAI API Docs](https://platform.openai.com/docs)
- [Pinecone Docs](https://docs.pinecone.io)
- [Clerk Docs](https://clerk.com/docs)

