import type { BlockCategory } from '../blocks/types';

export type PiAPIMediaKind = 'image' | 'video' | 'audio' | 'text';
export type PiAPIOutputKind = 'image' | 'video' | 'audio';
export type PiAPIParamKind = 'select' | 'number' | 'boolean' | 'text' | 'textarea' | 'source-list';
export type PiAPIAudioMode = 'none' | 'generate' | 'input' | 'preserve' | 'postprocess';

export interface PiAPIParamOption {
  value: string;
  label: string;
}

export interface PiAPIParamCapability {
  key: string;
  title: string;
  kind: PiAPIParamKind;
  description?: string;
  options?: PiAPIParamOption[];
  default?: string | number | boolean;
  minimum?: number;
  maximum?: number;
  mediaKind?: Exclude<PiAPIMediaKind, 'text'>;
  multiple?: boolean;
  advanced?: boolean;
}

export interface PiAPIDurationCapability {
  minimum: number;
  maximum: number;
  default: number;
  step?: number;
  options?: number[];
}

export interface PiAPIAudioCapability {
  mode: PiAPIAudioMode;
  booleanParam?: 'enable_audio' | 'generate_audio';
  inputParam?: 'audio_url' | 'audio_urls';
  preserveParam?: 'keep_original_sound';
  description?: string;
}

export interface PiAPIModelCapability {
  slug: string;
  title: string;
  blockSlug: string;
  blockCategory: BlockCategory;
  providerModel: string;
  taskType: string;
  mode?: string;
  providerVersion?: string;
  inputKinds: PiAPIMediaKind[];
  outputKind: PiAPIOutputKind;
  docsUrl: string;
  duration?: PiAPIDurationCapability;
  aspectRatios?: string[];
  resolutions?: string[];
  defaultResolution?: string;
  audio: PiAPIAudioCapability;
  params: PiAPIParamCapability[];
}

const ratioOptions = ['16:9', '9:16', '1:1'].map((value) => ({ value, label: value }));
const ratioAutoOptions = ['auto', '16:9', '9:16', '1:1'].map((value) => ({ value, label: value }));
const videoDuration5to10: PiAPIDurationCapability = { minimum: 5, maximum: 10, default: 5, step: 1, options: [5, 10] };
const videoDuration6to10: PiAPIDurationCapability = { minimum: 6, maximum: 10, default: 6, step: 1, options: [6, 10] };
const seedanceDuration: PiAPIDurationCapability = { minimum: 4, maximum: 15, default: 5, step: 1 };
const veoDuration: PiAPIDurationCapability = { minimum: 4, maximum: 8, default: 8, step: 1, options: [4, 6, 8] };
const soraDuration: PiAPIDurationCapability = { minimum: 4, maximum: 20, default: 10, step: 1, options: [4, 8, 10, 15, 20] };
const wanDuration: PiAPIDurationCapability = { minimum: 5, maximum: 10, default: 5, step: 1, options: [5, 10] };

const promptExpandParam: PiAPIParamCapability = {
  key: 'expand_prompt',
  title: 'Expand prompt',
  kind: 'boolean',
  default: true,
  advanced: true,
};

const negativePromptParam: PiAPIParamCapability = {
  key: 'negative_prompt',
  title: 'Negative prompt',
  kind: 'textarea',
  advanced: true,
};

const seedParam: PiAPIParamCapability = {
  key: 'seed',
  title: 'Seed',
  kind: 'number',
  minimum: 0,
  maximum: 4294967295,
  advanced: true,
};

const imageRefsParam: PiAPIParamCapability = {
  key: 'image_urls',
  title: 'Image references',
  kind: 'source-list',
  mediaKind: 'image',
  multiple: true,
  advanced: true,
};

const videoRefsParam: PiAPIParamCapability = {
  key: 'video_urls',
  title: 'Video references',
  kind: 'source-list',
  mediaKind: 'video',
  multiple: true,
  advanced: true,
};

const audioRefsParam: PiAPIParamCapability = {
  key: 'audio_urls',
  title: 'Audio references',
  kind: 'source-list',
  mediaKind: 'audio',
  multiple: true,
  advanced: true,
};

const audioUrlParam: PiAPIParamCapability = {
  key: 'audio_url',
  title: 'Audio URL',
  kind: 'source-list',
  mediaKind: 'audio',
  multiple: false,
  advanced: true,
};

