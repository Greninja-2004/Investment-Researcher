import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const companyName = body.companyName || "";
    const vectorStoreId = body.vectorStoreId || null;

    if (!companyName.trim()) {
      return new Response(JSON.stringify({ error: "Missing required body parameter: 'companyName'" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      // Connect to hosted or local FastAPI Python server
      const modelServerUrl = process.env.MODEL_SERVER_URL || "http://localhost:8000";
      const response = await fetch(`${modelServerUrl}/predict/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company_name: companyName,
          vector_store_id: vectorStoreId
        }),
      });

      if (!response.ok) {
        throw new Error(`Python server responded with status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response stream received from the Python server.");
      }

      // Proxy the SSE stream from the python backend directly to the browser
      return new Response(response.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
        },
      });
    } catch (fetchErr) {
      console.error("FastAPI server connection error:", fetchErr);
      
      // If Python server is unreachable, return a clear, user-friendly SSE stream error
      const responseStream = new TransformStream();
      const writer = responseStream.writable.getWriter();
      const encoder = new TextEncoder();
      
      const serverErrorMessage = "Model server not running — start it in your terminal with: ./start.sh or python -m investment_model.inference.server";

      (async () => {
        try {
          writer.write(encoder.encode(`data: ${JSON.stringify({ type: "error", error: serverErrorMessage })}\n\n`));
        } finally {
          writer.close();
        }
      })();

      return new Response(responseStream.readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
        },
      });
    }
  } catch (error: any) {
    console.error("Failed to parse POST body:", error);
    return new Response(JSON.stringify({ error: "Internal server error." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
