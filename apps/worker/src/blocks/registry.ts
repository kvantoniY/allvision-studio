import type { BlockDefinition } from './types';
import { imageRestoreBlock } from './image-restore';
import { imageUpscaleBlock } from './image-upscale';
import { imageToVideoBlock } from './image-to-video';
import { faceSwapVideoBlock } from './face-swap-video';
import { videoComposeBlock } from './video-compose';
import { textToVideoBlock } from './text-to-video';

export const BLOCK_REGISTRY: Record<string, BlockDefinition> = {
  'image-restore': imageRestoreBlock,
  'image-upscale': imageUpscaleBlock,
  'image-to-video': imageToVideoBlock,
  'face-swap-video': faceSwapVideoBlock,
  'video-compose': videoComposeBlock,
  'text-to-video': textToVideoBlock,
};

export function getBlock(slug: string): BlockDefinition {
  const block = BLOCK_REGISTRY[slug];
  if (!block) throw new Error(`Unknown block: ${slug}`);
  return block;
}

export function listBlocks(): BlockDefinition[] {
  return Object.values(BLOCK_REGISTRY);
}
