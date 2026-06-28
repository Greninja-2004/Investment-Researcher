// Polyfill global browser classes that pdfjs/pdf-parse expects in some environments
if (typeof global.DOMMatrix === "undefined") {
  (global as any).DOMMatrix = class DOMMatrix {};
}

const pdf = require("pdf-parse");

export interface DocumentChunk {
  id: string;
  text: string;
  metadata: {
    fileName: string;
    pageNumber?: number;
    chunkIndex: number;
  };
}

// In-memory global store to hold documents for active sessions
// Keys are session/vectorStore IDs, values are array of document chunks
const vectorStores: Record<string, DocumentChunk[]> = {};

/**
 * Parses PDF buffer into raw text
 */
export async function parsePdf(buffer: Buffer): Promise<string> {
  try {
    const data = await pdf(buffer);
    return data.text || "";
  } catch (error) {
    console.error("Error parsing PDF:", error);
    throw new Error("Failed to parse PDF document.");
  }
}

/**
 * Splits text into chunks with overlap, trying to break at sentence boundaries
 */
export function splitTextIntoChunks(
  text: string,
  fileName: string,
  chunkSize: number = 1000,
  chunkOverlap: number = 200
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const normalizedText = text.replace(/\s+/g, " "); // normalize whitespaces
  
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < normalizedText.length) {
    let endIndex = startIndex + chunkSize;
    
    // Try to find a sentence ending (., !, ?) near the end of the chunk to avoid cutting mid-sentence
    if (endIndex < normalizedText.length) {
      const boundaryIndex = normalizedText.slice(endIndex - 100, endIndex + 50).search(/[.!?]\s/);
      if (boundaryIndex !== -1) {
        endIndex = (endIndex - 100) + boundaryIndex + 1;
      }
    }

    const chunkText = normalizedText.slice(startIndex, endIndex).trim();
    if (chunkText.length > 50) { // filter out trivial chunks
      chunks.push({
        id: `${fileName}-chunk-${chunkIndex}`,
        text: chunkText,
        metadata: {
          fileName,
          chunkIndex,
        },
      });
      chunkIndex++;
    }

    startIndex = endIndex - chunkOverlap;
    if (startIndex >= normalizedText.length) break;
  }

  return chunks;
}

/**
 * Indexes chunks into the in-memory store and returns a store ID
 */
export function indexDocument(fileName: string, text: string): string {
  const storeId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const chunks = splitTextIntoChunks(text, fileName);
  vectorStores[storeId] = chunks;
  return storeId;
}

/**
 * Retrieves chunks from store by ID
 */
export function getStoreChunks(storeId: string): DocumentChunk[] {
  return vectorStores[storeId] || [];
}

/**
 * Clean and tokenize text
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(word => word.length > 1);
}

/**
 * Performs TF-IDF Vector Space search on chunks
 */
export function retrieveRelevantChunks(
  storeId: string,
  query: string,
  topK: number = 4
): DocumentChunk[] {
  const chunks = vectorStores[storeId];
  if (!chunks || chunks.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return chunks.slice(0, topK);

  // Compute Document Frequencies (DF) for IDF calculation
  const df: Record<string, number> = {};
  const chunksTokens = chunks.map(chunk => tokenize(chunk.text));
  
  chunksTokens.forEach(tokens => {
    const uniqueTokens = new Set(tokens);
    uniqueTokens.forEach(token => {
      df[token] = (df[token] || 0) + 1;
    });
  });

  // Calculate TF-IDF vectors for each chunk
  const chunkVectors = chunks.map((chunk, index) => {
    const tokens = chunksTokens[index];
    const tf: Record<string, number> = {};
    tokens.forEach(token => {
      tf[token] = (tf[token] || 0) + 1;
    });

    const vector: Record<string, number> = {};
    Object.keys(tf).forEach(token => {
      const docFreq = df[token] || 1;
      const idf = Math.log(chunks.length / docFreq);
      vector[token] = tf[token] * idf;
    });

    return vector;
  });

  // Calculate Query vector
  const queryVector: Record<string, number> = {};
  const queryTf: Record<string, number> = {};
  queryTokens.forEach(token => {
    queryTf[token] = (queryTf[token] || 0) + 1;
  });

  queryTokens.forEach(token => {
    const docFreq = df[token] || 1;
    const idf = Math.log(chunks.length / docFreq);
    queryVector[token] = queryTf[token] * idf;
  });

  // Compute Cosine Similarities
  const similarities = chunks.map((chunk, index) => {
    const chunkVec = chunkVectors[index];
    let dotProduct = 0;
    let queryMagnitude = 0;
    let chunkMagnitude = 0;

    // Union of vocabulary for vector space matching
    const vocab = new Set([...Object.keys(queryVector), ...Object.keys(chunkVec)]);

    vocab.forEach(token => {
      const qVal = queryVector[token] || 0;
      const cVal = chunkVec[token] || 0;
      dotProduct += qVal * cVal;
      queryMagnitude += qVal * qVal;
      chunkMagnitude += cVal * cVal;
    });

    const similarity = 
      queryMagnitude === 0 || chunkMagnitude === 0 
        ? 0 
        : dotProduct / (Math.sqrt(queryMagnitude) * Math.sqrt(chunkMagnitude));

    return { chunk, similarity };
  });

  // Sort and retrieve top K chunks with a positive similarity score
  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .filter(item => item.similarity > 0)
    .map(item => item.chunk)
    .slice(0, topK);
}
