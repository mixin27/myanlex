"""Server-side Python 3 example; standard library only, no automatic retry."""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    key = os.environ.get("MYANLEX_API_KEY", "")
    base = os.environ.get("MYANLEX_API_URL", "http://localhost:3001/v1")
    url = urllib.parse.urlsplit(base)
    if (not key or any(ord(c) < 33 or ord(c) > 126 for c in key)
            or not url.hostname or url.username or url.password or url.query or url.fragment
            or (url.scheme != "https" and not (
                url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1", "::1")))):
        raise ValueError("Invalid configuration")
    request = urllib.request.Request(
        base.rstrip("/") + "/syllabify",
        data=json.dumps({"text": "က😀"}, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        method="POST",
    )
    # urllib's timeout is a socket timeout, not the SDK's whole-request deadline.
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=30) as response:
        print(json.dumps(json.load(response), ensure_ascii=False))


try:
    main()
except urllib.error.HTTPError as error:
    print(f"MyanLex returned HTTP {error.code}. No retry was attempted.", file=sys.stderr)
    sys.exit(1)
except Exception:
    print("Request failed. Check MYANLEX_API_KEY, MYANLEX_API_URL and connectivity.", file=sys.stderr)
    sys.exit(1)
