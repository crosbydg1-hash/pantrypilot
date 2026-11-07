"""Signs PantryPilot's photo tool in to Pollinations without copying a key anywhere.
Prints a link; you approve it in your browser; the key is saved to ~/.config/pollinations/agent-key
(readable only by you) and is never printed. Revoke it anytime at https://enter.pollinations.ai/keys
Based on Pollinations' published device sign-in (OAuth 2.0 Device Authorization Grant)."""
import json, os, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

path = Path.home() / '.config/pollinations/agent-key'
if path.exists():
    print('Already signed in. Key file:', path)
    raise SystemExit(0)

def post(route, fields):
    request = urllib.request.Request('https://enter.pollinations.ai' + route,
                                     data=urllib.parse.urlencode(fields).encode(),
                                     headers={'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        return json.load(error)  # "still waiting for approval" comes back as an error response

code = post('/api/device/code', {})
print('Open this link and approve PantryPilot:', code['verification_uri_complete'], flush=True)
interval, deadline = code['interval'], time.monotonic() + code['expires_in']
while time.monotonic() < deadline:
    time.sleep(interval)
    token = post('/api/oauth/token', {'grant_type': 'urn:ietf:params:oauth:grant-type:device_code', 'device_code': code['device_code']})
    if token.get('error') in ('authorization_pending', 'slow_down'):
        if token['error'] == 'slow_down':
            interval += 5
        continue
    if token.get('error'):
        raise SystemExit('Sign-in failed: ' + token['error'])
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as f:
        f.write(token['access_token'])
    print('Signed in. Key saved to', path, flush=True)
    break
else:
    raise SystemExit('The link expired before it was approved. Run this again for a new one.')
