

# Enterprise Knowledge Management System

## Overview
An internal knowledge assistant with RAG-powered chat, document management, role-based access, and an admin dashboard — all built on Lovable Cloud (free tier).

---

## 1. Authentication & Roles
- Email/password login with Supabase Auth
- Three roles: **Admin**, **HR**, **Developer** (stored in a dedicated `user_roles` table)
- Role-based route protection — users only see what they're allowed to
- Admin can manage everything; HR sees HR docs & CRM; Developers see technical docs

## 2. Database Schema
- **profiles** — user display info, linked to auth.users
- **user_roles** — role assignments (admin, hr, developer)
- **documents** — metadata (title, category, upload date, uploader)
- **document_chunks** — extracted text chunks with vector embeddings (pgvector)
- **chat_conversations** — conversation history per user
- **chat_messages** — individual messages with source references
- **crm_data** — sample customers, deals, revenue
- Row-level security on all tables enforcing role-based access

## 3. Document Upload System
- Upload page supporting PDF, DOCX, TXT, CSV files
- Files stored in Supabase Storage (private bucket with RLS)
- Edge function to extract text from uploaded documents
- Text is chunked and embeddings are generated via Lovable AI
- Chunks + embeddings stored in `document_chunks` for vector search
- Documents categorized as HR, Technical, or General

## 4. RAG Chat Assistant
- Clean chat interface with message history
- When a user asks a question:
  1. Generate embedding for the query
  2. Vector similarity search against document chunks (filtered by user's role/access)
  3. Top relevant chunks sent as context to Lovable AI
  4. Streaming response displayed in chat
- Sources shown below each answer (document name, relevant excerpt)
- Chat history persisted per user

## 5. Pre-loaded Sample Data
- **CRM dataset**: ~20 sample customers, deals, and revenue figures
- **HR policies**: Sample leave policy, code of conduct, benefits guide
- **Technical docs**: Sample API documentation, architecture overview, onboarding guide
- All seeded via database migrations on first setup

## 6. Sidebar Navigation & Pages
- **Dashboard** — Overview stats (document count, recent activity, quick search)
- **Upload Documents** — Drag-and-drop file upload with category selection
- **Chat Assistant** — Full-screen chat with streaming AI responses and source citations
- **Admin Panel** (Admin only) — Manage users/roles, view all documents, delete documents, see usage stats

## 7. UI Design
- Professional enterprise theme with clean typography
- Collapsible sidebar navigation
- Responsive layout for desktop and tablet
- Dark/light mode support
- Cards, tables, and charts for the dashboard

## 8. Security
- RLS policies on every table
- `has_role()` security definer function to prevent recursive RLS
- Documents filtered by role — HR docs only visible to HR/Admin, tech docs to Developers/Admin
- File storage bucket with RLS policies
- All AI calls routed through edge functions (no client-side secrets)

## 9. Edge Functions
- **process-document** — Receives uploaded file, extracts text, chunks it, generates embeddings, stores in DB
- **chat** — Handles RAG query: embeds question, searches vectors, calls Lovable AI with context, streams response
- **embed** — Utility to generate embeddings via Lovable AI for both documents and queries

## 10. Tech Stack Summary
- **Frontend**: React + Tailwind + shadcn/ui
- **Backend**: Lovable Cloud (Supabase edge functions)
- **Database**: Supabase PostgreSQL + pgvector
- **Storage**: Supabase Storage
- **AI**: Lovable AI (free tier included)
- **Auth**: Supabase Auth