const tailImageParam: PiAPIParamCapability = {
  key: 'tail_image_url',
  title: 'Last frame',
  kind: 'source-list',
  mediaKind: 'image',
  multiple: false,
  advanced: true,
};

const cameraControlParam: PiAPIParamCapability = {
  key: 'camera_control',
  title: 'Camera control',
  kind: 'select',
  options: [
    { value: '', label: 'Auto' },
    { value: 'horizontal', label: 'Horizontal' },
    { value: 'vertical', label: 'Vertical' },
    { value: 'zoom', label: 'Zoom' },
    { value: 'pan', label: 'Pan' },
    { value: 'tilt', label: 'Tilt' },
    { value: 'roll', label: 'Roll' },
  ],
  default: '',
  advanced: true,
};

const shotTypeParam: PiAPIParamCapability = {
  key: 'shot_type',
  title: 'Shot type',
  kind: 'select',
  options: [
    { value: 'auto', label: 'Auto' },
    { value: 'fixed', label: 'Fixed' },
    { value: 'handheld', label: 'Handheld' },
    { value: 'tracking', label: 'Tracking' },
    { value: 'zoom', label: 'Zoom' },
  ],
  default: 'auto',
  advanced: true,
};

const watermarkParam: PiAPIParamCapability = {
  key: 'watermark',
  title: 'Provider watermark',
  kind: 'boolean',
  default: false,
  advanced: true,
};

const keepOriginalSoundParam: PiAPIParamCapability = {
  key: 'keep_original_sound',
  title: 'Keep original sound',
  kind: 'boolean',
  default: false,
  advanced: true,
};

function klingCapability(params: {
  slug: string;
  title: string;
  mode: 'std' | 'pro';
  version?: string;
  resolution?: string[];
  audio?: PiAPIAudioCapability;
}): PiAPIModelCapability {
  return {
    slug: params.slug,
    title: params.title,
    blockSlug: 'image-to-video',
    blockCategory: 'video',
    providerModel: 'kling',
    taskType: 'video_generation',
    mode: params.mode,
    providerVersion: params.version,
    inputKinds: ['image', 'text'],
    outputKind: 'video',
    docsUrl: params.version === '3.0'
      ? 'https://piapi.ai/docs/kling-api/kling-3-api'
      : 'https://piapi.ai/docs/kling-api/create-task',
    duration: videoDuration5to10,
    aspectRatios: ['auto', '16:9', '9:16', '1:1'],
    resolutions: params.resolution,
    defaultResolution: params.resolution?.[0],
    audio: params.audio ?? { mode: 'none' },
    params: [
      cameraControlParam,
      ...(params.resolution ? [{
        key: 'resolution',
        title: 'Resolution',
        kind: 'select' as const,
        options: params.resolution.map((value) => ({ value, label: value })),
        default: params.resolution[0],
      }] : []),
      ...(params.audio?.booleanParam ? [{
        key: params.audio.booleanParam,
        title: 'Generate audio',
        kind: 'boolean' as const,
        default: false,
      }] : []),
    ],
  };
}

