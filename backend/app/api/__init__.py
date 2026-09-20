"""
backend/api/

API route modules. Each module is a FastAPI router that handles one
logical area (lectures, quiz, search, etc.) and gets included in main.py.

Structure:
- lectures.py — lecture upload, listing, retrieval, transcripts
- (quiz.py — quiz endpoints, added later)
- (search.py — search/transcript lookup, added later)
- (session.py — WebSocket for live teaching, added later)
"""