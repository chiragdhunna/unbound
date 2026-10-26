# Optional CORS Proxy for URL Fetching

By default, **Unbound operates 100% in your browser** with zero external network requests and no remote backend.

When fetching web pages directly from the browser (`fetch(url)`), modern browsers enforce **Cross-Origin Resource Sharing (CORS)** policies. If the target server does not send `Access-Control-Allow-Origin` headers allowing your origin, the browser blocks the request.

If a URL is blocked by CORS, Unbound displays an actionable guidance message:
> *"Unable to fetch URL directly due to browser cross-origin restrictions (CORS). To convert this page, save it as an HTML file (.html) or copy-paste its content directly."*

For users who want automated URL fetching across arbitrary websites, you can deploy a lightweight self-hosted proxy and configure Unbound to use it.

---

## Deploying an Optional Cloudflare Worker Proxy

A Cloudflare Worker proxy requires no server maintenance and runs on Cloudflare's free tier.

### `worker.js`

```javascript
export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');

    if (!targetUrl) {
      return new Response('Missing ?url= parameter', { status: 400 });
    }

    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return new Response('Only HTTP and HTTPS URLs are allowed', { status: 400 });
      }

      const response = await fetch(parsed.href, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      const body = await response.text();
      return new Response(body, {
        status: response.status,
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (err) {
      return new Response(`Fetch failed: ${err.message}`, { status: 502 });
    }
  },
};
```

---

## Configuring Unbound to Use Your Proxy

1. Create or edit `.env.local` in your Unbound project directory:
   ```env
   VITE_FETCH_PROXY_URL=https://your-worker-subdomain.workers.dev
   ```
2. Build or restart Unbound:
   ```bash
   npm run build
   ```
3. URL requests entered into Unbound will now route through your proxy:
   `https://your-worker-subdomain.workers.dev?url=https%3A%2F%2Fexample.com`

---

## Privacy Considerations

- **Default Mode (No Proxy):** 100% private. Files and URLs stay local to your machine.
- **Proxy Mode:** Your proxy receives the destination URL and retrieves the HTML on your behalf. HTML parsing, content extraction via Mozilla Readability, and Markdown conversion still happen 100% inside your browser client.