export const PIAPI_MODEL_CAPABILITIES: PiAPIModelCapability[] = [
  {
    slug: 'nano-banana',
    title: 'Nano Banana 2 (Gemini)',
    blockSlug: 'image-edit',
    blockCategory: 'image',
    providerModel: 'gemini',
    taskType: 'nano-banana-2',
    inputKinds: ['text', 'image'],
    outputKind: 'image',
    docsUrl: 'https://piapi.ai/docs/gemini-api/nano-banana-2',
    aspectRatios: ['auto', '1:1', '9:16', '16:9'],
    resolutions: ['1K', '2K', '4K'],
    defaultResolution: '1K',
    audio: { mode: 'none' },
    params: [
      {
        key: 'output_format',
        title: 'Output format',
        kind: 'select',
        options: ['jpg', 'png', 'webp'].map((value) => ({ value, label: value })),
        default: 'jpg',
      },
      {
        key: 'resolution',
        title: 'Resolution',
        kind: 'select',
        options: ['1K', '2K', '4K'].map((value) => ({ value, label: value })),
        default: '1K',
      },
      imageRefsParam,
    ],
  },
  klingCapability({ slug: 'kling-std', title: 'Kling 2.6 Standard', mode: 'std' }),
  klingCapability({
    slug: 'kling-pro',
    title: 'Kling 2.6 Pro',
    mode: 'pro',
    audio: { mode: 'generate', booleanParam: 'enable_audio' },
  }),
  klingCapability({
    slug: 'kling-3-std',
    title: 'Kling 3.0 Standard',
    mode: 'std',
    version: '3.0',
    resolution: ['720p', '1080p'],
    audio: { mode: 'generate', booleanParam: 'enable_audio' },
  }),
  klingCapability({
    slug: 'kling-3-pro',
    title: 'Kling 3.0 Pro',
    mode: 'pro',
    version: '3.0',
    resolution: ['720p', '1080p'],
    audio: { mode: 'none' },
  }),
  {
    slug: 'hailuo-2.3-fast',
    title: 'Hailuo / MiniMax 2.3 Fast',
    blockSlug: 'image-to-video',
    blockCategory: 'video',
    providerModel: 'hailuo',
    taskType: 'video_generation',
    mode: 'v2.3-fast',
    inputKinds: ['image', 'text'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/hailuo-api/generate-video',
    duration: videoDuration6to10,
    resolutions: ['768P', '1080P'],
    defaultResolution: '768P',
    audio: { mode: 'none' },
    params: [
      {
        key: 'resolution',
        title: 'Resolution',
        kind: 'select',
        options: ['768P', '1080P'].map((value) => ({ value, label: value })),
        default: '768P',
      },
      promptExpandParam,
    ],
  },
  {
    slug: 'hailuo-2.3',
    title: 'Hailuo / MiniMax 2.3',
    blockSlug: 'image-to-video',
    blockCategory: 'video',
    providerModel: 'hailuo',
    taskType: 'video_generation',
    mode: 'v2.3',
    inputKinds: ['image', 'text'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/hailuo-api/generate-video',
    duration: videoDuration6to10,
    resolutions: ['768P', '1080P'],
    defaultResolution: '768P',
    audio: { mode: 'none' },
    params: [
      {
        key: 'resolution',
        title: 'Resolution',
        kind: 'select',
        options: ['768P', '1080P'].map((value) => ({ value, label: value })),
        default: '768P',
      },
      promptExpandParam,
    ],
  },
  {
    slug: 'veo-3.1-fast-i2v',
    title: 'Veo 3.1 Fast Image-to-Video',
    blockSlug: 'image-to-video',
    blockCategory: 'video',
    providerModel: 'veo3.1',
    taskType: 'veo3.1-video-fast',
    inputKinds: ['image', 'text'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/veo31-api/image-to-video',
    duration: veoDuration,
    aspectRatios: ['16:9', '9:16', '1:1'],
    resolutions: ['720p'],
    defaultResolution: '720p',
    audio: { mode: 'generate', booleanParam: 'generate_audio' },
    params: [negativePromptParam, tailImageParam],
  },
  {
    slug: 'veo-3.1-i2v',
    title: 'Veo 3.1 Quality Image-to-Video',
    blockSlug: 'image-to-video',
    blockCategory: 'video',
    providerModel: 'veo3.1',
    taskType: 'veo3.1-video',
    inputKinds: ['image', 'text'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/veo31-api/image-to-video',
    duration: veoDuration,
    aspectRatios: ['16:9', '9:16', '1:1'],
    resolutions: ['1080p'],
    defaultResolution: '1080p',
    audio: { mode: 'generate', booleanParam: 'generate_audio' },
    params: [negativePromptParam, tailImageParam],
  },
  {
    slug: 'seedance-2-fast-first-last',
    title: 'Seedance 2 Fast First/Last Frame',
    blockSlug: 'image-to-video',
    blockCategory: 'video',
    providerModel: 'seedance',
    taskType: 'seedance-2-fast',
    mode: 'first_last_frames',
    inputKinds: ['image', 'text'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/seedance-api/seedance-2',
    duration: seedanceDuration,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    audio: { mode: 'none' },
    params: [
      {
        key: 'resolution',
        title: 'Resolution',
        kind: 'select',
        options: ['480p', '720p', '1080p'].map((value) => ({ value, label: value })),
        default: '720p',
      },
      tailImageParam,
      seedParam,
    ],
  },
  {
    slug: 'seedance-2-first-last',
    title: 'Seedance 2 Pro First/Last Frame',
    blockSlug: 'image-to-video',
    blockCategory: 'video',
    providerModel: 'seedance',
    taskType: 'seedance-2',
    mode: 'first_last_frames',
    inputKinds: ['image', 'text'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/seedance-api/seedance-2',
    duration: seedanceDuration,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    audio: { mode: 'none' },
    params: [
      {
        key: 'resolution',
        title: 'Resolution',
        kind: 'select',
        options: ['480p', '720p', '1080p'].map((value) => ({ value, label: value })),
        default: '720p',
      },
      tailImageParam,
      seedParam,
    ],
  },
  {
    slug: 'wan-2.6-i2v',
    title: 'Wan 2.6 Image-to-Video',
    blockSlug: 'image-to-video',
    blockCategory: 'video',
    providerModel: 'wan',
    taskType: 'wan26-i2v',
    inputKinds: ['image', 'text', 'audio'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/wan-api/wan26-image-to-video',
    duration: wanDuration,
    aspectRatios: ['16:9', '9:16', '1:1'],
    resolutions: ['720p', '1080p'],
    defaultResolution: '720p',
    audio: { mode: 'input', inputParam: 'audio_url' },
    params: [
      {
        key: 'resolution',
        title: 'Resolution',
        kind: 'select',
        options: ['720p', '1080p'].map((value) => ({ value, label: value })),
        default: '720p',
      },
      negativePromptParam,
      promptExpandParam,
      shotTypeParam,
      audioUrlParam,
      watermarkParam,
      seedParam,
    ],
  },
  {
    slug: 'seedance-2-fast',
    title: 'Seedance 2 Fast',
    blockSlug: 'text-to-video',
    blockCategory: 'video',
    providerModel: 'seedance',
    taskType: 'seedance-2-fast',
    mode: 'text_to_video',
    inputKinds: ['text'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/seedance-api/seedance-2',
    duration: seedanceDuration,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    audio: { mode: 'none' },
    params: [
      {
        key: 'resolution',
        title: 'Resolution',
        kind: 'select',
        options: ['480p', '720p', '1080p'].map((value) => ({ value, label: value })),
        default: '720p',
      },
      seedParam,
    ],
  },
  {
    slug: 'seedance-2',
    title: 'Seedance 2 Pro',
    blockSlug: 'text-to-video',
    blockCategory: 'video',
    providerModel: 'seedance',
    taskType: 'seedance-2',
    mode: 'text_to_video',
    inputKinds: ['text'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/seedance-api/seedance-2',
    duration: seedanceDuration,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    audio: { mode: 'none' },
    params: [
      {
        key: 'resolution',
        title: 'Resolution',
        kind: 'select',
        options: ['480p', '720p', '1080p'].map((value) => ({ value, label: value })),
        default: '720p',
      },
      seedParam,
    ],
  },
  {
    slug: 'seedance-2-fast-omni',
    title: 'Seedance 2 Fast Omni Reference',
    blockSlug: 'text-to-video',
    blockCategory: 'video',
    providerModel: 'seedance',
    taskType: 'seedance-2-fast',
    mode: 'omni_reference',
    inputKinds: ['text', 'image', 'video', 'audio'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/seedance-api/seedance-2',
    duration: seedanceDuration,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    audio: { mode: 'input', inputParam: 'audio_urls' },
    params: [
      {
        key: 'resolution',
        title: 'Resolution',
        kind: 'select',
        options: ['480p', '720p', '1080p'].map((value) => ({ value, label: value })),
        default: '720p',
      },
      imageRefsParam,
      videoRefsParam,
      audioRefsParam,
      seedParam,
    ],
  },
  {
    slug: 'seedance-2-omni',
    title: 'Seedance 2 Pro Omni Reference',
    blockSlug: 'text-to-video',
    blockCategory: 'video',
    providerModel: 'seedance',
    taskType: 'seedance-2',
    mode: 'omni_reference',
    inputKinds: ['text', 'image', 'video', 'audio'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/seedance-api/seedance-2',
    duration: seedanceDuration,
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'],
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    audio: { mode: 'input', inputParam: 'audio_urls' },
    params: [
      {
        key: 'resolution',
        title: 'Resolution',
        kind: 'select',
        options: ['480p', '720p', '1080p'].map((value) => ({ value, label: value })),
        default: '720p',
      },
      imageRefsParam,
      videoRefsParam,
      audioRefsParam,
      seedParam,
    ],
  },
  {
    slug: 'hailuo-2.3-fast-text',
    title: 'Hailuo / MiniMax 2.3 Fast Text',
    blockSlug: 'text-to-video',
    blockCategory: 'video',
    providerModel: 'hailuo',
    taskType: 'video_generation',
    mode: 'v2.3-fast',
    inputKinds: ['text'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/hailuo-api/generate-video',
    duration: videoDuration6to10,
    resolutions: ['768P', '1080P'],
    defaultResolution: '768P',
    audio: { mode: 'none' },
    params: [
      {
        key: 'resolution',
        title: 'Resolution',
        kind: 'select',
        options: ['768P', '1080P'].map((value) => ({ value, label: value })),
        default: '768P',
      },
      promptExpandParam,
    ],
  },
  {
    slug: 'hailuo-2.3-text',
    title: 'Hailuo / MiniMax 2.3 Text',
    blockSlug: 'text-to-video',
    blockCategory: 'video',
    providerModel: 'hailuo',
    taskType: 'video_generation',
    mode: 'v2.3',
    inputKinds: ['text'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/hailuo-api/generate-video',
    duration: videoDuration6to10,
    resolutions: ['768P', '1080P'],
    defaultResolution: '768P',
    audio: { mode: 'none' },
    params: [
      {
        key: 'resolution',
        title: 'Resolution',
        kind: 'select',
        options: ['768P', '1080P'].map((value) => ({ value, label: value })),
        default: '768P',
      },
      promptExpandParam,
    ],
  },
  {
    slug: 'veo-3.1-fast',
    title: 'Veo 3.1 Fast',
    blockSlug: 'text-to-video',
    blockCategory: 'video',
    providerModel: 'veo3.1',
    taskType: 'veo3.1-video-fast',
    inputKinds: ['text'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/veo31-api/text-to-video',
    duration: veoDuration,
    aspectRatios: ['16:9', '9:16', '1:1'],
    resolutions: ['720p'],
    defaultResolution: '720p',
    audio: { mode: 'generate', booleanParam: 'generate_audio' },
    params: [negativePromptParam],
  },
  {
    slug: 'veo-3.1',
    title: 'Veo 3.1 Quality',
    blockSlug: 'text-to-video',
    blockCategory: 'video',
    providerModel: 'veo3.1',
    taskType: 'veo3.1-video',
    inputKinds: ['text'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/veo31-api/text-to-video',
    duration: veoDuration,
    aspectRatios: ['16:9', '9:16', '1:1'],
    resolutions: ['1080p'],
    defaultResolution: '1080p',
    audio: { mode: 'generate', booleanParam: 'generate_audio' },
    params: [negativePromptParam],
  },
  {
    slug: 'wan-2.6',
    title: 'Wan 2.6 Text-to-Video',
    blockSlug: 'text-to-video',
    blockCategory: 'video',
    providerModel: 'wan',
    taskType: 'wan26-t2v',
    inputKinds: ['text', 'audio'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/wan-api/wan26-text-to-video',
    duration: wanDuration,
    aspectRatios: ['16:9', '9:16', '1:1'],
    resolutions: ['720p', '1080p'],
    defaultResolution: '720p',
    audio: { mode: 'input', inputParam: 'audio_url' },
    params: [
      {
        key: 'resolution',
        title: 'Resolution',
        kind: 'select',
        options: ['720p', '1080p'].map((value) => ({ value, label: value })),
        default: '720p',
      },
      negativePromptParam,
      promptExpandParam,
      shotTypeParam,
      audioUrlParam,
      watermarkParam,
      seedParam,
    ],
  },
  {
    slug: 'sora-2',
    title: 'Sora 2',
    blockSlug: 'text-to-video',
    blockCategory: 'video',
    providerModel: 'sora2',
    taskType: 'sora2-video',
    inputKinds: ['text'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/sora2-api/text-to-video',
    duration: soraDuration,
    aspectRatios: ['16:9', '9:16'],
    resolutions: ['720p'],
    defaultResolution: '720p',
    audio: { mode: 'none' },
    params: [],
  },
  {
    slug: 'sora-2-pro',
    title: 'Sora 2 Pro',
    blockSlug: 'text-to-video',
    blockCategory: 'video',
    providerModel: 'sora2',
    taskType: 'sora2-pro-video',
    inputKinds: ['text'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/sora2-pro-api/text-to-video',
    duration: soraDuration,
    aspectRatios: ['16:9', '9:16'],
    resolutions: ['720p', '1080p'],
    defaultResolution: '720p',
    audio: { mode: 'none' },
    params: [],
  },
  {
    slug: 'kling-motion-2.6-std',
    title: 'Kling Motion Control 2.6 Standard',
    blockSlug: 'motion-transfer',
    blockCategory: 'motion',
    providerModel: 'kling',
    taskType: 'motion_control',
    mode: 'std',
    inputKinds: ['image', 'video', 'text'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/kling-api/kling-motion-control-api',
    duration: videoDuration5to10,
    aspectRatios: ['auto', '16:9', '9:16', '1:1'],
    audio: { mode: 'preserve', preserveParam: 'keep_original_sound' },
    params: [keepOriginalSoundParam],
  },
  {
    slug: 'kling-motion-2.6-pro',
    title: 'Kling Motion Control 2.6 Pro',
    blockSlug: 'motion-transfer',
    blockCategory: 'motion',
    providerModel: 'kling',
    taskType: 'motion_control',
    mode: 'pro',
    inputKinds: ['image', 'video', 'text'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/kling-api/kling-motion-control-api',
    duration: videoDuration5to10,
    aspectRatios: ['auto', '16:9', '9:16', '1:1'],
    audio: { mode: 'preserve', preserveParam: 'keep_original_sound' },
    params: [keepOriginalSoundParam],
  },
  {
    slug: 'kling-motion-3.0-std',
    title: 'Kling Motion Control 3.0 Standard',
    blockSlug: 'motion-transfer',
    blockCategory: 'motion',
    providerModel: 'kling',
    taskType: 'motion_control',
    mode: 'std',
    providerVersion: '3.0',
    inputKinds: ['image', 'video', 'text'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/kling-api/kling-motion-control-api',
    duration: videoDuration5to10,
    aspectRatios: ['auto', '16:9', '9:16', '1:1'],
    resolutions: ['720p', '1080p'],
    defaultResolution: '720p',
    audio: { mode: 'preserve', preserveParam: 'keep_original_sound' },
    params: [
      {
        key: 'resolution',
        title: 'Resolution',
        kind: 'select',
        options: ['720p', '1080p'].map((value) => ({ value, label: value })),
        default: '720p',
      },
      keepOriginalSoundParam,
    ],
  },
  {
    slug: 'kling-motion-3.0-pro',
    title: 'Kling Motion Control 3.0 Pro',
    blockSlug: 'motion-transfer',
    blockCategory: 'motion',
    providerModel: 'kling',
    taskType: 'motion_control',
    mode: 'pro',
    providerVersion: '3.0',
    inputKinds: ['image', 'video', 'text'],
    outputKind: 'video',
    docsUrl: 'https://piapi.ai/docs/kling-api/kling-motion-control-api',
    duration: videoDuration5to10,
    aspectRatios: ['auto', '16:9', '9:16', '1:1'],
    resolutions: ['720p', '1080p'],
    defaultResolution: '720p',
    audio: { mode: 'preserve', preserveParam: 'keep_original_sound' },
    params: [
      {
        key: 'resolution',
        title: 'Resolution',
        kind: 'select',
        options: ['720p', '1080p'].map((value) => ({ value, label: value })),
        default: '720p',
      },
      keepOriginalSoundParam,
    ],
  },
];

export function getPiAPIModelCapability(slug: string): PiAPIModelCapability | undefined {
  return PIAPI_MODEL_CAPABILITIES.find((capability) => capability.slug === slug);
}

export function listPiAPIModelCapabilities(blockSlug?: string): PiAPIModelCapability[] {
  return blockSlug
    ? PIAPI_MODEL_CAPABILITIES.filter((capability) => capability.blockSlug === blockSlug)
    : PIAPI_MODEL_CAPABILITIES;
}

export function capabilityDurationOptions(capability: PiAPIModelCapability): number[] {
  if (!capability.duration) return [];
  if (capability.duration.options?.length) return capability.duration.options;
  const step = capability.duration.step ?? 1;
  const options: number[] = [];
  for (let value = capability.duration.minimum; value <= capability.duration.maximum; value += step) {
    options.push(value);
  }
  return options;
}

export function capabilityParamKeys(capability: PiAPIModelCapability): string[] {
  return capability.params.map((param) => param.key);
}
