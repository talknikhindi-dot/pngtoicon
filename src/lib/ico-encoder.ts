/**
 * Simple ICO encoder for browser
 * ICO format: 
 * Header (6 bytes)
 * Directory (16 bytes per image)
 * Image Data (PNG/BMP)
 */
export async function createIco(blobs: Blob[], sizes: number[]): Promise<Blob> {
  const header = new Uint8Array(6);
  header[2] = 1; // Type: Icon
  header[4] = blobs.length; // Number of images
  header[5] = 0;

  const directorySize = 16 * blobs.length;
  const directory = new Uint8Array(directorySize);
  const imageData: Uint8Array[] = [];
  
  let offset = 6 + directorySize;

  for (let i = 0; i < blobs.length; i++) {
    const blob = blobs[i];
    const size = sizes[i];
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    imageData.push(bytes);

    const entry = new Uint8Array(16);
    entry[0] = size >= 256 ? 0 : size; // Width
    entry[1] = size >= 256 ? 0 : size; // Height
    entry[2] = 0; // Palette
    entry[3] = 0; // Reserved
    entry[4] = 1; // Color planes
    entry[5] = 0;
    entry[6] = 32; // Bits per pixel
    entry[7] = 0;
    
    // Size of image data
    const dataSize = bytes.length;
    entry[8] = dataSize & 0xff;
    entry[9] = (dataSize >> 8) & 0xff;
    entry[10] = (dataSize >> 16) & 0xff;
    entry[11] = (dataSize >> 24) & 0xff;

    // Offset of image data
    entry[12] = offset & 0xff;
    entry[13] = (offset >> 8) & 0xff;
    entry[14] = (offset >> 16) & 0xff;
    entry[15] = (offset >> 24) & 0xff;

    directory.set(entry, i * 16);
    offset += dataSize;
  }

  const finalBuffer = new Uint8Array(offset);
  finalBuffer.set(header, 0);
  finalBuffer.set(directory, 6);
  
  let currentOffset = 6 + directorySize;
  for (const data of imageData) {
    finalBuffer.set(data, currentOffset);
    currentOffset += data.length;
  }

  return new Blob([finalBuffer], { type: 'image/x-icon' });
}
