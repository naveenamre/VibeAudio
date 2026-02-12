export default {
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Range", 
      "Access-Control-Expose-Headers": "Content-Length, Content-Range",
    };

    // Preflight check (Browser ki inquiry)
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) return new Response("URL parameter missing", { status: 400 });

    // Asli file fetch karo
    const response = await fetch(targetUrl, {
      headers: request.headers // Range headers pass karo seeking ke liye
    });

    // Naya response banao headers ke sath
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        ...Object.fromEntries(response.headers),
        ...corsHeaders
      }
    });
  }
};