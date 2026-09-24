"""Public release mounts only the authorized adaptive API."""
import os
import ipaddress
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / '.env')
from fastapi import FastAPI, Request
from botocore.exceptions import BotoCoreError, ClientError
from fastapi.responses import JSONResponse
from backend.app.core.db import init_db
from backend.app.adaptive.api import router
from backend.app.adaptive.budget import AllowanceExceeded

@asynccontextmanager
async def lifespan(app):
    init_db()
    # Validate explicit configuration without invoking cloud services.
    from backend.app.services.storage import get_storage_adapter
    get_storage_adapter()
    if os.getenv('APP_ENV') == 'production' and not os.getenv('APP_ORIGIN', '').startswith('https://'):
        raise RuntimeError('Production requires an HTTPS APP_ORIGIN')
    yield

app = FastAPI(title='Blindspot Edu', version='0.2.0', lifespan=lifespan)
app.include_router(router, prefix='/api/v1')

@app.exception_handler(AllowanceExceeded)
async def allowance(request, exc):
    return JSONResponse({'detail': str(exc)}, status_code=429)

@app.exception_handler(BotoCoreError)
@app.exception_handler(ClientError)
@app.exception_handler(RuntimeError)
async def unavailable(request, exc):
    return JSONResponse({'detail': 'This service is unavailable or not configured. Saved lessons and source playback remain available.'}, status_code=503)

@app.exception_handler(ValueError)
async def invalid_generation(request, exc):
    return JSONResponse({'detail': 'The generated response could not be verified. Please try again or continue with the saved lesson.'}, status_code=422)

@app.get('/health')
def health():
    return {'status': 'ok', 'release': 'adaptive-v1'}

class TooLarge(Exception):
    pass

class BoundaryMiddleware:
    def __init__(self, app):
        self.inner = app
        self.requests = defaultdict(deque)

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.inner(scope, receive, send)
        headers = dict(scope['headers'])
        method = scope['method']
        origin = headers.get(b'origin', b'').decode()
        expected = os.getenv('APP_ORIGIN', 'http://localhost:3000')
        allowed_origins = {expected}
        if os.getenv('ALLOWED_ORIGINS'):
            allowed_origins.update(o.strip() for o in os.getenv('ALLOWED_ORIGINS').split(',') if o.strip())
        if os.getenv('APP_ENV') != 'production':
            allowed_origins.update({
                'http://localhost:3000',
                'http://localhost:3100',
                'http://127.0.0.1:3000',
                'http://127.0.0.1:3100',
            })
        origin_allowed = not origin or origin in allowed_origins
        if not origin_allowed and os.getenv('APP_ENV') != 'production':
            try:
                parsed = urlparse(origin)
                host = parsed.hostname
                if host in ('localhost', '127.0.0.1'):
                    origin_allowed = True
                elif host:
                    ip = ipaddress.ip_address(host)
                    if ip.is_private or ip.is_loopback:
                        origin_allowed = True
            except (ValueError, AttributeError):
                pass
        if method not in ('GET', 'HEAD', 'OPTIONS') and not origin_allowed:
            return await JSONResponse({'detail': 'Cross-origin request rejected'}, status_code=403)(scope, receive, send)
        ip = scope.get('client', ('unknown',))[0]
        now = time.monotonic()
        queue = self.requests[ip]
        while queue and queue[0] < now - 60:
            queue.popleft()
        if len(queue) >= 180:
            return await JSONResponse({'detail': 'Request limit reached; try again shortly'}, status_code=429)(scope, receive, send)
        queue.append(now)
        if len(self.requests) > 10000:
            self.requests = defaultdict(deque, {k: v for k, v in self.requests.items() if v and v[-1] >= now - 60})
        uploading = scope['path'] == '/api/v1/recordings' and method == 'POST'
        maximum = int(os.getenv('MAX_UPLOAD_BYTES', '104857600')) if uploading else 32768
        try:
            declared = int(headers.get(b'content-length', b'0'))
        except ValueError:
            declared = maximum + 1
        if declared > maximum:
            return await JSONResponse({'detail': 'Request exceeds the size limit'}, status_code=413)(scope, receive, send)
        size = 0
        async def limited_receive():
            nonlocal size
            message = await receive()
            if message['type'] == 'http.request':
                size += len(message.get('body', b''))
                if size > maximum:
                    raise TooLarge()
            return message
        async def secure_send(message):
            if message['type'] == 'http.response.start':
                message['headers'] += [(b'x-content-type-options', b'nosniff'), (b'cache-control', b'no-store')]
            await send(message)
        try:
            await self.inner(scope, limited_receive, secure_send)
        except TooLarge:
            await JSONResponse({'detail': 'Request exceeds the size limit'}, status_code=413)(scope, receive, send)

app.add_middleware(BoundaryMiddleware)

@app.exception_handler(TooLarge)
async def body_too_large(request, exc):
    return JSONResponse({'detail': 'Request exceeds the size limit'}, status_code=413)
