import { NextRequest, NextResponse } from "next/server";

const PEXELS_KEY = process.env.PEXELS_API_KEY;

/**
 * API route proxy để tránh CORS khi gọi Pexels API
 * GET /api/images/pexels?query=word
 * Cho phép cả guest và authenticated users sử dụng
 */
export async function GET(request: NextRequest) {
  try {
    if (!PEXELS_KEY) {
      console.error("Pexels: PEXELS_API_KEY is not set");
      return NextResponse.json(
        { error: "Image search is not configured" },
        { status: 503 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("query");

    if (!query) {
      return NextResponse.json(
        { error: "Query parameter is required" },
        { status: 400 }
      );
    }

    // Gọi Pexels API từ server-side (không bị CORS)
    const pexelsUrl = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`;
    
    const response = await fetch(pexelsUrl, {
      headers: {
        Authorization: PEXELS_KEY, // Pexels API chỉ cần API key, không cần "Bearer"
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch image from Pexels" },
        { status: response.status }
      );
    }

    const data = await response.json();
    const imgUrl = data.photos?.[0]?.src?.medium || null;

    return NextResponse.json({ imageUrl: imgUrl });
  } catch (error) {
    console.error("Pexels proxy error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
