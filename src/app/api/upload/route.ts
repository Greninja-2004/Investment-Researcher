import { NextRequest, NextResponse } from "next/server";
import { parsePdf, indexDocument } from "@/lib/service/ragService";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded in the request." }, { status: 400 });
    }

    const fileName = file.name;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let text = "";
    if (fileName.toLowerCase().endsWith(".pdf")) {
      text = await parsePdf(buffer);
    } else if (fileName.toLowerCase().endsWith(".txt")) {
      text = buffer.toString("utf-8");
    } else {
      return NextResponse.json({ error: "Unsupported file format. Please upload a PDF or TXT file." }, { status: 400 });
    }

    if (!text.trim()) {
      return NextResponse.json({ error: "The uploaded file contains no text." }, { status: 400 });
    }

    // Index the text in our in-memory RAG service
    const vectorStoreId = indexDocument(fileName, text);

    return NextResponse.json({
      success: true,
      vectorStoreId,
      fileName,
      message: "Document successfully parsed and indexed in vector store.",
    });
  } catch (error) {
    console.error("Upload handler failed:", error);
    return NextResponse.json({
      error: `Failed to process uploaded file: ${error instanceof Error ? error.message : String(error)}`,
    }, { status: 500 });
  }
}
