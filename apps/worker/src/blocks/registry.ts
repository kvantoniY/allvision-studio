import type { BlockDefinition } from './types';
import { imageRestoreBlock } from './image-restore';
import { imageUpscaleBlock } from './image-upscale';
import { imageToVideoBlock } from './image-to-video';
import { imageEditBlock } from './image-edit';
import { faceSwapVideoBlock } from './face-swap-video';
import { motionTransferBlock } from './motion-transfer';
import { videoComposeBlock } from './video-compose';
import { textToVideoBlock } from './text-to-video';
import { trendVideoTransferBlock } from './trend-video-transfer';
import { sceneTransferBlock } from './scene-transfer';
import { carouselSlidesBlock } from './carousel-slides';
import { productCardBlock } from './product-card';
import { photo2017Block } from './photo-2017';
import { talkingAvatarBlock } from './talking-avatar';
import { videoEffectBlock } from './video-effect';
import { videoWatermarkRemoveBlock } from './video-watermark-remove';
import { videoUpscaleBlock } from './video-upscale';
import { falGenericBlock } from './fal-generic';

export const BLOCK_REGISTRY: Record<string, BlockDefinition> = {
  'image-restore': imageRestoreBlock,
  'image-upscale': imageUpscaleBlock,
  'image-edit': imageEditBlock,
  'image-to-video': imageToVideoBlock,
  'motion-transfer': motionTransferBlock,
  'face-swap-video': faceSwapVideoBlock,
  'video-compose': videoComposeBlock,
  'text-to-video': textToVideoBlock,
  'trend-video-transfer': trendVideoTransferBlock,
  'scene-transfer': sceneTransferBlock,
  'carousel-slides': carouselSlidesBlock,
  'product-card': productCardBlock,
  'photo-2017': photo2017Block,
  'talking-avatar': talkingAvatarBlock,
  'video-effect': videoEffectBlock,
  'video-watermark-remove': videoWatermarkRemoveBlock,
  'video-upscale': videoUpscaleBlock,
  'fal-generic': falGenericBlock,
};

export function getBlock(slug: string): BlockDefinition {
  const block = BLOCK_REGISTRY[slug];
  if (!block) throw new Error(`Unknown block: ${slug}`);
  return block;
}

export function listBlocks(): BlockDefinition[] {
  return Object.values(BLOCK_REGISTRY);
}
