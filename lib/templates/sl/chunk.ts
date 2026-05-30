export interface BatchChunk<T> {
  campaign_id: string;
  batch_id: string;
  chunk_index: number;
  chunk_total: number;
  records: T[];
}

/**
 * Split a list of delivery records into chunks of at most `size`, tagging each
 * with campaign/batch identity so SL can reassemble the campaign as one unit.
 */
export function chunkBatch<T>(
  records: T[],
  campaignId: string,
  batchId: string,
  size = 500,
): BatchChunk<T>[] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const total = Math.ceil(records.length / size);
  const chunks: BatchChunk<T>[] = [];
  for (let i = 0; i < total; i++) {
    chunks.push({
      campaign_id: campaignId,
      batch_id: batchId,
      chunk_index: i,
      chunk_total: total,
      records: records.slice(i * size, (i + 1) * size),
    });
  }
  return chunks;
}
